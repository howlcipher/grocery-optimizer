from sqlalchemy.orm import Session

from app.persistence.database import SessionLocal, engine
from app.persistence.models import (
    Base,
    ProductModel,
    ProductOfferModel,
    RetailerModel,
    StoreModel,
)
from app.seed.data import SEED_OFFERS, SEED_PRODUCTS, SEED_RETAILERS, SEED_STORES


def seed_database(db: Session) -> None:
    """Seed retailers, stores, canonical products, and offers deterministically."""
    # Seed Retailers
    retailer_id_map: dict[str, str] = {}
    for ret in SEED_RETAILERS:
        existing_ret = (
            db.query(RetailerModel)
            .filter((RetailerModel.id == ret.id) | (RetailerModel.slug == ret.slug))
            .first()
        )
        if not existing_ret:
            db.add(RetailerModel(id=ret.id, name=ret.name, slug=ret.slug))
            retailer_id_map[ret.id] = ret.id
        else:
            existing_ret.name = ret.name
            existing_ret.slug = ret.slug
            retailer_id_map[ret.id] = existing_ret.id

    db.flush()

    # Seed Stores
    store_id_map: dict[str, str] = {}
    for store in SEED_STORES:
        resolved_ret_id = retailer_id_map.get(store.retailer_id, store.retailer_id)
        existing_store = (
            db.query(StoreModel)
            .filter((StoreModel.id == store.id) | (StoreModel.slug == store.slug))
            .first()
        )
        if not existing_store:
            db.add(
                StoreModel(
                    id=store.id,
                    retailer_id=resolved_ret_id,
                    name=store.name,
                    slug=store.slug,
                    sort_order=store.sort_order,
                    address=getattr(store, "address", None),
                    city=getattr(store, "city", None),
                    state=getattr(store, "state", None),
                    zip_code=getattr(store, "zip_code", None),
                    latitude=getattr(store, "latitude", None),
                    longitude=getattr(store, "longitude", None),
                    is_unresolved_location=getattr(store, "is_unresolved_location", False),
                )
            )
            store_id_map[store.id] = store.id
        else:
            existing_store.name = store.name
            existing_store.slug = store.slug
            existing_store.retailer_id = resolved_ret_id
            existing_store.sort_order = store.sort_order
            existing_store.address = getattr(store, "address", None)
            existing_store.city = getattr(store, "city", None)
            existing_store.state = getattr(store, "state", None)
            existing_store.zip_code = getattr(store, "zip_code", None)
            existing_store.latitude = getattr(store, "latitude", None)
            existing_store.longitude = getattr(store, "longitude", None)
            existing_store.is_unresolved_location = getattr(store, "is_unresolved_location", False)
            store_id_map[store.id] = existing_store.id

    db.flush()

    # Seed Products
    for prod in SEED_PRODUCTS:
        existing_prod = db.query(ProductModel).filter_by(id=prod.id).first()
        if not existing_prod:
            db.add(
                ProductModel(
                    id=prod.id,
                    name=prod.name,
                    brand=prod.brand,
                    package_quantity=prod.package_quantity,
                    package_unit=prod.package_unit,
                    aliases=prod.aliases,
                    upc=prod.upc,
                    category=getattr(prod, "category", None),
                    canonical_group=getattr(prod, "canonical_group", None),
                )
            )
        else:
            existing_prod.name = prod.name
            existing_prod.brand = prod.brand
            existing_prod.package_quantity = prod.package_quantity
            existing_prod.package_unit = prod.package_unit
            existing_prod.aliases = prod.aliases
            existing_prod.upc = prod.upc
            existing_prod.category = getattr(prod, "category", None)
            existing_prod.canonical_group = getattr(prod, "canonical_group", None)

    db.flush()

    # Seed Offers
    for off in SEED_OFFERS:
        resolved_ret_id = retailer_id_map.get(off.retailer_id, off.retailer_id)
        resolved_store_id = store_id_map.get(off.store_id, off.store_id)
        existing_off = db.query(ProductOfferModel).filter_by(id=off.id).first()
        if not existing_off:
            existing_pair = (
                db.query(ProductOfferModel)
                .filter_by(store_id=resolved_store_id, product_id=off.product_id)
                .first()
            )
            if existing_pair:
                existing_pair.regular_price_cents = off.regular_price_cents
                existing_pair.promotional_price_cents = off.promotional_price_cents
                existing_pair.is_available = off.is_available
                continue
            db.add(
                ProductOfferModel(
                    id=off.id,
                    retailer_id=resolved_ret_id,
                    store_id=resolved_store_id,
                    product_id=off.product_id,
                    retailer_product_id=off.retailer_product_id,
                    regular_price_cents=off.regular_price_cents,
                    promotional_price_cents=off.promotional_price_cents,
                    is_available=off.is_available,
                )
            )
        else:
            existing_off.retailer_id = resolved_ret_id
            existing_off.store_id = resolved_store_id
            existing_off.regular_price_cents = off.regular_price_cents
            existing_off.promotional_price_cents = off.promotional_price_cents
            existing_off.is_available = off.is_available

    db.commit()


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
        print("Mock seed data loaded successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
