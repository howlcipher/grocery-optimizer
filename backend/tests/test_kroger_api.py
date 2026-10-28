"""Unit tests for official Kroger API Client."""

from unittest.mock import MagicMock

import httpx
import pytest

from app.providers.kroger import (
    KrogerApiClient,
    KrogerAuthException,
)


def test_kroger_client_configuration_check():
    client_unconfigured = KrogerApiClient()
    assert not client_unconfigured.is_configured

    client_empty = KrogerApiClient(client_id="   ", client_secret="")
    assert not client_empty.is_configured

    client_configured = KrogerApiClient(client_id="my-id", client_secret="my-secret")
    assert client_configured.is_configured


def test_kroger_client_auth_header():
    client = KrogerApiClient(client_id="test_client", client_secret="test_secret")
    header = client._get_auth_header()
    assert header.startswith("Basic ")
    # Base64 of test_client:test_secret is dGVzdF9jbGllbnQ6dGVzdF9zZWNyZXQ=
    assert "dGVzdF9jbGllbnQ6dGVzdF9zZWNyZXQ=" in header


def test_kroger_client_authenticate_success():
    mock_http = MagicMock(spec=httpx.Client)
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "access_token": "mock-token-xyz-123",
        "token_type": "bearer",
        "expires_in": 1800,
    }
    mock_http.post.return_value = mock_resp

    client = KrogerApiClient(
        client_id="my-id",
        client_secret="my-secret",
        http_client=mock_http,
    )
    token = client.authenticate()
    assert token == "mock-token-xyz-123"
    assert client._access_token == "mock-token-xyz-123"

    # Subsequent call within window uses cached token without posting again
    token2 = client.authenticate()
    assert token2 == "mock-token-xyz-123"
    assert mock_http.post.call_count == 1


def test_kroger_client_authenticate_bad_credentials():
    mock_http = MagicMock(spec=httpx.Client)
    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized: invalid client credentials"
    mock_http.post.return_value = mock_resp

    client = KrogerApiClient(
        client_id="bad-id",
        client_secret="bad-secret",
        http_client=mock_http,
    )
    with pytest.raises(KrogerAuthException) as exc:
        client.authenticate()
    assert "401" in str(exc.value)


def test_kroger_client_unconfigured_error():
    client = KrogerApiClient()
    with pytest.raises(KrogerAuthException) as exc:
        client.authenticate()
    assert "not configured" in str(exc.value)


def test_kroger_client_get_locations():
    mock_http = MagicMock(spec=httpx.Client)
    # Auth response
    auth_resp = MagicMock(spec=httpx.Response)
    auth_resp.status_code = 200
    auth_resp.json.return_value = {"access_token": "mock-tok", "expires_in": 1800}

    # Locations response
    loc_resp = MagicMock(spec=httpx.Response)
    loc_resp.status_code = 200
    loc_resp.json.return_value = {
        "data": [
            {
                "locationId": "01400456",
                "name": "Kroger - New Haven",
                "address": {
                    "addressLine1": "58651 Gratiot Ave",
                    "city": "New Haven",
                    "state": "MI",
                    "zipCode": "48048",
                },
            }
        ]
    }
    mock_http.post.return_value = auth_resp
    mock_http.get.return_value = loc_resp

    client = KrogerApiClient(
        client_id="id",
        client_secret="sec",
        http_client=mock_http,
    )
    locations = client.get_locations(zip_code="48042", radius_miles=15)
    assert len(locations) == 1
    assert locations[0]["locationId"] == "01400456"
    assert locations[0]["name"] == "Kroger - New Haven"


def test_kroger_client_search_products_and_extract_pricing():
    mock_http = MagicMock(spec=httpx.Client)
    auth_resp = MagicMock(spec=httpx.Response)
    auth_resp.status_code = 200
    auth_resp.json.return_value = {"access_token": "mock-tok", "expires_in": 1800}

    prod_resp = MagicMock(spec=httpx.Response)
    prod_resp.status_code = 200
    prod_resp.json.return_value = {
        "data": [
            {
                "productId": "0001111041600",
                "upc": "0001111041600",
                "description": "Kroger® Whole Milk",
                "brand": "Kroger",
                "items": [
                    {
                        "itemId": "0001111041600",
                        "size": "1 gal",
                        "price": {
                            "regular": 2.99,
                            "promo": 2.49,
                        },
                        "fulfillment": {"curbside": True, "inStore": True},
                    }
                ],
            }
        ]
    }
    mock_http.post.return_value = auth_resp
    mock_http.get.return_value = prod_resp

    client = KrogerApiClient(
        client_id="id",
        client_secret="sec",
        http_client=mock_http,
    )
    products = client.search_products(term="milk", location_id="01400456")
    assert len(products) == 1

    extracted = client.extract_product_pricing(products[0])
    assert extracted["product_id"] == "0001111041600"
    assert extracted["description"] == "Kroger® Whole Milk"
    assert extracted["brand"] == "Kroger"
    assert extracted["size"] == "1 gal"
    assert extracted["regular_price_cents"] == 299
    assert extracted["promotional_price_cents"] == 249
    assert extracted["is_on_sale"] is True
