from datetime import datetime

from pydantic import BaseModel, Field


# Product Schemas
class ProductResponse(BaseModel):
    id: str
    name: str
    brand: str
    package_quantity: str
    package_unit: str
    aliases: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# Grocery List Item Schemas
class GroceryItemAddRequest(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=99)


class GroceryItemUpdateRequest(BaseModel):
    quantity: int = Field(ge=1, le=99)


class GroceryItemResponse(BaseModel):
    id: str
    product_id: str
    quantity: int
    product: ProductResponse
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Grocery List Schemas
class GroceryListCreateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)


class GroceryListUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)


class GroceryListResponse(BaseModel):
    id: str
    name: str | None = None
    items: list[GroceryItemResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Shopping Plan Schemas
class StoreResponse(BaseModel):
    id: str
    retailer_name: str
    name: str
    sort_order: int
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_unresolved_location: bool = False

    model_config = {"from_attributes": True}


class PlanItemResponse(BaseModel):
    product_id: str
    product_name: str
    store_id: str
    store_name: str
    quantity: int
    unit_price_cents: int
    regular_price_cents: int
    is_on_sale: bool
    subtotal_cents: int


class ShoppingPlanResponse(BaseModel):
    is_complete: bool
    stores: list[StoreResponse] = Field(default_factory=list)
    items: list[PlanItemResponse] = Field(default_factory=list)
    total_cents: int
    missing_products: list[ProductResponse] = Field(default_factory=list)


class ComparisonResponse(BaseModel):
    one_store_plan: ShoppingPlanResponse
    best_plan: ShoppingPlanResponse
    savings_cents: int | None = None
    additional_stops: int = 0
    pricing_source: str = "demonstration"
    pricing_source_label: str = "Demonstration Prices (Sample Data)"
    is_demonstration: bool = True
    data_notice: str | None = None
    zip_code: str | None = None
    region_scope: str = "exact"
    compared_zip_codes: list[str] = Field(default_factory=list)


# Price Observation Schemas
class PriceObservationCreateRequest(BaseModel):
    product_id: str
    store_name: str = Field(min_length=1, max_length=255)
    store_id: str | None = Field(default=None, description="Optional existing store ID")
    retailer_name: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=32)
    zip_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    price_cents: int = Field(ge=1, le=50000, description="Price in integer cents ($0.01 to $500.00)")
    observation_date: str = Field(description="ISO observation date YYYY-MM-DD")
    is_promotional: bool = False
    notes: str | None = Field(default=None, max_length=500)
    contributor_id: str | None = Field(default=None, max_length=64)


class TripItemObservation(BaseModel):
    product_id: str
    price_cents: int = Field(ge=1, le=50000, description="Price in integer cents ($0.01 to $500.00)")
    is_promotional: bool = False
    notes: str | None = Field(default=None, max_length=500)


class BatchPriceObservationCreateRequest(BaseModel):
    store_name: str = Field(min_length=1, max_length=255)
    store_id: str | None = Field(default=None)
    retailer_name: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=32)
    zip_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    observation_date: str = Field(description="ISO observation date YYYY-MM-DD")
    items: list[TripItemObservation] = Field(min_length=1, max_length=50)


class PriceObservationUpdateRequest(BaseModel):
    store_name: str | None = Field(default=None, min_length=1, max_length=255)
    store_id: str | None = Field(default=None)
    retailer_name: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=128)
    state: str | None = Field(default=None, max_length=32)
    zip_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    price_cents: int | None = Field(default=None, ge=1, le=50000)
    observation_date: str | None = None
    is_promotional: bool | None = None
    notes: str | None = Field(default=None, max_length=500)


class PriceObservationResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    product_brand: str
    store_id: str | None = None
    store_name: str
    store_city: str | None = None
    store_state: str | None = None
    store_zip_code: str | None = None
    is_unresolved_location: bool = False
    price_cents: int
    formatted_price: str
    observation_date: str
    is_promotional: bool
    is_stale: bool
    notes: str | None = None
    source: str = "user_contributed"
    source_attribution: str = "User-entered observation"
    edit_token: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BatchPriceObservationResponse(BaseModel):
    observations: list[PriceObservationResponse]
    store: StoreResponse
    created_count: int


class ProductPricesComparisonResponse(BaseModel):
    product: ProductResponse
    observations: list[PriceObservationResponse] = Field(default_factory=list)
    cheapest_observation: PriceObservationResponse | None = None
    store_count: int = 0
    source: str = "user_contributed"
    disclaimer: str = (
        "Prices are consumer-observed shelf prices for community comparison. "
        "They are not live retailer feeds or store guarantees."
    )

