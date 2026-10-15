from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from app.domain.models import PriceSource, ProductOffer, Store
from app.providers.base import RetailerProvider

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.persistence.models import PriceObservationModel


class UserContributedRetailerProvider(RetailerProvider):
    """Retailer provider that supplies offers from verified user-contributed

    price observations with physical store locality and multi-contributor conflict resolution.
    """

    def __init__(
        self,
        db: "Session | None" = None,
        observations: "list[PriceObservationModel] | None" = None,
        stores: list[Store] | None = None,
        zip_code: str | None = None,
        stale_days_threshold: int = 30,
    ):
        self._db = db
        self._observations = observations
        self._stores = stores
        self._zip_code = zip_code.strip() if zip_code and zip_code.strip() else None
        self._stale_days_threshold = stale_days_threshold

    def get_stores(self) -> list[Store]:
        """Return stores for which price observations or definitions exist,

        optionally filtered by geographic ZIP code.
        """
        if self._stores is not None:
            stores = list(self._stores)
            if self._zip_code:
                return [s for s in stores if s.zip_code == self._zip_code and not s.is_unresolved_location]
            return stores

        if self._db is not None:
            from app.persistence.models import PriceObservationModel, StoreModel

            query = self._db.query(StoreModel)
            if self._zip_code:
                # Strictly filter to physical stores located in the specified ZIP
                query = query.filter(
                    StoreModel.zip_code == self._zip_code,
                    StoreModel.is_unresolved_location.is_(False),
                )
                return [
                    Store(
                        id=s.id,
                        retailer_id=s.retailer_id,
                        name=s.name,
                        slug=s.slug,
                        sort_order=s.sort_order,
                        address=s.address,
                        city=s.city,
                        state=s.state,
                        zip_code=s.zip_code,
                        is_unresolved_location=s.is_unresolved_location,
                    )
                    for s in query.all()
                ]

            # Query all stores referenced in price observations or store table
            observed_store_ids = {
                r[0]
                for r in self._db.query(PriceObservationModel.store_id)
                .filter(PriceObservationModel.store_id.isnot(None))
                .distinct()
                .all()
            }
            all_stores = query.all()
            matched = [s for s in all_stores if s.id in observed_store_ids]
            target_stores = matched if matched else all_stores
            return [
                Store(
                    id=s.id,
                    retailer_id=s.retailer_id,
                    name=s.name,
                    slug=s.slug,
                    sort_order=s.sort_order,
                    address=s.address,
                    city=s.city,
                    state=s.state,
                    zip_code=s.zip_code,
                    is_unresolved_location=s.is_unresolved_location,
                )
                for s in target_stores
            ]

        if self._observations:
            # Construct stores from in-memory observations
            seen_stores: dict[str, Store] = {}
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
            stores = list(seen_stores.values())
            if self._zip_code:
                return [s for s in stores if s.zip_code == self._zip_code and not s.is_unresolved_location]
            return stores

        return []

    def get_offers(
        self, product_ids: list[str], store_ids: list[str]
    ) -> list[ProductOffer]:
        """Return active offers from user observations for requested products and stores.

        Data Quality & Conflict Resolution:
        - Outdated observations: Flagged as is_stale when older than stale_days_threshold (default 30d).
        - Promotional vs Regular: If both promotional and regular prices are recorded for the same date,
          preserves both regular shelf price and promotional price.
        - Multiple Contributors / Same-Date Conflicts: When multiple observations are recorded on the
          same date with differing prices, computes a robust consensus median and adds conflict attribution,
          rather than blindly assuming the latest DB write is verified.
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

        # Group observations by (store_id, product_id)
        grouped_by_pair: dict[tuple[str, str], list[Any]] = {}
        for obs in raw_observations:
            sid = obs.store_id or store_ids[0]
            key = (sid, obs.product_id)
            grouped_by_pair.setdefault(key, []).append(obs)

        offers: list[ProductOffer] = []
        for (sid, pid), obs_list in grouped_by_pair.items():
            # Find the latest observation date among observations for this pair
            dates = [
                obs.observation_date if isinstance(obs.observation_date, date)
                else datetime.strptime(str(obs.observation_date), "%Y-%m-%d").date()
                for obs in obs_list
            ]
            latest_date = max(dates)
            latest_date_str = latest_date.isoformat()

            # Filter to observations on the latest observation date
            same_date_obs = [
                obs for obs in obs_list
                if (obs.observation_date if isinstance(obs.observation_date, date)
                    else datetime.strptime(str(obs.observation_date), "%Y-%m-%d").date()) == latest_date
            ]

            # Separate promotional and regular submissions on that date
            regular_obs = [o for o in same_date_obs if not getattr(o, "is_promotional", False)]
            promo_obs = [o for o in same_date_obs if getattr(o, "is_promotional", False)]

            conflict_attribution = ""
            is_promotional_offer = False

            if regular_obs and promo_obs:
                regular_prices = [o.price_cents for o in regular_obs]
                regular_cents = sorted(regular_prices)[len(regular_prices) // 2]
                promo_prices = [o.price_cents for o in promo_obs]
                promo_candidate = min(promo_prices)
                if 0 < promo_candidate < regular_cents:
                    promo_cents = promo_candidate
                    is_promotional_offer = True
                else:
                    promo_cents = None
                conflict_attribution = " (regular shelf and promo observed)"
            elif promo_obs:
                promo_prices = [o.price_cents for o in promo_obs]
                promo_cents = sorted(promo_prices)[len(promo_prices) // 2]
                regular_cents = promo_cents
                is_promotional_offer = True
                if len(promo_prices) > 1 and len(set(promo_prices)) > 1:
                    conflict_attribution = f" (promo conflict resolved from {len(promo_prices)} reports)"
                elif len(promo_prices) > 1:
                    conflict_attribution = f" (verified promo by {len(promo_prices)} contributors)"
            else:
                regular_prices = [o.price_cents for o in regular_obs]
                promo_cents = None
                if len(regular_prices) > 1 and len(set(regular_prices)) > 1:
                    regular_cents = sorted(regular_prices)[len(regular_prices) // 2]
                    conflict_attribution = f" (conflict consensus from {len(regular_prices)} reports)"
                else:
                    regular_cents = regular_obs[0].price_cents
                    if len(regular_prices) > 1:
                        conflict_attribution = f" (verified by {len(regular_prices)} contributors)"

            is_stale = (today - latest_date).days > self._stale_days_threshold
            representative_obs = same_date_obs[0]

            offers.append(
                ProductOffer(
                    id=f"user-offer-{sid}-{pid}",
                    retailer_id=f"ret-{sid}",
                    store_id=sid,
                    product_id=pid,
                    retailer_product_id=f"user-obs-{representative_obs.id}",
                    regular_price_cents=regular_cents,
                    promotional_price_cents=promo_cents,
                    is_available=True,
                    source=PriceSource.USER_CONTRIBUTED,
                    observation_date=latest_date_str,
                    is_stale=is_stale,
                    source_attribution=f"User-entered observation ({latest_date_str}{conflict_attribution})",
                    is_promotional=is_promotional_offer,
                )
            )

        return offers
