"""Deterministic tests reproducing Gate 0 Problem A and Problem B store identity defects.

Problem A: Same-ZIP collisions in _resolve_or_create_store() when address is absent.
Problem B: Editing an observation (PATCH) discards store locality.
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


def test_reproduce_same_zip_different_stores_collision(client):
    """Problem A: Two distinct physical stores in the same ZIP without street address

    must NOT be merged into a single store record.
    """
    today_str = date.today().isoformat()

    # Store 1: Kroger North in 48316 without street address
    res1 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger North",
            "retailer_name": "Kroger",
            "city": "Shelby Twp",
            "state": "MI",
            "zip_code": "48316",
            "price_cents": 329,
            "observation_date": today_str,
        },
    )
    assert res1.status_code == 201
    store_id_1 = res1.json()["store_id"]

    # Store 2: Kroger South in 48316 without street address
    res2 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Kroger South",
            "retailer_name": "Kroger",
            "city": "Shelby Twp",
            "state": "MI",
            "zip_code": "48316",
            "price_cents": 339,
            "observation_date": today_str,
        },
    )
    assert res2.status_code == 201
    store_id_2 = res2.json()["store_id"]

    # They are distinct stores and must NOT share the same store_id
    assert store_id_1 != store_id_2, (
        f"Defect reproduced: Stores 'Kroger North' and 'Kroger South' in ZIP 48316 "
        f"were incorrectly merged under store_id {store_id_1}"
    )


def test_reproduce_addressless_submission_does_not_match_known_address_store(client):
    """Problem A: An address-less submission in a ZIP must not silently match a store

    with a known street address in that same ZIP.
    """
    today_str = date.today().isoformat()

    # Store with known physical address
    res1 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Target - Shelby",
            "retailer_name": "Target",
            "address": "8888 26 Mile Rd",
            "city": "Shelby Twp",
            "state": "MI",
            "zip_code": "48316",
            "price_cents": 359,
            "observation_date": today_str,
        },
    )
    assert res1.status_code == 201
    known_store_id = res1.json()["store_id"]

    # Address-less submission in the same ZIP
    res2 = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Target - Unknown Location",
            "retailer_name": "Target",
            "zip_code": "48316",
            "price_cents": 369,
            "observation_date": today_str,
        },
    )
    assert res2.status_code == 201
    unknown_store_id = res2.json()["store_id"]

    # Must not silently match the store that has a known address
    assert unknown_store_id != known_store_id, (
        f"Defect reproduced: Address-less submission silently matched known store {known_store_id}"
    )


def test_reproduce_patch_discards_store_locality(client):
    """Problem B: Modifying an observation via PATCH must not discard its existing store locality."""
    today_str = date.today().isoformat()

    # Create observation with verified locality
    create_res = client.post(
        "/api/price-observations",
        json={
            "product_id": "prod-milk-gal",
            "store_name": "Meijer #206",
            "retailer_name": "Meijer",
            "address": "36865 26 Mile Rd",
            "city": "Lenox",
            "state": "MI",
            "zip_code": "48042",
            "price_cents": 349,
            "observation_date": today_str,
        },
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    obs_id = created_data["id"]
    token = created_data["edit_token"]
    assert created_data["store_id"] is not None
    assert created_data["store_zip_code"] == "48042"
    assert created_data["is_unresolved_location"] is False

    # PATCH store name to "Meijer Supercenter #206"
    patch_res = client.patch(
        f"/api/price-observations/{obs_id}",
        headers={"X-Edit-Token": token},
        json={
            "store_name": "Meijer Supercenter #206",
            "price_cents": 339,
        },
    )
    assert patch_res.status_code == 200
    patched_data = patch_res.json()

    # Locality must NOT be discarded
    assert patched_data["store_zip_code"] == "48042", (
        f"Defect reproduced: PATCH erased store_zip_code (got {patched_data['store_zip_code']})"
    )
    assert patched_data["is_unresolved_location"] is False, (
        "Defect reproduced: PATCH set is_unresolved_location to True"
    )
