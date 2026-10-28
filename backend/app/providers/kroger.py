"""Official Kroger Developer API Client and Provider Abstraction.

Implements OAuth 2.0 client credentials authentication, physical store location lookup,
product search, and store-specific price retrieval according to developer.kroger.com specifications.

Usage & Compliance:
- Requires user-provided KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.
- When credentials are not configured, gracefully reports unconfigured status.
- Section 5(e) of the Kroger Developer Agreement restricts using Kroger pricing data
  for cross-retailer competitive comparison without prior written partner authorization.
"""

from __future__ import annotations

import base64
import time
from typing import Any

import httpx

KROGER_OAUTH_TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token"
KROGER_API_BASE_URL = "https://api.kroger.com/v1"


class KrogerApiException(Exception):
    """Base exception for Kroger API errors."""


class KrogerAuthException(KrogerApiException):
    """Authentication or token exchange failure."""


class KrogerComplianceNotice:
    PARTNER_AUTHORIZATION_REQUIRED = (
        "Notice: Kroger Developer Agreement Section 5(e) restricts using Kroger pricing "
        "data for direct competitive price comparison without written partner consent. "
        "Official credentials should only be used in compliance with Kroger Developer Terms."
    )


class KrogerApiClient:
    """Client for Kroger Developer Program REST API."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        base_url: str = KROGER_API_BASE_URL,
        token_url: str = KROGER_OAUTH_TOKEN_URL,
        http_client: httpx.Client | None = None,
    ):
        self.client_id = client_id.strip() if client_id and client_id.strip() else None
        self.client_secret = client_secret.strip() if client_secret and client_secret.strip() else None
        self.base_url = base_url.rstrip("/")
        self.token_url = token_url
        self._http_client = http_client or httpx.Client(timeout=10.0)
        self._access_token: str | None = None
        self._token_expires_at: float = 0.0

    @property
    def is_configured(self) -> bool:
        """Return True if API credentials are provided."""
        return bool(self.client_id and self.client_secret)

    def _get_auth_header(self) -> str:
        """Encode client credentials as HTTP Basic Authorization."""
        if not self.client_id or not self.client_secret:
            raise KrogerAuthException("Kroger client_id and client_secret must be configured.")
        raw = f"{self.client_id}:{self.client_secret}".encode()
        return f"Basic {base64.b64encode(raw).decode('utf-8')}"

    def authenticate(self) -> str:
        """Obtain or return cached OAuth 2.0 access token via client credentials grant."""
        now = time.time()
        if self._access_token and now < (self._token_expires_at - 60):
            return self._access_token

        if not self.is_configured:
            raise KrogerAuthException("Kroger API credentials are not configured.")

        headers = {
            "Authorization": self._get_auth_header(),
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "client_credentials",
            "scope": "product.compact",
        }

        try:
            resp = self._http_client.post(self.token_url, headers=headers, data=data)
            if resp.status_code == 401 or resp.status_code == 400:
                raise KrogerAuthException(f"Kroger authentication failed: {resp.status_code} {resp.text}")
            resp.raise_for_status()
            payload = resp.json()
            self._access_token = payload["access_token"]
            expires_in = payload.get("expires_in", 1800)
            self._token_expires_at = now + expires_in
            return self._access_token
        except httpx.HTTPError as e:
            raise KrogerApiException(f"Network error during Kroger authentication: {e}") from e

    def get_locations(self, zip_code: str, radius_miles: int = 10) -> list[dict[str, Any]]:
        """Find physical Kroger stores near a given ZIP code."""
        token = self.authenticate()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        params = {
            "filter.zipCode.near": zip_code,
            "filter.radiusInMiles": radius_miles,
        }

        try:
            resp = self._http_client.get(
                f"{self.base_url}/locations",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])
        except httpx.HTTPError as e:
            raise KrogerApiException(f"Error fetching Kroger locations: {e}") from e

    def search_products(
        self, term: str, location_id: str | None = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        """Search products by keyword and optional location ID."""
        token = self.authenticate()
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        params: dict[str, Any] = {
            "filter.term": term,
            "filter.limit": limit,
        }
        if location_id:
            params["filter.locationId"] = location_id

        try:
            resp = self._http_client.get(
                f"{self.base_url}/products",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])
        except httpx.HTTPError as e:
            raise KrogerApiException(f"Error searching Kroger products: {e}") from e

    def extract_product_pricing(self, product_data: dict[str, Any]) -> dict[str, Any]:
        """Extract regular price, promo price, upc, and size in integer cents."""
        product_id = product_data.get("productId", "")
        description = product_data.get("description", "")
        upc = product_data.get("upc", "")
        brand = product_data.get("brand", "")

        items = product_data.get("items", [])
        regular_cents: int | None = None
        promo_cents: int | None = None
        size: str = ""

        if items:
            item = items[0]
            size = item.get("size", "")
            price_info = item.get("price", {})
            reg_val = price_info.get("regular")
            if reg_val is not None:
                regular_cents = round(float(reg_val) * 100)
            promo_val = price_info.get("promo")
            if promo_val is not None and float(promo_val) > 0:
                candidate_promo = round(float(promo_val) * 100)
                if regular_cents is not None and candidate_promo < regular_cents:
                    promo_cents = candidate_promo

        return {
            "product_id": product_id,
            "description": description,
            "brand": brand,
            "upc": upc,
            "size": size,
            "regular_price_cents": regular_cents,
            "promotional_price_cents": promo_cents,
            "is_on_sale": bool(promo_cents is not None),
        }
