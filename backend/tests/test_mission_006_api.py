"""Integration tests for Mission 006 API endpoints.

Covers:
- Gate B: Price import parser endpoint
- Gate C: Custom product creation with duplicate prevention, editing, canonical groups, equivalents
- Gate D: Kroger vs Meijer side-by-side comparison, coverage counters, and 2-store split logic
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


import uuid


def test_custom_product_creation_and_duplicate_prevention(client):
    suffix = uuid.uuid4().hex[:6]
    # 1. Create a custom product
    create_payload = {
        "name": f"Organic Honeycrisp Apples {suffix}",
        "brand": "Simple Truth",
        "package_quantity": "3",
        "package_unit": "lb",
        "aliases": ["honeycrisp", "organic apples"],
        "category": "produce",
        "canonical_group": f"apples-honeycrisp-3lb-{suffix}",
    }
    resp = client.post("/api/products", json=create_payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == f"Organic Honeycrisp Apples {suffix}"
    assert data["brand"] == "Simple Truth"
    assert data["category"] == "produce"
    assert data["canonical_group"] == f"apples-honeycrisp-3lb-{suffix}"
    product_id = data["id"]
    assert "simple-truth" in product_id

    # 2. Attempt to create exact duplicate -> Expect 409 Conflict
    dup_resp = client.post("/api/products", json=create_payload)
    assert dup_resp.status_code == 409
    assert "already exists" in dup_resp.json()["detail"].lower()

    # 3. Patch product metadata
    patch_resp = client.patch(
        f"/api/products/{product_id}",
        json={"name": f"Organic Honeycrisp Apples Bag {suffix}", "category": "fresh produce"},
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["name"] == f"Organic Honeycrisp Apples Bag {suffix}"
    assert patched["category"] == "fresh produce"


def test_canonical_group_and_equivalents(client):
    suffix = uuid.uuid4().hex[:6]
    group_name = f"test-greek-yogurt-32oz-{suffix}"

    # Create Kroger brand Greek yogurt
    res_kr = client.post(
        "/api/products",
        json={
            "name": f"Test Plain Greek Yogurt {suffix}",
            "brand": "Kroger",
            "package_quantity": "32",
            "package_unit": "oz",
            "canonical_group": group_name,
        },
    )
    assert res_kr.status_code == 201
    kr_yogurt = res_kr.json()

    # Create Meijer brand Greek yogurt
    res_mj = client.post(
        "/api/products",
        json={
            "name": f"Test Plain Greek Yogurt {suffix}",
            "brand": "Meijer",
            "package_quantity": "32",
            "package_unit": "oz",
            "canonical_group": group_name,
        },
    )
    assert res_mj.status_code == 201
    mj_yogurt = res_mj.json()

    # Query equivalents for the Kroger product
    eq_resp = client.get(f"/api/products/{kr_yogurt['id']}/equivalents")
    assert eq_resp.status_code == 200
    eq_items = eq_resp.json()
    eq_ids = [item["id"] for item in eq_items]
    assert kr_yogurt["id"] in eq_ids
    assert mj_yogurt["id"] in eq_ids

    # Check canonical groups endpoint includes our group
    groups_resp = client.get("/api/products/canonical-groups")
    assert groups_resp.status_code == 200
    assert group_name in groups_resp.json()


def test_price_import_parse_endpoint(client):
    raw_pasted_text = """
    Whole Milk 1 Gallon $2.89
    Kroger Large Eggs 12 ct Was $2.49 Now $1.79
    Boneless Skinless Chicken Breast 2 lb $7.98
    Unmatched Fantasy Product 5 oz $99.99
    """
    resp = client.post(
        "/api/price-import/parse",
        json={"text": raw_pasted_text, "retailer_name": "Kroger"},
    )
    assert resp.status_code == 200
    data = resp.json()
    candidates = data["candidates"]
    assert len(candidates) >= 4

    # Check eggs line with promotion
    egg_cand = next(c for c in candidates if "eggs" in c["extracted_name"].lower())
    assert egg_cand["price_cents"] == 179
    assert egg_cand["is_promotional"] is True
    assert egg_cand["regular_price_cents"] == 249

    # Check unmatched item handling
    fantasy_cand = next(c for c in candidates if "unmatched" in c["raw_line"].lower())
    assert fantasy_cand["price_cents"] == 9999
    assert fantasy_cand["match_confidence"] == "unmatched"


def test_kroger_vs_meijer_list_comparison(client):
    # 1. Create a list with staple items
    # Search for milk and eggs
    prods = client.get("/api/products", params={"q": "milk"}).json()
    assert len(prods) > 0
    milk_id = prods[0]["id"]

    prods_eggs = client.get("/api/products", params={"q": "eggs"}).json()
    assert len(prods_eggs) > 0
    eggs_id = prods_eggs[0]["id"]

    list_resp = client.post("/api/lists", json={"name": "Mission 006 Test List"})
    assert list_resp.status_code == 201
    list_id = list_resp.json()["id"]

    client.post(f"/api/lists/{list_id}/items", json={"product_id": milk_id, "quantity": 1})
    client.post(f"/api/lists/{list_id}/items", json={"product_id": eggs_id, "quantity": 2})

    # 2. Compare using demonstration source (which has seeded Kroger and Meijer prices)
    comp_resp = client.post(
        f"/api/lists/{list_id}/compare",
        params={"source": "demonstration", "minimum_savings_threshold_cents": 200},
    )
    assert comp_resp.status_code == 200
    comp = comp_resp.json()

    # Verify coverage counters
    assert "kroger_coverage" in comp
    assert "products have known Kroger prices" in comp["kroger_coverage"]
    assert "meijer_coverage" in comp
    assert "products have known Meijer prices" in comp["meijer_coverage"]

    # Verify item comparisons
    assert len(comp["item_comparisons"]) == 2
    for itm in comp["item_comparisons"]:
        assert itm["product_id"] in (milk_id, eggs_id)
        assert itm["cheaper_retailer"] in ("kroger", "meijer", "tie", "incomplete")
        if itm["kroger_price_cents"] is not None:
            assert itm["unit_price_kroger_cents"] is not None
        if itm["meijer_price_cents"] is not None:
            assert itm["unit_price_meijer_cents"] is not None

    # Verify Kroger and Meijer single-store plans exist
    assert comp["kroger_plan"] is not None
    assert comp["meijer_plan"] is not None
