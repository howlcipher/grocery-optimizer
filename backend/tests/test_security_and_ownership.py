"""Security and Ownership Verification Tests (Finding A & C Resolution).

Verifies:
1. Unauthorized PATCH attempt without edit token or with invalid token is rejected with 403 Forbidden.
2. Unauthorized DELETE attempt without edit token or with invalid token is rejected with 403 Forbidden.
3. Cross-contributor overwriting on POST duplicate is strictly prevented:
   Shopper B cannot overwrite Shopper A's observation on the same product, store, and date.
4. Authorized modification (PATCH) with valid capability edit token succeeds with 200 OK.
5. Authorized deletion (DELETE) with valid capability edit token succeeds with 200 OK.
6. Public read endpoints (GET /price-observations, GET /products/{id}/prices) strictly omit
   edit tokens and hashes to prevent capability leakage.
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


def test_unauthorized_patch_rejected(client):
    """Verify unauthorized modification is rejected with 403 Forbidden."""
    today_str = date.today().isoformat()

    # Shopper A records $4.50
    res_a = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Meijer - Shelby Twp",
            "price_cents": 450,
            "observation_date": today_str,
            "contributor_id": "shopper-a-uuid",
        },
    )
    assert res_a.status_code == 201
    obs_id = res_a.json()["id"]
    token_a = res_a.json()["edit_token"]
    assert token_a is not None

    # Shopper B without token attempts to change price
    res_b_no_token = client.patch(
        f"/api/price-observations/{obs_id}",
        json={"price_cents": 100},
    )
    assert res_b_no_token.status_code == 403
    assert "edit token" in res_b_no_token.json()["detail"].lower()

    # Shopper B with forged / invalid token attempts to change price
    res_b_bad_token = client.patch(
        f"/api/price-observations/{obs_id}",
        headers={"X-Edit-Token": "forged-ungenerated-token-xyz123"},
        json={"price_cents": 100},
    )
    assert res_b_bad_token.status_code == 403

    # Shopper A with valid token successfully updates price
    res_a_valid = client.patch(
        f"/api/price-observations/{obs_id}",
        headers={"X-Edit-Token": token_a},
        json={"price_cents": 425},
    )
    assert res_a_valid.status_code == 200
    assert res_a_valid.json()["price_cents"] == 425


def test_unauthorized_delete_rejected(client):
    """Verify unauthorized deletion is rejected with 403 Forbidden."""
    today_str = date.today().isoformat()

    res_a = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-bread-white",
            "store_name": "Kroger - Shelby",
            "price_cents": 299,
            "observation_date": today_str,
            "contributor_id": "shopper-a-uuid",
        },
    )
    assert res_a.status_code == 201
    obs_id = res_a.json()["id"]
    token_a = res_a.json()["edit_token"]

    # Shopper B without token attempts to delete
    res_del_no_token = client.delete(f"/api/price-observations/{obs_id}")
    assert res_del_no_token.status_code == 403

    # Shopper B with bad token attempts to delete
    res_del_bad_token = client.delete(
        f"/api/price-observations/{obs_id}",
        headers={"X-Edit-Token": "fake-token"},
    )
    assert res_del_bad_token.status_code == 403

    # Shopper A deletes own observation
    res_del_valid = client.delete(
        f"/api/price-observations/{obs_id}",
        headers={"X-Edit-Token": token_a},
    )
    assert res_del_valid.status_code == 200
    assert res_del_valid.json()["status"] == "deleted"


def test_cross_contributor_overwrite_prevented(client):
    """Verify that multiple contributors submitting observations for the same product,

    store, and date creates distinct observations rather than clobbering each other.
    """
    today_str = date.today().isoformat()
    store_name = "Target - Shelby Township"

    # Shopper A records $3.29
    res_a = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-eggs-dozen",
            "store_name": store_name,
            "price_cents": 329,
            "observation_date": today_str,
            "notes": "Shopper A observation",
            "contributor_id": "shopper-a-uuid",
        },
    )
    assert res_a.status_code == 201
    obs_a_id = res_a.json()["id"]
    token_a = res_a.json()["edit_token"]
    assert res_a.json()["price_cents"] == 329

    # Shopper B records $1.99 on the same day without Shopper A's token
    res_b = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-eggs-dozen",
            "store_name": store_name,
            "price_cents": 199,
            "observation_date": today_str,
            "notes": "Shopper B observation",
            "contributor_id": "shopper-b-uuid",
        },
    )
    assert res_b.status_code == 201
    obs_b_id = res_b.json()["id"]
    token_b = res_b.json()["edit_token"]

    # CRITICAL SECURITY ASSERTION: Shopper A's record was NOT overwritten!
    assert obs_b_id != obs_a_id
    assert token_b != token_a

    # Verify both records exist independently in public query
    query_res = client.get("/api/price-observations?product_id=prod-eggs-dozen")
    assert query_res.status_code == 200
    records = query_res.json()
    record_ids = [r["id"] for r in records]
    assert obs_a_id in record_ids
    assert obs_b_id in record_ids


def test_public_reads_never_leak_edit_tokens(client):
    """Verify that public read APIs never expose edit tokens or hashes."""
    today_str = date.today().isoformat()

    create_res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Meijer - Public Leak Test",
            "price_cents": 399,
            "observation_date": today_str,
        },
    )
    assert create_res.status_code == 201
    obs_id = create_res.json()["id"]
    assert obs_id is not None
    assert create_res.json()["edit_token"] is not None

    # 1. Check GET /api/price-observations
    list_res = client.get("/api/price-observations?product_id=prod-milk-gal")
    assert list_res.status_code == 200
    for obs in list_res.json():
        assert obs.get("edit_token") is None
        assert "edit_token_hash" not in obs

    # 2. Check GET /api/products/{id}/prices
    prod_prices_res = client.get("/api/products/prod-milk-gal/prices")
    assert prod_prices_res.status_code == 200
    data = prod_prices_res.json()
    for obs in data["observations"]:
        assert obs.get("edit_token") is None
        assert "edit_token_hash" not in obs
