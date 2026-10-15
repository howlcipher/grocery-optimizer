
from app.domain.models import ProductOffer, Store
from app.providers.base import RetailerProvider
from app.seed.data import SEED_OFFERS, SEED_STORES


class MockRetailerProvider(RetailerProvider):
    """Deterministic mock retailer provider serving seeded store and offer data."""

    def __init__(
        self,
        stores: list[Store] | None = None,
        offers: list[ProductOffer] | None = None,
    ):
        self._stores = stores if stores is not None else list(SEED_STORES)
        self._offers = offers if offers is not None else list(SEED_OFFERS)

    def get_stores(self) -> list[Store]:
        return list(self._stores)

    def get_offers(
        self, product_ids: list[str], store_ids: list[str]
    ) -> list[ProductOffer]:
        prod_set = set(product_ids)
        store_set = set(store_ids)
        return [
            offer
            for offer in self._offers
            if offer.product_id in prod_set and offer.store_id in store_set
        ]
