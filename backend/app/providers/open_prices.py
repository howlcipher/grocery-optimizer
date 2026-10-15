"""Open Prices (Open Food Facts) Provider and Normalizer

Provides structured client, currency validation, integer cent arithmetic,
exact product barcode matching, and rate limit resilience.
"""

import json
from datetime import date, datetime
from typing import Any

from app.domain.models import PriceSource, Product, ProductOffer, Store
from app.providers.base import RetailerProvider


class OpenPricesError(Exception):
    """Base exception for Open Prices errors."""


class OpenPricesRateLimitError(OpenPricesError):
    """Raised when Open Prices API returns HTTP 429 (Too Many Requests)."""


class UnsupportedCurrencyError(OpenPricesError):
    """Raised when price observation is in a currency other than USD."""


class OpenPricesClient:
    """Client for Open Prices REST API (prices.openfoodfacts.org)."""

    def __init__(
        self,
        base_url: str = "https://prices.openfoodfacts.org/api/v1",
        user_agent: str = "GroceryOptimizer/0.2.0 (contact: info@groceryoptimizer.dev)",
        transport: Any | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.user_agent = user_agent
        self._transport = transport

    def _request(self, endpoint: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        if self._transport is not None:
            return self._transport(endpoint, params)

        query_str = ""
        if params:
            import urllib.parse
            clean_params = {k: v for k, v in params.items() if v is not None}
            if clean_params:
                query_str = "?" + urllib.parse.urlencode(clean_params)

        full_url = f"{self.base_url}{endpoint}{query_str}"
        req = urllib.request.Request(full_url, headers={"User-Agent": self.user_agent})

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                return json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                raise OpenPricesRateLimitError(
                    "Open Prices rate limit exceeded (HTTP 429). Please retry later."
                ) from e
            raise OpenPricesError(f"HTTP error {e.code}: {e.reason}") from e
        except Exception as e:
            raise OpenPricesError(f"Network error querying Open Prices: {e}") from e

    def get_prices(
        self,
        location_id: int | None = None,
        product_code: str | None = None,
        lat: float | None = None,
        lon: float | None = None,
        radius_km: int | None = None,
        currency: str | None = "USD",
        size: int = 50,
        page: int = 1,
    ) -> dict[str, Any]:
        params = {
            "location_id": location_id,
            "product_code": product_code,
            "lat": lat,
            "lon": lon,
            "radius_km": radius_km,
            "currency": currency,
            "size": size,
            "page": page,
        }
        return self._request("/prices", params)

    def get_locations_nearby(
        self,
        lat: float,
        lon: float,
        radius_km: int = 25,
        size: int = 20,
    ) -> dict[str, Any]:
        params = {
            "lat": lat,
            "lon": lon,
            "radius_km": radius_km,
            "size": size,
        }
        return self._request("/locations/nearby", params)


class OpenPricesNormalizer:
    """Normalizes raw Open Prices API payloads into canonical Grocery Optimizer domain models."""

    @staticmethod
    def normalize_price_item(
        raw_item: dict[str, Any],
        products_by_upc: dict[str, Product],
        reference_date: date | None = None,
    ) -> ProductOffer:
        """Convert a raw Open Prices price item into a normalized ProductOffer.

        Enforces:
        - Strict USD currency validation.
        - Exact integer cents conversion.
        - Exact manufacturer barcode / UPC matching against canonical catalog.
        - Freshness / stale detection.
        - Explicit Open Prices data provenance.
        """
        currency = raw_item.get("currency")
        if currency != "USD":
            raise UnsupportedCurrencyError(
                f"Unsupported currency '{currency}'. Grocery Optimizer currently requires USD."
            )

        raw_price = raw_item.get("price")
        if raw_price is None or raw_price <= 0:
            raise ValueError(f"Invalid non-positive price in Open Prices record: {raw_price}")

        # Exact integer cents
        price_cents = round(float(raw_price) * 100)

        # UPC matching
        upc = raw_item.get("product_code")
        if not upc:
            prod_dict = raw_item.get("product") or {}
            upc = prod_dict.get("code")

        if not upc or upc not in products_by_upc:
            raise KeyError(f"Product barcode '{upc}' does not match any canonical product in catalog.")

        canonical_product = products_by_upc[upc]

        # Location / store
        loc = raw_item.get("location") or {}
        loc_id = str(raw_item.get("location_id") or loc.get("id") or "unknown-loc")
        store_id = f"openprices-store-{loc_id}"

        # Date & Freshness
        obs_date_str = raw_item.get("date")
        is_stale = False
        ref = reference_date or date.today()
        if obs_date_str:
            try:
                obs_d = datetime.strptime(obs_date_str, "%Y-%m-%d").date()
                is_stale = (ref - obs_d).days > 30
            except ValueError:
                pass

        is_discounted = bool(raw_item.get("price_is_discounted"))
        raw_without_disc = raw_item.get("price_without_discount")

        regular_cents = price_cents
        promo_cents = None
        if is_discounted and raw_without_disc and raw_without_disc > raw_price:
            regular_cents = round(float(raw_without_disc) * 100)
            promo_cents = price_cents

        return ProductOffer(
            id=f"openprices-offer-{raw_item.get('id', 'unknown')}",
            retailer_id=f"openprices-retailer-{loc_id}",
            store_id=store_id,
            product_id=canonical_product.id,
            retailer_product_id=str(upc),
            regular_price_cents=regular_cents,
            promotional_price_cents=promo_cents,
            is_available=True,
            source=PriceSource.OPEN_PRICES,
            observation_date=obs_date_str,
            is_stale=is_stale,
            source_attribution=f"Open Prices observation ({obs_date_str})",
        )

    @staticmethod
    def extract_store(raw_location: dict[str, Any]) -> Store:
        """Extract a Store domain model from an Open Prices location record."""
        loc_id = str(raw_location.get("id"))
        store_id = f"openprices-store-{loc_id}"
        name = raw_location.get("osm_name") or raw_location.get("osm_display_name") or f"Store {loc_id}"
        city = raw_location.get("osm_address_city")
        if city and city not in name:
            name = f"{name} ({city})"

        return Store(
            id=store_id,
            retailer_id=f"openprices-retailer-{loc_id}",
            name=name,
            slug=f"openprices-{loc_id}",
            sort_order=int(raw_location.get("id", 0)),
        )


class OpenPricesProvider(RetailerProvider):
    """Retailer provider implementation backed by Open Prices data."""

    def __init__(
        self,
        client: OpenPricesClient,
        canonical_products: list[Product],
        stores: list[Store] | None = None,
        location_ids: list[int] | None = None,
    ):
        self.client = client
        self.products_by_upc = {p.upc: p for p in canonical_products if p.upc}
        self.products_by_id = {p.id: p for p in canonical_products}
        self._stores = stores or []
        self._location_ids = location_ids or []

    def get_stores(self) -> list[Store]:
        return list(self._stores)

    def get_offers(
        self, product_ids: list[str], store_ids: list[str]
    ) -> list[ProductOffer]:
        if not product_ids or not self._location_ids:
            return []

        offers: list[ProductOffer] = []
        for loc_id in self._location_ids:
            try:
                res = self.client.get_prices(location_id=loc_id, currency="USD", size=100)
            except OpenPricesRateLimitError:
                # Fall back gracefully on rate limits
                continue
            except OpenPricesError:
                continue

            for item in res.get("items", []):
                try:
                    offer = OpenPricesNormalizer.normalize_price_item(
                        item, self.products_by_upc
                    )
                    if offer.product_id in product_ids:
                        offers.append(offer)
                except (UnsupportedCurrencyError, KeyError, ValueError):
                    continue

        return offers
