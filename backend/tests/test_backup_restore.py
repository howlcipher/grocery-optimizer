"""Tests for Gate F: System Backup, Restore, and PostgreSQL-to-SQLite Migration."""

import tempfile
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app
from app.persistence.migration_tool import copy_database


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_system_export_structure_and_redaction(client):
    resp = client.get("/api/system/export")
    assert resp.status_code == 200
    data = resp.json()

    assert data["version"] == "1.0"
    assert data["app_version"] == "0.6.0"
    assert "exported_at" in data
    assert isinstance(data["products"], list)
    assert isinstance(data["grocery_lists"], list)
    assert isinstance(data["price_observations"], list)
    assert isinstance(data["stores"], list)
    assert isinstance(data["retailers"], list)

    # Ensure sensitive edit token hashes are never exported
    for obs in data["price_observations"]:
        assert "edit_token_hash" not in obs


def test_system_import_and_restore(client):
    suffix = uuid.uuid4().hex[:6]
    test_prod_id = f"prod-test-backup-{suffix}"
    test_list_id = f"list-test-backup-{suffix}"

    backup_payload = {
        "version": "1.0",
        "exported_at": "2026-10-15T18:00:00Z",
        "app_version": "0.6.0",
        "products": [
            {
                "id": test_prod_id,
                "name": f"Backup Test Bread {suffix}",
                "brand": "Nature's Own",
                "package_quantity": "20",
                "package_unit": "oz",
                "aliases": ["bread"],
                "category": "bakery",
            }
        ],
        "grocery_lists": [
            {
                "id": test_list_id,
                "name": f"Restored Shopping List {suffix}",
                "items": [
                    {
                        "product_id": test_prod_id,
                        "quantity": 2,
                    }
                ],
            }
        ],
        "price_observations": [
            {
                "id": f"obs-{suffix}",
                "product_id": test_prod_id,
                "store_name": "Kroger #456",
                "price_cents": 299,
                "observation_date": "2026-10-15",
                "is_promotional": False,
            }
        ],
        "stores": [],
        "retailers": [],
    }

    resp = client.post("/api/system/import", json=backup_payload)
    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["status"] == "success"
    assert res_data["imported_products_count"] >= 1
    assert res_data["imported_lists_count"] >= 1

    # Verify restored list is accessible
    get_list_resp = client.get(f"/api/lists/{test_list_id}")
    assert get_list_resp.status_code == 200
    gl = get_list_resp.json()
    assert gl["name"] == f"Restored Shopping List {suffix}"
    assert len(gl["items"]) == 1
    assert gl["items"][0]["product_id"] == test_prod_id


def test_system_import_corrupt_backup_rolls_back_safely(client):
    # Missing required 'version' and corrupted structure
    corrupt_payload = {
        "version": "",
        "products": "not-a-list",
    }
    resp = client.post("/api/system/import", json=corrupt_payload)
    assert resp.status_code == 422 or resp.status_code == 400


def test_migration_tool_end_to_end():
    with tempfile.NamedTemporaryFile(suffix=".db") as tmp_file:
        sqlite_url = f"sqlite:///{tmp_file.name}"
        counts = copy_database(source_url=settings.database_url, target_url=sqlite_url)
        assert counts["retailers"] > 0
        assert counts["stores"] > 0
        assert counts["products"] > 0
