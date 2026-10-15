from typing import TYPE_CHECKING

from app.domain.models import ProductOffer, Store
from app.providers.base import RetailerProvider
from app.seed.data import SEED_OFFERS, SEED_STORES

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class MockRetailerProvider(RetailerProvider):
    """Deterministic mock retailer provider serving seeded store and offer data,

    either from in-memory seed records or via PostgreSQL queries.
    """

    def __init__(
        self,
        db: "Session | None" = None,
        stores: list[Store] | None = None,
        offers: list[ProductOffer] | None = None,
    ):
        self._db = db
        if stores is not None:
            self._stores: list[Store] | None = list(stores)
        elif db is not None:
            self._stores = None
        else:
            self._stores = list(SEED_STORES)

        if offers is not None:
            self._offers: list[ProductOffer] | None = list(offers)
        elif db is not None:
            self._offers = None
        else:
            self._offers = list(SEED_OFFERS)

    def get_stores(self) -> list[Store]:
        if self._stores is not None:
            return list(self._stores)
        if self._db is not None:
            from app.persistence.models import StoreModel

            return [
                Store(
                    id=s.id,
                    retailer_id=s.retailer_id,
                    name=s.name,
                    slug=s.slug,
                    sort_order=s.sort_order,
                )
                for s in self._db.query(StoreModel).all()
            ]
        return []

    def get_offers(
        self, product_ids: list[str], store_ids: list[str]
    ) -> list[ProductOffer]:
        if not product_ids or not store_ids:
            return []

        if self._offers is not None:
            prod_set = set(product_ids)
            store_set = set(store_ids)
            return [
                offer
                for offer in self._offers
                if offer.product_id in prod_set and offer.store_id in store_set
            ]

        if self._db is not None:
            from app.persistence.models import ProductOfferModel

            models = (
                self._db.query(ProductOfferModel)
                .filter(
                    ProductOfferModel.product_id.in_(product_ids),
                    ProductOfferModel.store_id.in_(store_ids),
                )
                .all()
            )
            return [
                ProductOffer(
                    id=o.id,
                    retailer_id=o.retailer_id,
                    store_id=o.store_id,
                    product_id=o.product_id,
                    retailer_product_id=o.retailer_product_id,
                    regular_price_cents=o.regular_price_cents,
                    promotional_price_cents=o.promotional_price_cents,
                    is_available=o.is_available,
                )
                for o in models
            ]

        return []
