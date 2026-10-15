from dataclasses import dataclass, field


@dataclass(frozen=True)
class Retailer:
    id: str
    name: str
    slug: str


@dataclass(frozen=True)
class Store:
    id: str
    retailer_id: str
    name: str
    slug: str
    sort_order: int


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    brand: str
    package_quantity: str
    package_unit: str
    aliases: list[str] = field(default_factory=list)
    upc: str | None = None


@dataclass(frozen=True)
class ProductOffer:
    id: str
    retailer_id: str
    store_id: str
    product_id: str
    retailer_product_id: str
    regular_price_cents: int
    promotional_price_cents: int | None
    is_available: bool

    @property
    def effective_price_cents(self) -> int:
        if (
            self.promotional_price_cents is not None
            and self.promotional_price_cents > 0
            and self.promotional_price_cents < self.regular_price_cents
        ):
            return self.promotional_price_cents
        return self.regular_price_cents

    @property
    def is_on_sale(self) -> bool:
        return (
            self.promotional_price_cents is not None
            and 0 < self.promotional_price_cents < self.regular_price_cents
        )


@dataclass(frozen=True)
class GroceryItem:
    id: str
    product_id: str
    quantity: int


@dataclass
class GroceryList:
    id: str
    name: str | None
    items: list[GroceryItem] = field(default_factory=list)


@dataclass(frozen=True)
class ShoppingPlanItem:
    product_id: str
    product_name: str
    store_id: str
    store_name: str
    quantity: int
    unit_price_cents: int
    regular_price_cents: int
    is_on_sale: bool
    subtotal_cents: int


@dataclass(frozen=True)
class ShoppingPlan:
    is_complete: bool
    store_ids: list[str]
    stores: list[Store]
    items: list[ShoppingPlanItem]
    total_cents: int
    missing_product_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ComparisonResult:
    one_store_plan: ShoppingPlan
    best_plan: ShoppingPlan
    savings_cents: int | None
    additional_stops: int
