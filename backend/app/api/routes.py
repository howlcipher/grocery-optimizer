import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.schemas import (
    ComparisonResponse,
    GroceryItemAddRequest,
    GroceryItemUpdateRequest,
    GroceryListCreateRequest,
    GroceryListResponse,
    GroceryListUpdateRequest,
    PlanItemResponse,
    ProductResponse,
    ShoppingPlanResponse,
    StoreResponse,
)
from app.catalog.search import search_products
from app.domain.models import (
    GroceryItem,
    Product,
)
from app.optimizer.engine import compare_shopping_plans
from app.persistence.database import get_db
from app.persistence.models import (
    GroceryListItemModel,
    GroceryListModel,
    ProductModel,
    RetailerModel,
)
from app.providers.base import RetailerProvider
from app.providers.mock import MockRetailerProvider

router = APIRouter(prefix="/api")


def get_retailer_provider(db: Session = Depends(get_db)) -> RetailerProvider:
    return MockRetailerProvider(db=db)


@router.get("/health", tags=["system"])
def health_check():
    return {"status": "ok"}


@router.get("/products", response_model=list[ProductResponse], tags=["catalog"])
def get_products(
    q: str | None = Query(default="", description="Search query"),
    limit: int = Query(default=10, ge=1, le=50, description="Max results"),
    db: Session = Depends(get_db),
):
    """Search canonical catalog products deterministically."""
    if not q or not q.strip():
        # Return top products ordered by name up to limit
        models = db.query(ProductModel).order_by(ProductModel.name.asc()).limit(limit).all()
        return [ProductResponse.model_validate(p) for p in models]

    # Convert all products to domain for deterministic ranking
    product_models = db.query(ProductModel).all()
    domain_catalog = [
        Product(
            id=p.id,
            name=p.name,
            brand=p.brand,
            package_quantity=p.package_quantity,
            package_unit=p.package_unit,
            aliases=p.aliases or [],
            upc=p.upc,
        )
        for p in product_models
    ]

    matched_domain = search_products(query=q, catalog=domain_catalog, limit=limit)
    return [
        ProductResponse(
            id=p.id,
            name=p.name,
            brand=p.brand,
            package_quantity=p.package_quantity,
            package_unit=p.package_unit,
            aliases=p.aliases,
        )
        for p in matched_domain
    ]


@router.post(
    "/lists",
    response_model=GroceryListResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["lists"],
)
def create_list(
    body: GroceryListCreateRequest | None = None,
    db: Session = Depends(get_db),
):
    """Create a new anonymous saved grocery list."""
    list_id = str(uuid.uuid4())
    name = body.name if body else None
    grocery_list = GroceryListModel(id=list_id, name=name)
    db.add(grocery_list)
    db.commit()
    db.refresh(grocery_list)
    return GroceryListResponse.model_validate(grocery_list)


@router.get("/lists/{list_id}", response_model=GroceryListResponse, tags=["lists"])
def get_list(list_id: str, db: Session = Depends(get_db)):
    """Retrieve an anonymous saved list with its items."""
    grocery_list = (
        db.query(GroceryListModel)
        .options(joinedload(GroceryListModel.items).joinedload(GroceryListItemModel.product))
        .filter(GroceryListModel.id == list_id)
        .first()
    )
    if not grocery_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grocery list not found",
        )
    return GroceryListResponse.model_validate(grocery_list)


@router.patch("/lists/{list_id}", response_model=GroceryListResponse, tags=["lists"])
def update_list(
    list_id: str,
    body: GroceryListUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update list properties such as display name."""
    grocery_list = (
        db.query(GroceryListModel)
        .options(joinedload(GroceryListModel.items).joinedload(GroceryListItemModel.product))
        .filter(GroceryListModel.id == list_id)
        .first()
    )
    if not grocery_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grocery list not found",
        )

    if body.name is not None:
        grocery_list.name = body.name

    db.commit()
    db.refresh(grocery_list)
    return GroceryListResponse.model_validate(grocery_list)


@router.post(
    "/lists/{list_id}/items",
    response_model=GroceryListResponse,
    status_code=status.HTTP_200_OK,
    tags=["items"],
)
def add_item_to_list(
    list_id: str,
    body: GroceryItemAddRequest,
    db: Session = Depends(get_db),
):
    """Add a product to list or increase quantity if already present."""
    grocery_list = db.query(GroceryListModel).filter(GroceryListModel.id == list_id).first()
    if not grocery_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grocery list not found",
        )

    product = db.query(ProductModel).filter(ProductModel.id == body.product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product not found in canonical catalog",
        )

    existing_item = (
        db.query(GroceryListItemModel)
        .filter(
            GroceryListItemModel.list_id == list_id,
            GroceryListItemModel.product_id == body.product_id,
        )
        .first()
    )

    if existing_item:
        existing_item.quantity = min(99, existing_item.quantity + body.quantity)
    else:
        # Check list size limit
        count = db.query(GroceryListItemModel).filter_by(list_id=list_id).count()
        if count >= 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Grocery list cannot exceed 100 items",
            )
        new_item = GroceryListItemModel(
            id=str(uuid.uuid4()),
            list_id=list_id,
            product_id=body.product_id,
            quantity=body.quantity,
        )
        db.add(new_item)

    db.commit()

    updated_list = (
        db.query(GroceryListModel)
        .options(joinedload(GroceryListModel.items).joinedload(GroceryListItemModel.product))
        .filter(GroceryListModel.id == list_id)
        .first()
    )
    return GroceryListResponse.model_validate(updated_list)


@router.patch(
    "/lists/{list_id}/items/{item_id}",
    response_model=GroceryListResponse,
    tags=["items"],
)
def update_item_quantity(
    list_id: str,
    item_id: str,
    body: GroceryItemUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update quantity for an item on a list."""
    item = (
        db.query(GroceryListItemModel)
        .filter(
            GroceryListItemModel.id == item_id,
            GroceryListItemModel.list_id == list_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found on grocery list",
        )

    item.quantity = body.quantity
    db.commit()

    updated_list = (
        db.query(GroceryListModel)
        .options(joinedload(GroceryListModel.items).joinedload(GroceryListItemModel.product))
        .filter(GroceryListModel.id == list_id)
        .first()
    )
    return GroceryListResponse.model_validate(updated_list)


@router.delete(
    "/lists/{list_id}/items/{item_id}",
    response_model=GroceryListResponse,
    tags=["items"],
)
def remove_item_from_list(
    list_id: str,
    item_id: str,
    db: Session = Depends(get_db),
):
    """Remove an item from a list."""
    item = (
        db.query(GroceryListItemModel)
        .filter(
            GroceryListItemModel.id == item_id,
            GroceryListItemModel.list_id == list_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found on grocery list",
        )

    db.delete(item)
    db.commit()

    updated_list = (
        db.query(GroceryListModel)
        .options(joinedload(GroceryListModel.items).joinedload(GroceryListItemModel.product))
        .filter(GroceryListModel.id == list_id)
        .first()
    )
    return GroceryListResponse.model_validate(updated_list)


@router.post(
    "/lists/{list_id}/compare",
    response_model=ComparisonResponse,
    tags=["compare"],
)
def compare_prices_for_list(
    list_id: str,
    db: Session = Depends(get_db),
    provider: RetailerProvider = Depends(get_retailer_provider),
):
    """Compare stores and calculate cheapest 1-store and <=2-store shopping plans."""
    grocery_list = (
        db.query(GroceryListModel)
        .options(joinedload(GroceryListModel.items).joinedload(GroceryListItemModel.product))
        .filter(GroceryListModel.id == list_id)
        .first()
    )
    if not grocery_list:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grocery list not found",
        )

    if not grocery_list.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot compare an empty grocery list. Please add items first.",
        )

    # Build domain requested items and products
    domain_items: list[GroceryItem] = []
    domain_products: dict[str, Product] = {}
    for it in grocery_list.items:
        domain_items.append(
            GroceryItem(id=it.id, product_id=it.product_id, quantity=it.quantity)
        )
        p = it.product
        domain_products[p.id] = Product(
            id=p.id,
            name=p.name,
            brand=p.brand,
            package_quantity=p.package_quantity,
            package_unit=p.package_unit,
            aliases=p.aliases or [],
            upc=p.upc,
        )

    # Load stores via provider abstraction
    domain_stores = provider.get_stores()
    store_ids = [s.id for s in domain_stores]

    # Map store to retailer display name for presentation
    retailer_names = {r.id: r.name for r in db.query(RetailerModel).all()}
    store_retailer_name_map = {
        s.id: retailer_names.get(s.retailer_id, s.name) for s in domain_stores
    }

    # Load offers via provider abstraction
    requested_prod_ids = list(domain_products.keys())
    domain_offers = provider.get_offers(
        product_ids=requested_prod_ids, store_ids=store_ids
    )

    # Run pure optimizer
    result = compare_shopping_plans(
        requested_items=domain_items,
        products_by_id=domain_products,
        offers=domain_offers,
        stores=domain_stores,
    )

    def to_plan_response(plan) -> ShoppingPlanResponse:
        stores_resp = [
            StoreResponse(
                id=s.id,
                retailer_name=store_retailer_name_map.get(s.id, s.name),
                name=s.name,
                sort_order=s.sort_order,
            )
            for s in plan.stores
        ]
        items_resp = [
            PlanItemResponse(
                product_id=item.product_id,
                product_name=item.product_name,
                store_id=item.store_id,
                store_name=item.store_name,
                quantity=item.quantity,
                unit_price_cents=item.unit_price_cents,
                regular_price_cents=item.regular_price_cents,
                is_on_sale=item.is_on_sale,
                subtotal_cents=item.subtotal_cents,
            )
            for item in plan.items
        ]
        missing_resp = [
            ProductResponse(
                id=domain_products[pid].id,
                name=domain_products[pid].name,
                brand=domain_products[pid].brand,
                package_quantity=domain_products[pid].package_quantity,
                package_unit=domain_products[pid].package_unit,
                aliases=domain_products[pid].aliases,
            )
            for pid in plan.missing_product_ids
            if pid in domain_products
        ]
        return ShoppingPlanResponse(
            is_complete=plan.is_complete,
            stores=stores_resp,
            items=items_resp,
            total_cents=plan.total_cents,
            missing_products=missing_resp,
        )

    return ComparisonResponse(
        one_store_plan=to_plan_response(result.one_store_plan),
        best_plan=to_plan_response(result.best_plan),
        savings_cents=result.savings_cents,
        additional_stops=result.additional_stops,
    )
