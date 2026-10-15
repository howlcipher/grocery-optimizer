from datetime import date, datetime
from typing import TYPE_CHECKING

from app.domain.models import PriceSource, ProductOffer, Store
from app.providers.base import RetailerProvider

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.persistence.models import PriceObservationModel


class UserContributedRetailerProvider(RetailerProvider):
    """Retailer provider that supplies offers from verified user-contributed

    price observations.
    """

    def __init__(
        self,
        db: "Session | None" = None,
        observations: "list[PriceObservationModel] | None" = None,
        stores: list[Store] | None = None,
    ):
        self._db = db
        self._observations = observations
        self._stores = stores

    def get_stores(self) -> list[Store]:
        """Return stores for which price observations or definitions exist."""
        if self._stores is not None:
            return list(self._stores)

        if self._db is not None:
            from app.persistence.models import PriceObservationModel, StoreModel

            # Query all stores referenced in price observations or store table
            observed_store_ids = {
                r[0]
                for r in self._db.query(PriceObservationModel.store_id)
                .filter(PriceObservationModel.store_id.isnot(None))
                .distinct()
                .all()
            }
            all_stores = self._db.query(StoreModel).all()
            # If stores have observations, prioritize them, else return all stores
            matched = [s for s in all_stores if s.id in observed_store_ids]
            target_stores = matched if matched else all_stores
            return [
                Store(
                    id=s.id,
                    retailer_id=s.retailer_id,
                    name=s.name,
                    slug=s.slug,
                    sort_order=s.sort_order,
                )
                for s in target_stores
            ]

        if self._observations:
            # Construct stores from in-memory observations
            seen_stores = {}
            for obs in self._observations:
                sid = obs.store_id or f"store-{obs.store_name.lower().replace(' ', '-')}"
                if sid not in seen_stores:
                    seen_stores[sid] = Store(
                        id=sid,
                        retailer_id=f"ret-{sid}",
                        name=obs.store_name,
                        slug=sid,
                        sort_order=len(seen_stores),
                    )
            return list(seen_stores.values())

        return []

    def get_offers(
        self, product_ids: list[str], store_ids: list[str]
    ) -> list[ProductOffer]:
        """Return active offers from user observations for requested products and stores.

        Conflict resolution: If multiple observations exist for the same
        (store_id, product_id), the observation with the most recent
        observation_date (and latest updated_at) is selected.
        Stale observation handling: Observations older than 30 days are flagged with is_stale=True.
        """
        if not product_ids or not store_ids:
            return []

        today = date.today()
        prod_set = set(product_ids)
        store_set = set(store_ids)

        raw_observations = []
        if self._observations is not None:
            raw_observations = [
                obs
                for obs in self._observations
                if obs.product_id in prod_set and (obs.store_id in store_set or not obs.store_id)
            ]
        elif self._db is not None:
            from app.persistence.models import PriceObservationModel

            raw_observations = (
                self._db.query(PriceObservationModel)
                .filter(
                    PriceObservationModel.product_id.in_(product_ids),
                    PriceObservationModel.store_id.in_(store_ids),
                )
                .order_by(
                    PriceObservationModel.observation_date.desc(),
                    PriceObservationModel.updated_at.desc(),
                )
                .all()
            )

        # Conflict resolution: newest observation per (store_id, product_id)
        latest_by_pair: dict[tuple[str, str], any] = {}
        for obs in raw_observations:
            sid = obs.store_id or store_ids[0]
            key = (sid, obs.product_id)
            if key not in latest_by_pair:
                latest_by_pair[key] = obs
            else:
                # Compare observation date then updated_at
                existing = latest_by_pair[key]
                existing_date = existing.observation_date
                obs_date = obs.observation_date
                if obs_date > existing_date:
                    latest_by_pair[key] = obs
                elif obs_date == existing_date:
                    existing_upd = getattr(existing, "updated_at", None)
                    obs_upd = getattr(obs, "updated_at", None)
                    if obs_upd and existing_upd and obs_upd > existing_upd:
                        latest_by_pair[key] = obs

        offers: list[ProductOffer] = []
        for (sid, pid), obs in latest_by_pair.items():
            obs_date = obs.observation_date
            if isinstance(obs_date, str):
                obs_date_obj = datetime.strptime(obs_date, "%Y-%m-%d").date()
                obs_date_str = obs_date
            else:
                obs_date_obj = obs_date
                obs_date_str = obs_date.isoformat()

            is_stale = (today - obs_date_obj).days > 30

            regular_cents = obs.price_cents
            promo_cents = obs.price_cents if getattr(obs, "is_promotional", False) else None

            offers.append(
                ProductOffer(
                    id=f"user-offer-{obs.id}",
                    retailer_id=f"ret-{sid}",
                    store_id=sid,
                    product_id=pid,
                    retailer_product_id=f"user-obs-{obs.id}",
                    regular_price_cents=regular_cents,
                    promotional_price_cents=promo_cents,
                    is_available=True,
                    source=PriceSource.USER_CONTRIBUTED,
                    observation_date=obs_date_str,
                    is_stale=is_stale,
                    source_attribution=f"User-entered observation ({obs_date_str})",
                )
            )

        return offers
