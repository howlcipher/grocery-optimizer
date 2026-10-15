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
    for ret in SEED_RETAILERS:
        existing_ret = db.query(RetailerModel).filter_by(id=ret.id).first()
        if not existing_ret:
            db.add(RetailerModel(id=ret.id, name=ret.name, slug=ret.slug))
        else:
            existing_ret.name = ret.name
            existing_ret.slug = ret.slug

    # Seed Stores
    for store in SEED_STORES:
        existing_store = db.query(StoreModel).filter_by(id=store.id).first()
        if not existing_store:
            db.add(
                StoreModel(
                    id=store.id,
                    retailer_id=store.retailer_id,
                    name=store.name,
                    slug=store.slug,
                    sort_order=store.sort_order,
                    address=getattr(store, "address", None),
                    city=getattr(store, "city", None),
                    state=getattr(store, "state", None),
                    zip_code=getattr(store, "zip_code", None),
                    is_unresolved_location=getattr(store, "is_unresolved_location", False),
                )
            )
        else:
            existing_store.name = store.name
            existing_store.slug = store.slug
            existing_store.sort_order = store.sort_order
            existing_store.address = getattr(store, "address", None)
            existing_store.city = getattr(store, "city", None)
            existing_store.state = getattr(store, "state", None)
            existing_store.zip_code = getattr(store, "zip_code", None)
            existing_store.is_unresolved_location = getattr(store, "is_unresolved_location", False)

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
                )
            )
        else:
            existing_prod.name = prod.name
            existing_prod.brand = prod.brand
            existing_prod.package_quantity = prod.package_quantity
            existing_prod.package_unit = prod.package_unit
            existing_prod.aliases = prod.aliases
            existing_prod.upc = prod.upc

    # Seed Offers
    for off in SEED_OFFERS:
        existing_off = db.query(ProductOfferModel).filter_by(id=off.id).first()
        if not existing_off:
            db.add(
                ProductOfferModel(
                    id=off.id,
                    retailer_id=off.retailer_id,
                    store_id=off.store_id,
                    product_id=off.product_id,
                    retailer_product_id=off.retailer_product_id,
                    regular_price_cents=off.regular_price_cents,
                    promotional_price_cents=off.promotional_price_cents,
                    is_available=off.is_available,
                )
            )
        else:
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
