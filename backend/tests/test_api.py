import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.persistence.database import Base, SessionLocal, engine
from app.seed.seeder import seed_database


@pytest.fixture(scope="module")
def client():
    # Ensure tables and seed data are populated
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_product_search(client):
    # Blank query returns default list
    res = client.get("/api/products")
    assert res.status_code == 200
    products = res.json()
    assert len(products) > 0

    # Search for milk
    res = client.get("/api/products?q=milk")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 2
    assert all("milk" in p["name"].lower() or "milk" in str(p["aliases"]).lower() for p in data)

    # Search by alias "oj"
    res = client.get("/api/products?q=oj")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert data[0]["id"] == "prod-oj-52"

    # Search for non-existent item
    res = client.get("/api/products?q=xyznotfound123")
    assert res.status_code == 200
    assert res.json() == []


def test_list_lifecycle_and_persistence(client):
    # 1. Create list
    res = client.post("/api/lists", json={"name": "Weekly Groceries"})
    assert res.status_code == 201
    list_data = res.json()
    list_id = list_data["id"]
    assert list_data["name"] == "Weekly Groceries"
    assert list_data["items"] == []

    # 2. Retrieve list
    res = client.get(f"/api/lists/{list_id}")
    assert res.status_code == 200
    assert res.json()["id"] == list_id

    # 3. Rename list
    res = client.patch(f"/api/lists/{list_id}", json={"name": "Weekend BBQ"})
    assert res.status_code == 200
    assert res.json()["name"] == "Weekend BBQ"

    # 4. Add items
    res = client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 1})
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["product_id"] == "prod-milk-gal"
    assert items[0]["quantity"] == 1
    assert items[0]["product"]["name"] == "Whole Milk"
    item_id = items[0]["id"]

    # 5. Add same item again -> increments quantity
    res = client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 2})
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["quantity"] == 3

    # 6. Update quantity
    res = client.patch(f"/api/lists/{list_id}/items/{item_id}", json={"quantity": 5})
    assert res.status_code == 200
    assert res.json()["items"][0]["quantity"] == 5

    # 7. Add second item
    res = client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-eggs-dozen", "quantity": 2})
    assert res.status_code == 200
    assert len(res.json()["items"]) == 2

    # 8. Delete first item
    res = client.delete(f"/api/lists/{list_id}/items/{item_id}")
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["product_id"] == "prod-eggs-dozen"


def test_list_validation_errors(client):
    # Non-existent list
    res = client.get("/api/lists/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404

    # Add invalid product
    res = client.post("/api/lists", json={})
    list_id = res.json()["id"]
    res = client.post(f"/api/lists/{list_id}/items", json={"product_id": "bad-prod-id", "quantity": 1})
    assert res.status_code == 400

    # Invalid quantity (0)
    res = client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 0})
    assert res.status_code == 422

    # Invalid quantity (> 99)
    res = client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 100})
    assert res.status_code == 422


def test_compare_empty_list(client):
    res = client.post("/api/lists", json={"name": "Empty"})
    list_id = res.json()["id"]

    res = client.post(f"/api/lists/{list_id}/compare")
    assert res.status_code == 400
    assert "empty" in res.json()["detail"].lower()


def test_compare_prices_consumer_scenarios(client):
    # Create list with milk, eggs, cheerios 18oz, coffee
    res = client.post("/api/lists", json={"name": "Test Basket"})
    list_id = res.json()["id"]

    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-milk-gal", "quantity": 1})
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-eggs-dozen", "quantity": 2})
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-cheerios-18", "quantity": 1})
    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-coffee-colombian", "quantity": 1})

    res = client.post(f"/api/lists/{list_id}/compare")
    assert res.status_code == 200
    data = res.json()

    assert "one_store_plan" in data
    assert "best_plan" in data
    assert data["one_store_plan"]["is_complete"] is True
    assert data["best_plan"]["is_complete"] is True
    assert data["one_store_plan"]["total_cents"] >= data["best_plan"]["total_cents"]
    assert data["savings_cents"] == data["one_store_plan"]["total_cents"] - data["best_plan"]["total_cents"]

    # Verify items grouped properly
    assert len(data["best_plan"]["items"]) == 4
    for item in data["best_plan"]["items"]:
        assert item["subtotal_cents"] == item["unit_price_cents"] * item["quantity"]
        assert item["unit_price_cents"] > 0
        assert item["store_name"] != ""


def test_compare_unfulfillable_item(client):
    # Dragonfruit is unavailable across all stores
    res = client.post("/api/lists", json={"name": "Exotic Fruits"})
    list_id = res.json()["id"]

    client.post(f"/api/lists/{list_id}/items", json={"product_id": "prod-dragonfruit", "quantity": 1})

    res = client.post(f"/api/lists/{list_id}/compare")
    assert res.status_code == 200
    data = res.json()

    assert data["one_store_plan"]["is_complete"] is False
    assert data["best_plan"]["is_complete"] is False
    assert data["savings_cents"] is None
    missing = [p["id"] for p in data["best_plan"]["missing_products"]]
    assert "prod-dragonfruit" in missing
