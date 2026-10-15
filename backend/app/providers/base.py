from typing import Protocol

from app.domain.models import ProductOffer, Store


class RetailerProvider(Protocol):
    """Protocol for grocery retailer data providers."""

    def get_stores(self) -> list[Store]:
        """Return available stores for this provider."""
        ...

    def get_offers(
        self, product_ids: list[str], store_ids: list[str]
    ) -> list[ProductOffer]:
        """Return normalized product offers for specified products and stores."""
        ...
