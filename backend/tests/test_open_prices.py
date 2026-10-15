from datetime import date, timedelta

import pytest

from app.domain.models import PriceSource, Product
from app.providers.open_prices import (
    OpenPricesClient,
    OpenPricesNormalizer,
    OpenPricesProvider,
    OpenPricesRateLimitError,
    UnsupportedCurrencyError,
)


@pytest.fixture
def sample_catalog():
    return [
        Product(
            id="prod-milk-gal",
            name="Whole Milk",
            brand="Fresh Dairy",
            package_quantity="1",
            package_unit="gallon",
            upc="011110417002",
        ),
        Product(
            id="prod-eggs-dozen",
            name="Large Grade A Eggs",
            brand="Farm Fresh",
            package_quantity="12",
            package_unit="count",
            upc="011110417003",
        ),
    ]


def test_open_prices_normalizer_valid_usd(sample_catalog):
    catalog_by_upc = {p.upc: p for p in sample_catalog}
    raw_item = {
        "id": 101,
        "product_code": "011110417002",
        "price": 3.79,
        "currency": "USD",
        "date": date.today().isoformat(),
        "price_is_discounted": False,
        "location": {
            "id": 6379,
            "osm_name": "ALDI",
            "osm_address_city": "Rochester Hills",
        },
    }

    offer = OpenPricesNormalizer.normalize_price_item(raw_item, catalog_by_upc)
    assert offer.id == "openprices-offer-101"
    assert offer.product_id == "prod-milk-gal"
    assert offer.store_id == "openprices-store-6379"
    assert offer.regular_price_cents == 379
    assert offer.effective_price_cents == 379
    assert offer.source == PriceSource.OPEN_PRICES
    assert offer.is_stale is False
    assert "Open Prices observation" in offer.source_attribution


def test_open_prices_normalizer_rejects_unsupported_currencies(sample_catalog):
    catalog_by_upc = {p.upc: p for p in sample_catalog}

    for unsupported_curr in ["EUR", "CAD", "GBP", "JPY"]:
        raw_item = {
            "id": 102,
            "product_code": "011110417002",
            "price": 2.50,
            "currency": unsupported_curr,
            "date": date.today().isoformat(),
            "location": {"id": 1, "osm_name": "Store"},
        }
        with pytest.raises(UnsupportedCurrencyError) as exc_info:
            OpenPricesNormalizer.normalize_price_item(raw_item, catalog_by_upc)
        assert unsupported_curr in str(exc_info.value)
        assert "requires USD" in str(exc_info.value)


def test_open_prices_normalizer_exact_upc_matching(sample_catalog):
    catalog_by_upc = {p.upc: p for p in sample_catalog}

    # Unknown barcode not in catalog
    raw_item = {
        "id": 103,
        "product_code": "999999999999",
        "price": 4.99,
        "currency": "USD",
        "date": date.today().isoformat(),
        "location": {"id": 1, "osm_name": "Store"},
    }
    with pytest.raises(KeyError) as exc_info:
        OpenPricesNormalizer.normalize_price_item(raw_item, catalog_by_upc)
    assert "999999999999" in str(exc_info.value)


def test_open_prices_normalizer_stale_detection(sample_catalog):
    catalog_by_upc = {p.upc: p for p in sample_catalog}
    stale_date = (date.today() - timedelta(days=40)).isoformat()

    raw_item = {
        "id": 104,
        "product_code": "011110417002",
        "price": 3.49,
        "currency": "USD",
        "date": stale_date,
        "location": {"id": 6379, "osm_name": "ALDI"},
    }
    offer = OpenPricesNormalizer.normalize_price_item(raw_item, catalog_by_upc)
    assert offer.is_stale is True


def test_open_prices_promotional_discount_parsing(sample_catalog):
    catalog_by_upc = {p.upc: p for p in sample_catalog}

    raw_item = {
        "id": 105,
        "product_code": "011110417002",
        "price": 2.99,  # discounted price
        "price_without_discount": 3.99,  # regular price
        "price_is_discounted": True,
        "currency": "USD",
        "date": date.today().isoformat(),
        "location": {"id": 6379, "osm_name": "ALDI"},
    }
    offer = OpenPricesNormalizer.normalize_price_item(raw_item, catalog_by_upc)
    assert offer.regular_price_cents == 399
    assert offer.promotional_price_cents == 299
    assert offer.effective_price_cents == 299
    assert offer.is_on_sale is True


def test_open_prices_client_rate_limit_handling():
    # Mock transport simulating HTTP 429
    def mock_rate_limited_transport(endpoint, params):
        raise OpenPricesRateLimitError("Open Prices rate limit exceeded (HTTP 429). Please retry later.")

    client = OpenPricesClient(transport=mock_rate_limited_transport)
    with pytest.raises(OpenPricesRateLimitError) as exc_info:
        client.get_prices(location_id=123)
    assert "rate limit exceeded" in str(exc_info.value).lower()


def test_open_prices_provider_graceful_rate_limit(sample_catalog):
    def mock_rate_limited_transport(endpoint, params):
        raise OpenPricesRateLimitError("Rate limit")

    client = OpenPricesClient(transport=mock_rate_limited_transport)
    provider = OpenPricesProvider(
        client=client,
        canonical_products=sample_catalog,
        location_ids=[6379],
    )
    # Should gracefully return empty offers without crashing
    offers = provider.get_offers(product_ids=["prod-milk-gal"], store_ids=["openprices-store-6379"])
    assert offers == []
