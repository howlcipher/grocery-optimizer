from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence.database import SessionLocal
from app.seed.seeder import seed_database


@pytest.fixture(scope="module")
def client():
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_create_and_get_price_observation(client):
    today_str = date.today().isoformat()
    # 1. Create valid observation
    payload = {
        "product_id": "prod-milk-gal",
        "store_name": "Meijer - Rochester",
        "price_cents": 349,  # $3.49
        "observation_date": today_str,
        "is_promotional": False,
        "notes": "Regular price in dairy aisle",
    }
    res = client.post("/api/price-observations", json=payload)
    assert res.status_code == 201
    data = res.json()
    obs_id = data["id"]
    assert data["product_id"] == "prod-milk-gal"
    assert data["product_name"] == "Whole Milk"
    assert data["store_name"] == "Meijer - Rochester"
    assert data["price_cents"] == 349
    assert data["formatted_price"] == "$3.49"
    assert data["observation_date"] == today_str
    assert data["is_stale"] is False
    assert data["source"] == "user_contributed"
    assert "User-entered observation" in data["source_attribution"]

    # 2. Get list of observations
    res = client.get("/api/price-observations?product_id=prod-milk-gal")
    assert res.status_code == 200
    obs_list = res.json()
    assert any(o["id"] == obs_id for o in obs_list)


def test_price_observation_validation_bounds(client):
    today_str = date.today().isoformat()

    # Reject non-existent product
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "non-existent-product",
            "store_name": "Kroger",
            "price_cents": 299,
            "observation_date": today_str,
        },
    )
    assert res.status_code == 400
    assert "not found" in res.json()["detail"].lower()

    # Reject zero price
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger",
            "price_cents": 0,
            "observation_date": today_str,
        },
    )
    assert res.status_code == 422

    # Reject negative price
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger",
            "price_cents": -100,
            "observation_date": today_str,
        },
    )
    assert res.status_code == 422

    # Reject implausibly high price (> $500.00 / 50000 cents)
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger",
            "price_cents": 50001,
            "observation_date": today_str,
        },
    )
    assert res.status_code == 422

    # Reject future observation date
    future_date = (date.today() + timedelta(days=2)).isoformat()
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger",
            "price_cents": 299,
            "observation_date": future_date,
        },
    )
    assert res.status_code == 422
    assert "future" in res.json()["detail"].lower()

    # Reject observation date older than 365 days
    ancient_date = (date.today() - timedelta(days=400)).isoformat()
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger",
            "price_cents": 299,
            "observation_date": ancient_date,
        },
    )
    assert res.status_code == 422
    assert "older than one year" in res.json()["detail"].lower()


def test_duplicate_and_correction_handling(client):
    today_str = date.today().isoformat()
    store_name = "ALDI - Rochester Hills"

    # Initial submission
    res1 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-eggs-dozen",
            "store_name": store_name,
            "price_cents": 249,
            "observation_date": today_str,
            "notes": "First submission",
        },
    )
    assert res1.status_code == 201
    id1 = res1.json()["id"]

    # Duplicate submission for same product, store, and date -> updates/corrects existing record
    res2 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-eggs-dozen",
            "store_name": store_name,
            "price_cents": 219,  # corrected price
            "observation_date": today_str,
            "notes": "Corrected price",
        },
    )
    assert res2.status_code == 201
    assert res2.json()["id"] == id1  # Same record updated
    assert res2.json()["price_cents"] == 219
    assert res2.json()["notes"] == "Corrected price"

    # Explicit PATCH to correct entry
    res3 = client.patch(
        f"/api/price-observations/{id1}",
        json={"price_cents": 199, "is_promotional": True},
    )
    assert res3.status_code == 200
    assert res3.json()["price_cents"] == 199
    assert res3.json()["is_promotional"] is True


def test_stale_observation_flagging(client):
    # Observation from 45 days ago should be marked as is_stale=True
    stale_date = (date.today() - timedelta(days=45)).isoformat()
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-bread-white",
            "store_name": "Costco",
            "price_cents": 399,
            "observation_date": stale_date,
        },
    )
    assert res.status_code == 201
    assert res.json()["is_stale"] is True


def test_compare_product_store_prices(client):
    today_str = date.today().isoformat()
    pid = "prod-cheerios-18"

    # Add observations at two different stores
    client.post(
        "/api/price-observations",
        json={
            "product_id": pid,
            "store_name": "Store Alpha",
            "price_cents": 499,
            "observation_date": today_str,
        },
    )
    client.post(
        "/api/price-observations",
        json={
            "product_id": pid,
            "store_name": "Store Beta",
            "price_cents": 429,
            "observation_date": today_str,
        },
    )

    res = client.get(f"/api/products/{pid}/prices")
    assert res.status_code == 200
    data = res.json()

    assert data["product"]["id"] == pid
    assert data["source"] == "user_contributed"
    assert data["store_count"] >= 2
    assert len(data["observations"]) >= 2
    # Cheapest should be first ($4.29 from Store Beta)
    assert data["cheapest_observation"]["price_cents"] == 429
    assert data["cheapest_observation"]["store_name"] == "Store Beta"
    assert "disclaimer" in data


def test_delete_price_observation(client):
    today_str = date.today().isoformat()
    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-butter",
            "store_name": "Trader Joes",
            "price_cents": 399,
            "observation_date": today_str,
        },
    )
    assert res.status_code == 201
    obs_id = res.json()["id"]

    del_res = client.delete(f"/api/price-observations/{obs_id}")
    assert del_res.status_code == 200
    assert del_res.json() == {"status": "deleted", "id": obs_id}

    # Verify not found now
    patch_res = client.patch(f"/api/price-observations/{obs_id}", json={"price_cents": 349})
    assert patch_res.status_code == 404


def test_multi_source_comparison_separation(client):
    # Create list with milk
    res = client.post("/api/lists", json={"name": "Source Separation Test"})
    list_id = res.json()["id"]
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 1})

    # 1. Compare using demonstration mode
    res_demo = client.post(f"/api/lists/{list_id}/compare?source=demonstration")
    assert res_demo.status_code == 200
    demo_data = res_demo.json()
    assert demo_data["pricing_source"] == "demonstration"
    assert demo_data["is_demonstration"] is True
    assert demo_data["one_store_plan"]["is_complete"] is True

    # 2. Compare using user_contributed mode when missing complete basket
    # Add an unavailable item to list (Dragonfruit)
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-dragonfruit", "quantity": 1})
    res_user = client.post(f"/api/lists/{list_id}/compare?source=user_contributed")
    assert res_user.status_code == 200
    user_data = res_user.json()
    assert user_data["pricing_source"] == "user_contributed"
    assert user_data["is_demonstration"] is False
    assert user_data["best_plan"]["is_complete"] is False
    assert "never mix" in user_data["data_notice"].lower()
    # Missing product is reported
    missing_ids = [p["id"] for p in user_data["best_plan"]["missing_products"]]
    assert "prod-dragonfruit" in missing_ids
