import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.persistence.database import Base


def _utcnow():
    return datetime.now(UTC)


class RetailerModel(Base):
    __tablename__ = "retailers"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(128), nullable=False, unique=True)

    stores = relationship("StoreModel", back_populates="retailer", cascade="all, delete-orphan")
    offers = relationship("ProductOfferModel", back_populates="retailer", cascade="all, delete-orphan")


class StoreModel(Base):
    __tablename__ = "stores"

    id = Column(String(64), primary_key=True)
    retailer_id = Column(String(64), ForeignKey("retailers.id"), nullable=False)
    name = Column(String(255), nullable=False)
    slug = Column(String(128), nullable=False, unique=True)
    sort_order = Column(Integer, nullable=False, default=0)
    address = Column(String(255), nullable=True)
    city = Column(String(128), nullable=True)
    state = Column(String(32), nullable=True)
    zip_code = Column(String(20), nullable=True, index=True)
    is_unresolved_location = Column(Boolean, nullable=False, default=False)

    retailer = relationship("RetailerModel", back_populates="stores")
    offers = relationship("ProductOfferModel", back_populates="store", cascade="all, delete-orphan")


class ProductModel(Base):
    __tablename__ = "products"

    id = Column(String(64), primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    brand = Column(String(255), nullable=False, index=True)
    package_quantity = Column(String(64), nullable=False)
    package_unit = Column(String(32), nullable=False)
    aliases = Column(JSON, nullable=False, default=list)
    upc = Column(String(64), nullable=True, index=True)

    offers = relationship("ProductOfferModel", back_populates="product", cascade="all, delete-orphan")


class ProductOfferModel(Base):
    __tablename__ = "product_offers"

    id = Column(String(64), primary_key=True)
    retailer_id = Column(String(64), ForeignKey("retailers.id"), nullable=False)
    store_id = Column(String(64), ForeignKey("stores.id"), nullable=False, index=True)
    product_id = Column(String(64), ForeignKey("products.id"), nullable=False, index=True)
    retailer_product_id = Column(String(64), nullable=False)
    regular_price_cents = Column(Integer, nullable=False)
    promotional_price_cents = Column(Integer, nullable=True)
    is_available = Column(Boolean, nullable=False, default=True)

    retailer = relationship("RetailerModel", back_populates="offers")
    store = relationship("StoreModel", back_populates="offers")
    product = relationship("ProductModel", back_populates="offers")

    __table_args__ = (
        UniqueConstraint("store_id", "product_id", name="uq_store_product_offer"),
    )


class GroceryListModel(Base):
    __tablename__ = "grocery_lists"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    items = relationship("GroceryListItemModel", back_populates="grocery_list", cascade="all, delete-orphan")


class GroceryListItemModel(Base):
    __tablename__ = "grocery_list_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    list_id = Column(String(36), ForeignKey("grocery_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(64), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    grocery_list = relationship("GroceryListModel", back_populates="items")
    product = relationship("ProductModel")

    __table_args__ = (
        UniqueConstraint("list_id", "product_id", name="uq_list_product"),
    )


class PriceObservationModel(Base):
    __tablename__ = "price_observations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(64), ForeignKey("products.id"), nullable=False, index=True)
    store_id = Column(String(64), ForeignKey("stores.id"), nullable=True, index=True)
    store_name = Column(String(255), nullable=False)
    price_cents = Column(Integer, nullable=False)
    observation_date = Column(Date, nullable=False, index=True)
    is_promotional = Column(Boolean, nullable=False, default=False)
    notes = Column(String(500), nullable=True)
    contributor_id = Column(String(64), nullable=True, index=True)
    edit_token_hash = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    product = relationship("ProductModel")
    store = relationship("StoreModel")

