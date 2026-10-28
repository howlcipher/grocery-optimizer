"""Database migration tool for transitioning from PostgreSQL to local SQLite (or vice versa).

Safely copies all records (retailers, stores, products, offers, lists, list items,
and price observations) preserving IDs and relationships without modifying the source.
"""

import argparse
import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.persistence.models import (
    Base,
    GroceryListItemModel,
    GroceryListModel,
    PriceObservationModel,
    ProductModel,
    ProductOfferModel,
    RetailerModel,
    StoreModel,
)


def copy_database(source_url: str, target_url: str) -> dict[str, int]:
    """Copy all tables and rows from source database to target database."""
    # Setup engines
    src_connect_args = {"check_same_thread": False} if source_url.startswith("sqlite") else {}
    tgt_connect_args = {"check_same_thread": False} if target_url.startswith("sqlite") else {}

    src_engine = create_engine(source_url, connect_args=src_connect_args)
    tgt_engine = create_engine(target_url, connect_args=tgt_connect_args)

    # Ensure target tables exist
    Base.metadata.create_all(bind=tgt_engine)

    SrcSession = sessionmaker(bind=src_engine)
    TgtSession = sessionmaker(bind=tgt_engine)

    counts: dict[str, int] = {}

    with SrcSession() as src_db, TgtSession() as tgt_db:
        try:
            # 1. Retailers
            retailers = src_db.execute(select(RetailerModel)).scalars().all()
            for r in retailers:
                existing = tgt_db.get(RetailerModel, r.id)
                if not existing:
                    tgt_db.add(RetailerModel(id=r.id, name=r.name, slug=r.slug))
            tgt_db.flush()
            counts["retailers"] = len(retailers)

            # 2. Stores
            stores = src_db.execute(select(StoreModel)).scalars().all()
            for s in stores:
                existing = tgt_db.get(StoreModel, s.id)
                if not existing:
                    tgt_db.add(
                        StoreModel(
                            id=s.id,
                            retailer_id=s.retailer_id,
                            name=s.name,
                            slug=s.slug,
                            sort_order=s.sort_order,
                            address=s.address,
                            city=s.city,
                            state=s.state,
                            zip_code=s.zip_code,
                            latitude=s.latitude,
                            longitude=s.longitude,
                            is_unresolved_location=s.is_unresolved_location,
                        )
                    )
            tgt_db.flush()
            counts["stores"] = len(stores)

            # 3. Products
            products = src_db.execute(select(ProductModel)).scalars().all()
            for p in products:
                existing = tgt_db.get(ProductModel, p.id)
                if not existing:
                    tgt_db.add(
                        ProductModel(
                            id=p.id,
                            name=p.name,
                            brand=p.brand,
                            package_quantity=p.package_quantity,
                            package_unit=p.package_unit,
                            aliases=p.aliases or [],
                            upc=p.upc,
                            category=p.category,
                            canonical_group=p.canonical_group,
                        )
                    )
            tgt_db.flush()
            counts["products"] = len(products)

            # 4. Product Offers
            offers = src_db.execute(select(ProductOfferModel)).scalars().all()
            for o in offers:
                existing = tgt_db.get(ProductOfferModel, o.id)
                if not existing:
                    tgt_db.add(
                        ProductOfferModel(
                            id=o.id,
                            retailer_id=o.retailer_id,
                            store_id=o.store_id,
                            product_id=o.product_id,
                            retailer_product_id=o.retailer_product_id,
                            regular_price_cents=o.regular_price_cents,
                            promotional_price_cents=o.promotional_price_cents,
                            is_available=o.is_available,
                        )
                    )
            tgt_db.flush()
            counts["product_offers"] = len(offers)

            # 5. Grocery Lists
            lists = src_db.execute(select(GroceryListModel)).scalars().all()
            for gl in lists:
                existing = tgt_db.get(GroceryListModel, gl.id)
                if not existing:
                    tgt_db.add(
                        GroceryListModel(
                            id=gl.id,
                            name=gl.name,
                            created_at=gl.created_at,
                            updated_at=gl.updated_at,
                        )
                    )
            tgt_db.flush()
            counts["grocery_lists"] = len(lists)

            # 6. Grocery List Items
            items = src_db.execute(select(GroceryListItemModel)).scalars().all()
            for itm in items:
                existing = tgt_db.get(GroceryListItemModel, itm.id)
                if not existing:
                    tgt_db.add(
                        GroceryListItemModel(
                            id=itm.id,
                            list_id=itm.list_id,
                            product_id=itm.product_id,
                            quantity=itm.quantity,
                            created_at=itm.created_at,
                            updated_at=itm.updated_at,
                        )
                    )
            tgt_db.flush()
            counts["grocery_list_items"] = len(items)

            # 7. Price Observations
            observations = src_db.execute(select(PriceObservationModel)).scalars().all()
            for obs in observations:
                existing = tgt_db.get(PriceObservationModel, obs.id)
                if not existing:
                    tgt_db.add(
                        PriceObservationModel(
                            id=obs.id,
                            product_id=obs.product_id,
                            store_id=obs.store_id,
                            store_name=obs.store_name,
                            price_cents=obs.price_cents,
                            observation_date=obs.observation_date,
                            is_promotional=obs.is_promotional,
                            notes=obs.notes,
                            contributor_id=obs.contributor_id,
                            edit_token_hash=obs.edit_token_hash,
                            created_at=obs.created_at,
                            updated_at=obs.updated_at,
                        )
                    )
            tgt_db.commit()
            counts["price_observations"] = len(observations)
            return counts
        except Exception:
            tgt_db.rollback()
            raise


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Migrate Grocery Optimizer database from PostgreSQL to SQLite or between databases."
    )
    parser.add_argument(
        "--source",
        "-s",
        required=True,
        help="Source database URL (e.g. postgresql+psycopg://user:pass@localhost:5432/grocery_optimizer)",
    )
    parser.add_argument(
        "--target",
        "-t",
        required=True,
        help="Target database URL (e.g. sqlite:////home/user/.local/share/grocery-optimizer/grocery_optimizer.db)",
    )
    args = parser.parse_args()

    print(f"Migrating from {args.source} to {args.target}...")
    try:
        counts = copy_database(args.source, args.target)
        print("Migration successful! Copied rows:")
        for tbl, count in counts.items():
            print(f"  {tbl}: {count}")
    except Exception as e:  # noqa: BLE001
        print(f"Error during migration: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
