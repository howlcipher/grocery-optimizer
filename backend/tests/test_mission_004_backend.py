from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.rate_limiter import batch_limiter, observation_limiter
from app.main import create_app
from app.persistence.database import SessionLocal
from app.persistence.models import PriceObservationModel, ProductModel


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    # Reset rate limiters for fresh test runs
    observation_limiter.reset()
    batch_limiter.reset()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    observation_limiter.reset()
    batch_limiter.reset()


def test_rate_limiting_single_observations(client, db_session):
    """Verify sliding window rate limiting throttles excessive single POST requests."""
    product = db_session.query(ProductModel).first()
    assert product is not None

    payload = {
        "product_id": product.id,
        "store_name": "Test Store",
        "price_cents": 299,
        "observation_date": date.today().isoformat(),
    }

    # observation_limiter limit is 60 requests per minute
    # Exhaust the limit
    for _ in range(60):
        resp = client.post("/api/price-observations", json=payload)
        assert resp.status_code == 201

    # 61st request should be rate-limited
    blocked_resp = client.post("/api/price-observations", json=payload)
    assert blocked_resp.status_code == 429
    assert "rate limit exceeded" in blocked_resp.json()["detail"].lower()


def test_rate_limiting_batch_observations(client, db_session):
    """Verify sliding window rate limiting throttles excessive batch requests."""
    product = db_session.query(ProductModel).first()
    assert product is not None

    payload = {
        "store_name": "Batch Store",
        "observation_date": date.today().isoformat(),
        "items": [{"product_id": product.id, "price_cents": 199}],
    }

    # batch_limiter limit is 20 requests per minute
    for _ in range(20):
        resp = client.post("/api/price-observations/batch", json=payload)
        assert resp.status_code == 201

    # 21st request must trigger 429
    blocked_resp = client.post("/api/price-observations/batch", json=payload)
    assert blocked_resp.status_code == 429
    assert "rate limit exceeded" in blocked_resp.json()["detail"].lower()


def test_batch_atomic_validation_and_rollback(client, db_session):
    """Verify batch contributions fail atomically if any item has an invalid product, price, or duplicate."""
    product = db_session.query(ProductModel).first()
    assert product is not None

    initial_obs_count = db_session.query(PriceObservationModel).count()

    # 1. Invalid product in batch (e.g. unknown product ID)
    bad_product_payload = {
        "store_name": "Rollback Store",
        "observation_date": date.today().isoformat(),
        "items": [
            {"product_id": product.id, "price_cents": 299},
            {"product_id": "non-existent-product-id-xyz", "price_cents": 399},
        ],
    }
    resp = client.post("/api/price-observations/batch", json=bad_product_payload)
    assert resp.status_code == 404
    assert "canonical catalog" in resp.json()["detail"]
    # Verify complete rollback: no observations were added
    assert db_session.query(PriceObservationModel).count() == initial_obs_count

    # 2. Duplicate product within the same batch
    duplicate_payload = {
        "store_name": "Rollback Store",
        "observation_date": date.today().isoformat(),
        "items": [
            {"product_id": product.id, "price_cents": 299},
            {"product_id": product.id, "price_cents": 349},
        ],
    }
    resp = client.post("/api/price-observations/batch", json=duplicate_payload)
    assert resp.status_code == 400
    assert "duplicate" in resp.json()["detail"].lower()
    assert db_session.query(PriceObservationModel).count() == initial_obs_count

    # 3. Invalid price bounds in batch item
    bad_price_payload = {
        "store_name": "Rollback Store",
        "observation_date": date.today().isoformat(),
        "items": [
            {"product_id": product.id, "price_cents": 999999},  # exceeds $500.00
        ],
    }
    resp = client.post("/api/price-observations/batch", json=bad_price_payload)
    assert resp.status_code == 422
    assert db_session.query(PriceObservationModel).count() == initial_obs_count


def test_regional_and_neighborhood_pilot_comparison(client, db_session):
    """Verify comparing lists with region_scope=neighborhood includes adjacent pilot ZIP stores."""
    # Seed products
    products = db_session.query(ProductModel).limit(2).all()
    assert len(products) >= 2
    p1, p2 = products[0], products[1]

    # Create a grocery list with both products
    list_resp = client.post("/api/lists", json={"name": "Regional Comparison Trip"})
    assert list_resp.status_code == 201
    list_id = list_resp.json()["id"]

    client.post(f"/api/lists/{list_id}/items", json={"product_id": p1.id, "quantity": 1})
    client.post(f"/api/lists/{list_id}/items", json={"product_id": p2.id, "quantity": 1})

    # Record physical store in 48042 (Lenox)
    batch_48042 = {
        "store_name": "Meijer #123",
        "address": "36865 26 Mile Rd",
        "city": "Lenox",
        "state": "MI",
        "zip_code": "48042",
        "latitude": 42.7214,
        "longitude": -82.8312,
        "observation_date": date.today().isoformat(),
        "items": [
            {"product_id": p1.id, "price_cents": 250},
            {"product_id": p2.id, "price_cents": 300},
        ],
    }
    resp = client.post("/api/price-observations/batch", json=batch_48042)
    assert resp.status_code == 201
    store_48042_id = resp.json()["store"]["id"]

    # Record physical store in adjacent pilot ZIP 48051 (Chesterfield)
    batch_48051 = {
        "store_name": "Kroger #456",
        "address": "50555 Gratiot Ave",
        "city": "Chesterfield",
        "state": "MI",
        "zip_code": "48051",
        "latitude": 42.6841,
        "longitude": -82.8420,
        "observation_date": date.today().isoformat(),
        "items": [
            {"product_id": p1.id, "price_cents": 220},  # Cheaper p1 at Kroger
            {"product_id": p2.id, "price_cents": 280},  # Cheaper p2 at Kroger
        ],
    }
    resp = client.post("/api/price-observations/batch", json=batch_48051)
    assert resp.status_code == 201
    store_48051_id = resp.json()["store"]["id"]

    # 1. Compare with exact ZIP = 48042
    exact_resp = client.post(
        f"/api/lists/{list_id}/compare?source=user_contributed&zip_code=48042&region_scope=exact"
    )
    assert exact_resp.status_code == 200
    exact_data = exact_resp.json()
    assert exact_data["region_scope"] == "exact"
    assert exact_data["compared_zip_codes"] == ["48042"]
    # Only Meijer in 48042 should be in the plan
    exact_store_ids = [s["id"] for s in exact_data["best_plan"]["stores"]]
    assert store_48042_id in exact_store_ids
    assert store_48051_id not in exact_store_ids

    # 2. Compare with neighborhood region_scope for 48042 (pilot includes 48042, 48051, 48315)
    neighborhood_resp = client.post(
        f"/api/lists/{list_id}/compare?source=user_contributed&zip_code=48042&region_scope=neighborhood"
    )
    assert neighborhood_resp.status_code == 200
    neigh_data = neighborhood_resp.json()
    assert neigh_data["region_scope"] == "neighborhood"
    assert "48042" in neigh_data["compared_zip_codes"]
    assert "48051" in neigh_data["compared_zip_codes"]
    # The cheaper store in 48051 should now be eligible and selected as the cheaper 1-store plan
    neigh_best_store_ids = [s["id"] for s in neigh_data["best_plan"]["stores"]]
    assert store_48051_id in neigh_best_store_ids
    assert neigh_data["best_plan"]["total_cents"] == 500  # 220 + 280
