import hashlib
import secrets
import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.schemas import (
    BatchPriceObservationCreateRequest,
    BatchPriceObservationResponse,
    ComparisonResponse,
    GroceryItemAddRequest,
    GroceryItemUpdateRequest,
    GroceryListCreateRequest,
    GroceryListResponse,
    GroceryListUpdateRequest,
    PlanItemResponse,
    PriceObservationCreateRequest,
    PriceObservationResponse,
    PriceObservationUpdateRequest,
    ProductPricesComparisonResponse,
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
    PriceObservationModel,
    ProductModel,
    RetailerModel,
    StoreModel,
)
from app.providers.base import RetailerProvider
from app.providers.mock import MockRetailerProvider
from app.providers.user_contributed import UserContributedRetailerProvider

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


def _generate_edit_token() -> tuple[str, str]:
    """Generate a secure raw edit token and its SHA-256 hash."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return raw_token, token_hash


def _verify_edit_token(raw_token: str | None, token_hash: str | None) -> bool:
    """Verify that a raw token matches the stored token hash."""
    if not raw_token or not token_hash:
        return False
    computed = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return secrets.compare_digest(computed, token_hash)


def _infer_retailer_brand(store_name: str) -> str:
    """Infer standardized retailer brand name from store description."""
    s_lower = store_name.lower()
    known_brands = [
        ("meijer", "Meijer"),
        ("kroger", "Kroger"),
        ("aldi", "ALDI"),
        ("trader joe", "Trader Joe's"),
        ("whole foods", "Whole Foods Market"),
        ("costco", "Costco"),
        ("target", "Target"),
        ("walmart", "Walmart"),
        ("fresh thyme", "Fresh Thyme"),
        ("fresh basket", "Fresh Basket"),
        ("value foods", "Value Foods"),
        ("busch's", "Busch's"),
    ]
    for key, brand in known_brands:
        if key in s_lower:
            return brand

    if " - " in store_name:
        return store_name.split(" - ")[0].strip()
    if "," in store_name:
        return store_name.split(",")[0].strip()
    return store_name.strip()


def _resolve_or_create_store(
    db: Session,
    store_name: str,
    store_id: str | None = None,
    retailer_name: str | None = None,
    address: str | None = None,
    city: str | None = None,
    state: str | None = None,
    zip_code: str | None = None,
) -> StoreModel:
    """Resolve an existing physical store or create a new store with physical locality."""
    # 1. Direct store_id lookup
    if store_id:
        store = db.query(StoreModel).filter(StoreModel.id == store_id).first()
        if store:
            return store

    cleaned_store_name = store_name.strip()
    cleaned_zip = zip_code.strip() if zip_code and zip_code.strip() else None
    cleaned_city = city.strip() if city and city.strip() else None
    cleaned_state = state.strip().upper() if state and state.strip() else None
    cleaned_address = address.strip() if address and address.strip() else None

    # Determine retailer brand
    inferred_brand = (
        retailer_name.strip()
        if retailer_name and retailer_name.strip()
        else _infer_retailer_brand(cleaned_store_name)
    )
    retailer_slug = inferred_brand.lower().replace(" ", "-").replace("'", "")

    retailer = (
        db.query(RetailerModel)
        .filter(
            (RetailerModel.slug == retailer_slug)
            | (func.lower(RetailerModel.name) == inferred_brand.lower())
        )
        .first()
    )
    if not retailer:
        retailer = RetailerModel(
            id=f"ret-{retailer_slug}-{uuid.uuid4().hex[:4]}",
            name=inferred_brand,
            slug=retailer_slug,
        )
        db.add(retailer)
        db.flush()

    # 2. Location-aware matching if ZIP is present
    if cleaned_zip:
        query = db.query(StoreModel).filter(
            StoreModel.retailer_id == retailer.id,
            StoreModel.zip_code == cleaned_zip,
            StoreModel.is_unresolved_location.is_(False),
        )
        if cleaned_address:
            query = query.filter(func.lower(StoreModel.address) == cleaned_address.lower())
        store = query.first()
        if store:
            return store

        # Create distinct physical store for this locality
        store_slug = f"{retailer_slug}-{cleaned_zip}-{uuid.uuid4().hex[:4]}"
        store = StoreModel(
            id=f"store-{store_slug}",
            retailer_id=retailer.id,
            name=cleaned_store_name,
            slug=store_slug,
            address=cleaned_address,
            city=cleaned_city,
            state=cleaned_state,
            zip_code=cleaned_zip,
            is_unresolved_location=False,
            sort_order=100,
        )
        db.add(store)
        db.flush()
        return store

    # 3. Unresolved fallback: Match existing unresolved store with exact name under this retailer
    store = (
        db.query(StoreModel)
        .filter(
            StoreModel.retailer_id == retailer.id,
            func.lower(StoreModel.name) == cleaned_store_name.lower(),
            StoreModel.is_unresolved_location.is_(True),
        )
        .first()
    )
    if store:
        return store

    store_slug = f"{retailer_slug}-unresolved-{uuid.uuid4().hex[:6]}"
    store = StoreModel(
        id=f"store-{store_slug}",
        retailer_id=retailer.id,
        name=cleaned_store_name,
        slug=store_slug,
        address=cleaned_address,
        city=cleaned_city,
        state=cleaned_state,
        zip_code=None,
        is_unresolved_location=True,
        sort_order=100,
    )
    db.add(store)
    db.flush()
    return store


def _to_observation_response(
    obs: PriceObservationModel,
    product: ProductModel | None,
    store: StoreModel | None = None,
    edit_token: str | None = None,
) -> PriceObservationResponse:
    today = date.today()
    obs_date = obs.observation_date
    is_stale = (today - obs_date).days > 30 if isinstance(obs_date, date) else False
    date_str = obs_date.isoformat() if isinstance(obs_date, date) else str(obs_date)
    cents = obs.price_cents
    formatted = f"${cents // 100}.{cents % 100:02d}"

    resolved_store = store or getattr(obs, "store", None)
    store_city = getattr(resolved_store, "city", None) if resolved_store else None
    store_state = getattr(resolved_store, "state", None) if resolved_store else None
    store_zip = getattr(resolved_store, "zip_code", None) if resolved_store else None
    is_unresolved = getattr(resolved_store, "is_unresolved_location", False) if resolved_store else False

    return PriceObservationResponse(
        id=obs.id,
        product_id=obs.product_id,
        product_name=product.name if product else "Unknown Product",
        product_brand=product.brand if product else "Unknown Brand",
        store_id=obs.store_id,
        store_name=obs.store_name,
        store_city=store_city,
        store_state=store_state,
        store_zip_code=store_zip,
        is_unresolved_location=is_unresolved,
        price_cents=cents,
        formatted_price=formatted,
        observation_date=date_str,
        is_promotional=obs.is_promotional,
        is_stale=is_stale,
        notes=obs.notes,
        source="user_contributed",
        source_attribution=f"User-entered observation ({date_str})",
        edit_token=edit_token,
        created_at=obs.created_at,
        updated_at=obs.updated_at,
    )


@router.get("/stores", response_model=list[StoreResponse], tags=["stores"])
def get_stores(
    zip_code: str | None = Query(default=None, description="Filter stores by ZIP code"),
    q: str | None = Query(default=None, description="Search by store name, retailer, or city"),
    limit: int = Query(default=50, ge=1, le=100, description="Max stores to return"),
    db: Session = Depends(get_db),
):
    """Retrieve physical grocery stores with locality metadata."""
    query = db.query(StoreModel).options(joinedload(StoreModel.retailer))
    if zip_code and zip_code.strip():
        query = query.filter(StoreModel.zip_code == zip_code.strip())
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.filter(
            (func.lower(StoreModel.name).like(term))
            | (func.lower(StoreModel.city).like(term))
            | (func.lower(StoreModel.address).like(term))
        )

    stores = query.order_by(StoreModel.sort_order.asc(), StoreModel.name.asc()).limit(limit).all()
    return [
        StoreResponse(
            id=s.id,
            retailer_name=s.retailer.name if s.retailer else s.name,
            name=s.name,
            sort_order=s.sort_order,
            address=s.address,
            city=s.city,
            state=s.state,
            zip_code=s.zip_code,
            is_unresolved_location=s.is_unresolved_location,
        )
        for s in stores
    ]


@router.post(
    "/lists/{list_id}/compare",
    response_model=ComparisonResponse,
    tags=["compare"],
)
def compare_prices_for_list(
    list_id: str,
    source: str = Query(
        default="demonstration",
        description="Pricing source: 'demonstration' (seeded mock) or 'user_contributed' (consumer observations)",
    ),
    zip_code: str | None = Query(
        default=None,
        description="Optional ZIP code to restrict store comparisons to local physical stores (e.g. 48042)",
    ),
    db: Session = Depends(get_db),
    provider: RetailerProvider = Depends(get_retailer_provider),
):
    """Compare stores and calculate cheapest 1-store and <=2-store shopping plans.

    Guarantees strict separation between demonstration sample data and user observations.
    Never mixes incompatible sources into a claimed savings figure.
    Supports physical store geographic filtering by ZIP code.
    """
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

    # Determine provider based on requested source
    if source == "user_contributed":
        active_provider: RetailerProvider = UserContributedRetailerProvider(db=db, zip_code=zip_code)
        is_demo = False
        pricing_source = "user_contributed"
        pricing_label = "User-Entered Observations"
        if zip_code:
            notice = (
                f"Prices are consumer-entered observations filtered to ZIP {zip_code}. "
                "Only physical stores located in this area are included."
            )
        else:
            notice = (
                "Prices are consumer-entered observations. Missing observation data does not mean "
                "stores lack this item. We never mix demonstration data with real observations."
            )
    else:
        active_provider = provider
        is_demo = True
        pricing_source = "demonstration"
        pricing_label = "Demonstration Prices (Sample Data)"
        notice = "Prices shown are demonstration sample data from the mission seeder for feature testing."

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

    # Load stores via active provider abstraction
    domain_stores = active_provider.get_stores()
    store_ids = [s.id for s in domain_stores]

    # Map store to retailer display name for presentation
    retailer_names = {r.id: r.name for r in db.query(RetailerModel).all()}
    store_retailer_name_map = {
        s.id: retailer_names.get(s.retailer_id, s.name) for s in domain_stores
    }

    # Load offers via active provider abstraction
    requested_prod_ids = list(domain_products.keys())
    domain_offers = active_provider.get_offers(
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
                address=getattr(s, "address", None),
                city=getattr(s, "city", None),
                state=getattr(s, "state", None),
                zip_code=getattr(s, "zip_code", None),
                is_unresolved_location=getattr(s, "is_unresolved_location", False),
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
        pricing_source=pricing_source,
        pricing_source_label=pricing_label,
        is_demonstration=is_demo,
        data_notice=notice,
        zip_code=zip_code,
    )


# --- User-Contributed Price Observation Routes ---


@router.get(
    "/price-observations",
    response_model=list[PriceObservationResponse],
    tags=["observations"],
)
def get_price_observations(
    product_id: str | None = Query(default=None, description="Filter by product ID"),
    store_id: str | None = Query(default=None, description="Filter by store ID"),
    zip_code: str | None = Query(default=None, description="Filter by store ZIP code"),
    limit: int = Query(default=50, ge=1, le=100, description="Max observations to return"),
    db: Session = Depends(get_db),
):
    """Retrieve community price observations. Public feeds strictly exclude edit tokens."""
    query = (
        db.query(PriceObservationModel)
        .options(
            joinedload(PriceObservationModel.product),
            joinedload(PriceObservationModel.store),
        )
        .order_by(
            PriceObservationModel.observation_date.desc(),
            PriceObservationModel.created_at.desc(),
        )
    )
    if product_id:
        query = query.filter(PriceObservationModel.product_id == product_id)
    if store_id:
        query = query.filter(PriceObservationModel.store_id == store_id)
    if zip_code and zip_code.strip():
        query = query.join(PriceObservationModel.store).filter(
            StoreModel.zip_code == zip_code.strip(),
            StoreModel.is_unresolved_location.is_(False),
        )

    models = query.limit(limit).all()
    # Edit token is intentionally omitted (None) on public read calls
    return [_to_observation_response(obs, obs.product, obs.store, edit_token=None) for obs in models]


@router.post(
    "/price-observations",
    response_model=PriceObservationResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["observations"],
)
def create_price_observation(
    body: PriceObservationCreateRequest,
    x_edit_token: str | None = Header(default=None, alias="X-Edit-Token"),
    db: Session = Depends(get_db),
):
    """Record a consumer-observed grocery store price with capability-based edit authorization."""
    # Validate canonical product
    product = db.query(ProductModel).filter(ProductModel.id == body.product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product not found in canonical catalog",
        )

    # Validate price bounds (1 cent to $500.00)
    if body.price_cents <= 0 or body.price_cents > 50000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please enter a valid price between $0.01 and $500.00",
        )

    # Validate observation date
    try:
        obs_date = datetime.strptime(body.observation_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid observation date format. Please use YYYY-MM-DD.",
        )

    today = date.today()
    if obs_date > today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Observation date cannot be in the future.",
        )
    if (today - obs_date).days > 365:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Observation date cannot be older than one year.",
        )

    # Resolve or create physical store
    store = _resolve_or_create_store(
        db=db,
        store_name=body.store_name,
        store_id=body.store_id,
        retailer_name=body.retailer_name,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
    )

    # Duplicate / correction check:
    # If incoming request presents an edit token, check if this contributor already has an observation
    # for this product, store, and date. If so, update their own observation.
    # If no matching token or different contributor, record a new distinct observation.
    if x_edit_token:
        incoming_hash = hashlib.sha256(x_edit_token.encode("utf-8")).hexdigest()
        existing = (
            db.query(PriceObservationModel)
            .filter(
                PriceObservationModel.product_id == body.product_id,
                PriceObservationModel.store_id == store.id,
                PriceObservationModel.observation_date == obs_date,
                PriceObservationModel.edit_token_hash == incoming_hash,
            )
            .first()
        )
        if existing:
            existing.price_cents = body.price_cents
            existing.is_promotional = body.is_promotional
            existing.notes = body.notes
            existing.updated_at = datetime.now(UTC)
            db.commit()
            db.refresh(existing)
            return _to_observation_response(existing, product, store, edit_token=x_edit_token)

    # Create new observation with cryptographically secure edit token
    raw_token, token_hash = _generate_edit_token()
    new_obs = PriceObservationModel(
        id=str(uuid.uuid4()),
        product_id=body.product_id,
        store_id=store.id,
        store_name=store.name,
        price_cents=body.price_cents,
        observation_date=obs_date,
        is_promotional=body.is_promotional,
        notes=body.notes,
        contributor_id=body.contributor_id,
        edit_token_hash=token_hash,
    )
    db.add(new_obs)
    db.commit()
    db.refresh(new_obs)
    return _to_observation_response(new_obs, product, store, edit_token=raw_token)


@router.post(
    "/price-observations/batch",
    response_model=BatchPriceObservationResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["observations"],
)
def create_batch_price_observations(
    body: BatchPriceObservationCreateRequest,
    x_edit_token: str | None = Header(default=None, alias="X-Edit-Token"),
    db: Session = Depends(get_db),
):
    """Rapidly record multiple product prices observed during a single shopping trip."""
    # Validate observation date
    try:
        obs_date = datetime.strptime(body.observation_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid observation date format. Please use YYYY-MM-DD.",
        )

    today = date.today()
    if obs_date > today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Observation date cannot be in the future.",
        )
    if (today - obs_date).days > 365:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Observation date cannot be older than one year.",
        )

    store = _resolve_or_create_store(
        db=db,
        store_name=body.store_name,
        store_id=body.store_id,
        retailer_name=body.retailer_name,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
    )

    created_obs_responses: list[PriceObservationResponse] = []
    for item in body.items:
        product = db.query(ProductModel).filter(ProductModel.id == item.product_id).first()
        if not product:
            continue

        if item.price_cents <= 0 or item.price_cents > 50000:
            continue

        raw_token, token_hash = _generate_edit_token()
        new_obs = PriceObservationModel(
            id=str(uuid.uuid4()),
            product_id=item.product_id,
            store_id=store.id,
            store_name=store.name,
            price_cents=item.price_cents,
            observation_date=obs_date,
            is_promotional=item.is_promotional,
            notes=item.notes,
            edit_token_hash=token_hash,
        )
        db.add(new_obs)
        db.flush()
        created_obs_responses.append(
            _to_observation_response(new_obs, product, store, edit_token=raw_token)
        )

    db.commit()
    retailer = store.retailer if store.retailer else db.query(RetailerModel).filter_by(id=store.retailer_id).first()
    store_resp = StoreResponse(
        id=store.id,
        retailer_name=retailer.name if retailer else store.name,
        name=store.name,
        sort_order=store.sort_order,
        address=store.address,
        city=store.city,
        state=store.state,
        zip_code=store.zip_code,
        is_unresolved_location=store.is_unresolved_location,
    )
    return BatchPriceObservationResponse(
        observations=created_obs_responses,
        store=store_resp,
        created_count=len(created_obs_responses),
    )


@router.patch(
    "/price-observations/{observation_id}",
    response_model=PriceObservationResponse,
    tags=["observations"],
)
def update_price_observation(
    observation_id: str,
    body: PriceObservationUpdateRequest,
    x_edit_token: str | None = Header(default=None, alias="X-Edit-Token"),
    db: Session = Depends(get_db),
):
    """Correct an existing price observation. Requires capability edit token."""
    obs = (
        db.query(PriceObservationModel)
        .options(
            joinedload(PriceObservationModel.product),
            joinedload(PriceObservationModel.store),
        )
        .filter(PriceObservationModel.id == observation_id)
        .first()
    )
    if not obs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Price observation not found",
        )

    # Capability-based authorization check
    if not obs.edit_token_hash or not _verify_edit_token(x_edit_token, obs.edit_token_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing edit token. You can only modify observations you recorded.",
        )

    if body.price_cents is not None:
        if body.price_cents <= 0 or body.price_cents > 50000:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Please enter a valid price between $0.01 and $500.00",
            )
        obs.price_cents = body.price_cents

    if body.observation_date is not None:
        try:
            obs_date = datetime.strptime(body.observation_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid observation date format. Please use YYYY-MM-DD.",
            )
        today = date.today()
        if obs_date > today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Observation date cannot be in the future.",
            )
        if (today - obs_date).days > 365:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Observation date cannot be older than one year.",
            )
        obs.observation_date = obs_date

    if body.store_name is not None and body.store_name.strip():
        store = _resolve_or_create_store(db=db, store_name=body.store_name)
        obs.store_id = store.id
        obs.store_name = store.name

    if body.is_promotional is not None:
        obs.is_promotional = body.is_promotional

    if body.notes is not None:
        obs.notes = body.notes

    obs.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(obs)
    return _to_observation_response(obs, obs.product, obs.store, edit_token=x_edit_token)


@router.delete(
    "/price-observations/{observation_id}",
    tags=["observations"],
)
def delete_price_observation(
    observation_id: str,
    x_edit_token: str | None = Header(default=None, alias="X-Edit-Token"),
    db: Session = Depends(get_db),
):
    """Delete an erroneous price observation. Requires capability edit token."""
    obs = (
        db.query(PriceObservationModel)
        .filter(PriceObservationModel.id == observation_id)
        .first()
    )
    if not obs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Price observation not found",
        )

    # Capability-based authorization check
    if not obs.edit_token_hash or not _verify_edit_token(x_edit_token, obs.edit_token_hash):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing edit token. You can only delete observations you recorded.",
        )

    db.delete(obs)
    db.commit()
    return {"status": "deleted", "id": observation_id}


@router.get(
    "/products/{product_id}/prices",
    response_model=ProductPricesComparisonResponse,
    tags=["observations"],
)
def compare_product_store_prices(
    product_id: str,
    zip_code: str | None = Query(default=None, description="Optional ZIP code filter"),
    db: Session = Depends(get_db),
):
    """Compare observed prices for a specific canonical product across physical stores."""
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found in canonical catalog",
        )

    query = (
        db.query(PriceObservationModel)
        .options(joinedload(PriceObservationModel.store))
        .filter(PriceObservationModel.product_id == product_id)
    )

    if zip_code and zip_code.strip():
        query = query.join(PriceObservationModel.store).filter(
            StoreModel.zip_code == zip_code.strip(),
            StoreModel.is_unresolved_location.is_(False),
        )

    raw_observations = query.order_by(
        PriceObservationModel.observation_date.desc(),
        PriceObservationModel.updated_at.desc(),
    ).all()

    # De-duplicate to newest observation per store
    latest_per_store: dict[str, PriceObservationModel] = {}
    for obs in raw_observations:
        store_key = obs.store_id or obs.store_name.lower().strip()
        if store_key not in latest_per_store:
            latest_per_store[store_key] = obs

    # Sort latest observations by price asc
    sorted_observations = sorted(
        latest_per_store.values(),
        key=lambda o: (o.price_cents, o.observation_date),
    )

    # Public response strictly omits edit tokens
    obs_responses = [_to_observation_response(obs, product, obs.store, edit_token=None) for obs in sorted_observations]
    unique_stores = {obs.store_name for obs in sorted_observations}
    cheapest = obs_responses[0] if obs_responses else None

    return ProductPricesComparisonResponse(
        product=ProductResponse.model_validate(product),
        observations=obs_responses,
        cheapest_observation=cheapest,
        store_count=len(unique_stores),
        source="user_contributed",
    )

