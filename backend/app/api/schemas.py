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
