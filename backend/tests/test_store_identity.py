"""Store Identity, Locality, Batch Trip Entry, and Geographic Comparison Tests (Phases 2, 3, 4).

Verifies:
1. Physical store distinction: retailer brand is identified separately from store location.
2. Locality support: stores support address, city, state, and ZIP code.
3. No silent merging: stores in different ZIP codes (e.g. 48042 vs 48316) are never conflated under the same retailer name.
4. Duplicate normalization: observations for the same retailer and physical address/ZIP reuse the existing physical store record.
5. Unresolved location tagging: stores submitted without locality are flagged with is_unresolved_location=True and excluded from localized comparisons.
6. Geographic filtering in shopping plan comparison: comparison restricted to ZIP 48042 only evaluates stores in that ZIP.
7. Multi-item trip observation recording: single-request batch recording for rapid grocery trip submission.
8. Conflict resolution: multi-contributor consensus and promotional price handling.
"""
from datetime import date

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


def test_stores_listing_and_filtering(client):
    """Verify GET /api/stores endpoint returns locality metadata and filters by ZIP/query."""
    # Seed a localized store via observation
    client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Meijer #206 - Lenox",
            "retailer_name": "Meijer",
            "address": "36865 26 Mile Rd",
            "city": "Lenox",
            "state": "MI",
            "zip_code": "48042",
            "price_cents": 349,
            "observation_date": date.today().isoformat(),
        },
    )

    # 1. Query all stores
    res_all = client.get("/api/stores")
    assert res_all.status_code == 200
    stores = res_all.json()
    assert len(stores) >= 3

    # 2. Filter by ZIP 48042
    res_zip = client.get("/api/stores?zip_code=48042")
    assert res_zip.status_code == 200
    zip_stores = res_zip.json()
    assert len(zip_stores) >= 1
    assert any(s["zip_code"] == "48042" for s in zip_stores)
    assert all(s["zip_code"] == "48042" for s in zip_stores)

    # 3. Filter by search query
    res_q = client.get("/api/stores?q=lenox")
    assert res_q.status_code == 200
    assert any("lenox" in s["name"].lower() or "lenox" in (s["city"] or "").lower() for s in res_q.json())


def test_no_silent_merging_across_different_physical_locations(client):
    """Verify that stores with the same retailer name in different ZIP codes are NOT merged."""
    today_str = date.today().isoformat()

    # Store 1: Kroger in ZIP 48042 (pilot region)
    res_loc1 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger - 26 Mile",
            "retailer_name": "Kroger",
            "address": "36865 26 Mile Rd",
            "city": "Lenox",
            "state": "MI",
            "zip_code": "48042",
            "price_cents": 329,
            "observation_date": today_str,
        },
    )
    assert res_loc1.status_code == 201
    store_1_id = res_loc1.json()["store_id"]

    # Store 2: Kroger in ZIP 48316 (Shelby Twp)
    res_loc2 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger - 25 Mile",
            "retailer_name": "Kroger",
            "address": "2058 25 Mile Rd",
            "city": "Shelby Twp",
            "state": "MI",
            "zip_code": "48316",
            "price_cents": 319,
            "observation_date": today_str,
        },
    )
    assert res_loc2.status_code == 201
    store_2_id = res_loc2.json()["store_id"]

    # DISTINCT PHYSICAL STORES: Must NOT have been merged!
    assert store_1_id != store_2_id


def test_duplicate_store_reuse_same_location(client):
    """Verify that observations for the same retailer and ZIP reuse the store record."""
    today_str = date.today().isoformat()

    res1 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-eggs-dozen",
            "store_name": "ALDI - Chesterfield",
            "retailer_name": "ALDI",
            "address": "51300 Gratiot Ave",
            "city": "Chesterfield",
            "state": "MI",
            "zip_code": "48051",
            "price_cents": 219,
            "observation_date": today_str,
        },
    )
    assert res1.status_code == 201
    store_id_1 = res1.json()["store_id"]

    # Another item at the same physical store
    res2 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-butter",
            "store_name": "ALDI - Chesterfield",
            "retailer_name": "ALDI",
            "address": "51300 Gratiot Ave",
            "city": "Chesterfield",
            "state": "MI",
            "zip_code": "48051",
            "price_cents": 349,
            "observation_date": today_str,
        },
    )
    assert res2.status_code == 201
    store_id_2 = res2.json()["store_id"]

    # Safe deduplication: Reuses same physical store ID
    assert store_id_1 == store_id_2


def test_unresolved_location_tagging(client):
    """Verify that arbitrary store names without location are flagged as unresolved."""
    today_str = date.today().isoformat()

    res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Corner Bodega Without Location",
            "price_cents": 499,
            "observation_date": today_str,
        },
    )
    assert res.status_code == 201
    obs_data = res.json()
    assert obs_data["is_unresolved_location"] is True
    assert obs_data["store_zip_code"] is None


def test_batch_trip_observation_recording(client):
    """Verify single-request batch recording for rapid 5-item shopping trip entry."""
    today_str = date.today().isoformat()

    trip_payload = {
        "store_name": "Meijer #206 - Macomb",
        "retailer_name": "Meijer",
        "address": "36865 26 Mile Rd",
        "city": "Lenox",
        "state": "MI",
        "zip_code": "48042",
        "observation_date": today_str,
        "items": [
            {"product_id": "prod-milk-gal", "price_cents": 349, "is_promotional": False},
            {"product_id": "prod-eggs-dozen", "price_cents": 229, "is_promotional": False},
            {"product_id": "prod-butter", "price_cents": 379, "is_promotional": True, "notes": "Weekly sale"},
            {"product_id": "prod-bread-white", "price_cents": 199, "is_promotional": False},
            {"product_id": "prod-bananas", "price_cents": 59, "is_promotional": False},
        ],
    }

    res = client.post("/api/price-observations/batch", json=trip_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["created_count"] == 5
    assert len(data["observations"]) == 5
    assert data["store"]["zip_code"] == "48042"

    # Verify each observation received its own cryptographic edit token
    for obs in data["observations"]:
        assert obs["edit_token"] is not None
        assert obs["store_zip_code"] == "48042"


def test_geographic_filtered_price_comparison(client):
    """Verify that basket price comparison filters strictly to specified ZIP code."""
    today_str = date.today().isoformat()

    # Create list with milk and eggs
    list_res = client.post("/api/lists", json={"name": "Geographic Comparison Test"})
    list_id = list_res.json()["id"]
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 1})
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-eggs-dozen", "quantity": 1})

    # Seed observations in ZIP 48042
    client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Meijer - 48042",
            "zip_code": "48042",
            "price_cents": 349,
            "observation_date": today_str,
        },
    )
    client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-eggs-dozen",
            "store_name": "Meijer - 48042",
            "zip_code": "48042",
            "price_cents": 249,
            "observation_date": today_str,
        },
    )

    # Also seed a cheaper price in distant ZIP 48316
    client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger - 48316",
            "zip_code": "48316",
            "price_cents": 299,
            "observation_date": today_str,
        },
    )

    # 1. Compare without ZIP filter -> evaluates across all user stores
    res_unfiltered = client.post(f"/api/lists/{list_id}/compare?source=user_contributed")
    assert res_unfiltered.status_code == 200

    # 2. Compare with ZIP 48042 filter -> MUST only include stores in 48042
    res_filtered = client.post(f"/api/lists/{list_id}/compare?source=user_contributed&zip_code=48042")
    assert res_filtered.status_code == 200
    data = res_filtered.json()
    assert data["zip_code"] == "48042"
    assert "48042" in data["data_notice"]

    # All stores in the generated plans must have zip_code == "48042"
    for store in data["best_plan"]["stores"]:
        assert store["zip_code"] == "48042"


def test_conflict_resolution_and_promotional_handling(client):
    """Verify that multiple contributor reports on the same date resolve consensus

    and promotional prices are distinguished from regular shelf prices.
    """
    from app.persistence.database import SessionLocal
    from app.providers.user_contributed import UserContributedRetailerProvider

    today_str = date.today().isoformat()
    store_name_1 = "Consensus Test Store A"
    store_name_2 = "Consensus Test Store B"

    # Store A: Contributor 1 reports regular shelf price $3.49
    res_a1 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-oj-52",
            "store_name": store_name_1,
            "price_cents": 349,
            "observation_date": today_str,
            "is_promotional": False,
        },
    )
    assert res_a1.status_code == 201
    store_a_id = res_a1.json()["store_id"]

    # Store A: Contributor 2 reports promotional sale price $2.99 on the same date
    res_a2 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-oj-52",
            "store_name": store_name_1,
            "price_cents": 299,
            "observation_date": today_str,
            "is_promotional": True,
        },
    )
    assert res_a2.status_code == 201

    # Store B: Reports regular price $3.79
    res_b = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-oj-52",
            "store_name": store_name_2,
            "price_cents": 379,
            "observation_date": today_str,
            "is_promotional": False,
        },
    )
    assert res_b.status_code == 201

    # 1. Test Provider Resolution: Preserves regular price AND promotional sale price
    db = SessionLocal()
    try:
        provider = UserContributedRetailerProvider(db=db)
        offers = provider.get_offers(product_ids=["prod-oj-52"], store_ids=[store_a_id])
        assert len(offers) == 1
        offer = offers[0]
        assert offer.regular_price_cents == 349
        assert offer.promotional_price_cents == 299
        assert offer.effective_price_cents == 299
        assert offer.is_on_sale is True
        assert "regular shelf and promo observed" in offer.source_attribution
    finally:
        db.close()

    # 2. Cross-store price comparison view returns latest offers across distinct stores
    res = client.get("/api/products/prod-oj-52/prices")
    assert res.status_code == 200
    data = res.json()
    assert len(data["observations"]) >= 2
    # Cheapest is the promo observation ($2.99 at Store A)
    assert data["cheapest_observation"]["price_cents"] == 299
    assert data["cheapest_observation"]["is_promotional"] is True
