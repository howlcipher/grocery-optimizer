import hashlib
import re
import secrets
import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.rate_limiter import rate_limit_batch_observations, rate_limit_observations
from app.api.schemas import (
    BackupData,
    BackupImportResponse,
    BatchPriceObservationCreateRequest,
    BatchPriceObservationResponse,
    ComparisonResponse,
    GroceryItemAddRequest,
    GroceryItemUpdateRequest,
    GroceryListCreateRequest,
    GroceryListResponse,
    GroceryListUpdateRequest,
    ItemPriceComparisonResponse,
    ParsedPriceCandidate,
    PlanItemResponse,
    PriceImportParseRequest,
    PriceImportParseResponse,
    PriceObservationCreateRequest,
    PriceObservationResponse,
    PriceObservationUpdateRequest,
    ProductCreateRequest,
    ProductPricesComparisonResponse,
    ProductResponse,
    ProductUpdateRequest,
    ShoppingPlanResponse,
    StoreResponse,
)
from app.catalog.price_parser import parse_price_text
from app.catalog.search import search_products
from app.domain.models import (
    GroceryItem,
    Product,
)
from app.domain.unit_pricing import calculate_unit_price
from app.optimizer.engine import compare_shopping_plans, optimize_shopping_plan
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
    limit: int = Query(default=10, ge=1, le=200, description="Max results"),
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
            category=p.category,
            canonical_group=p.canonical_group,
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
            upc=p.upc,
            category=p.category,
            canonical_group=p.canonical_group,
        )
        for p in matched_domain
    ]


@router.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["catalog"],
)
def create_product(
    body: ProductCreateRequest,
    db: Session = Depends(get_db),
):
    """Add a new product to the household catalog with duplicate prevention."""
    # Check for existing product with same UPC
    if body.upc and body.upc.strip():
        existing_upc = db.query(ProductModel).filter(ProductModel.upc == body.upc.strip()).first()
        if existing_upc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Product with UPC {body.upc} already exists: {existing_upc.brand} {existing_upc.name}",
            )

    # Check for exact name + brand + package duplicate
    existing_exact = (
        db.query(ProductModel)
        .filter(
            func.lower(ProductModel.name) == body.name.strip().lower(),
            func.lower(ProductModel.brand) == body.brand.strip().lower(),
            ProductModel.package_quantity == body.package_quantity.strip(),
            ProductModel.package_unit == body.package_unit.strip().lower(),
        )
        .first()
    )
    if existing_exact:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Identical product already exists: {existing_exact.brand} {existing_exact.name} ({existing_exact.id})",
        )

    # Generate stable product ID
    slug_name = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-")[:24]
    slug_brand = re.sub(r"[^a-z0-9]+", "-", body.brand.lower()).strip("-")[:16]
    product_id = f"prod-{slug_brand}-{slug_name}-{uuid.uuid4().hex[:4]}"

    new_prod = ProductModel(
        id=product_id,
        name=body.name.strip(),
        brand=body.brand.strip(),
        package_quantity=body.package_quantity.strip(),
        package_unit=body.package_unit.strip().lower(),
        aliases=body.aliases or [],
        upc=body.upc.strip() if body.upc and body.upc.strip() else None,
        category=body.category.strip() if body.category and body.category.strip() else None,
        canonical_group=body.canonical_group.strip() if body.canonical_group and body.canonical_group.strip() else None,
    )
    db.add(new_prod)
    db.commit()
    db.refresh(new_prod)
    return ProductResponse.model_validate(new_prod)


@router.patch(
    "/products/{product_id}",
    response_model=ProductResponse,
    tags=["catalog"],
)
def update_product(
    product_id: str,
    body: ProductUpdateRequest,
    db: Session = Depends(get_db),
):
    """Update catalog product metadata."""
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if body.name is not None:
        product.name = body.name.strip()
    if body.brand is not None:
        product.brand = body.brand.strip()
    if body.package_quantity is not None:
        product.package_quantity = body.package_quantity.strip()
    if body.package_unit is not None:
        product.package_unit = body.package_unit.strip().lower()
    if body.aliases is not None:
        product.aliases = body.aliases
    if body.upc is not None:
        product.upc = body.upc.strip() if body.upc.strip() else None
    if body.category is not None:
        product.category = body.category.strip() if body.category.strip() else None
    if body.canonical_group is not None:
        product.canonical_group = body.canonical_group.strip() if body.canonical_group.strip() else None

    db.commit()
    db.refresh(product)
    return ProductResponse.model_validate(product)


@router.get(
    "/products/{product_id}/equivalents",
    response_model=list[ProductResponse],
    tags=["catalog"],
)
def get_equivalent_products(
    product_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve alternative store-brand and comparable products in the same canonical group."""
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    if not product.canonical_group:
        return [ProductResponse.model_validate(product)]

    equivalents = (
        db.query(ProductModel)
        .filter(ProductModel.canonical_group == product.canonical_group)
        .order_by(ProductModel.name.asc())
        .all()
    )
    return [ProductResponse.model_validate(p) for p in equivalents]


@router.get(
    "/products/canonical-groups",
    response_model=list[str],
    tags=["catalog"],
)
def get_canonical_groups(db: Session = Depends(get_db)):
    """Retrieve distinct canonical comparison groups."""
    groups = (
        db.query(ProductModel.canonical_group)
        .filter(ProductModel.canonical_group.isnot(None))
        .distinct()
        .order_by(ProductModel.canonical_group.asc())
        .all()
    )
    return [g[0] for g in groups if g[0]]


@router.post(
    "/price-import/parse",
    response_model=PriceImportParseResponse,
    tags=["import"],
)
def parse_imported_prices(
    body: PriceImportParseRequest,
    db: Session = Depends(get_db),
):
    """Parse raw text, cart data, or weekly circular text into structured price candidates."""
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
            category=p.category,
            canonical_group=p.canonical_group,
        )
        for p in product_models
    ]

    candidates_raw = parse_price_text(
        raw_text=body.text,
        catalog=domain_catalog,
        retailer_name=body.retailer_name,
    )

    candidates: list[ParsedPriceCandidate] = [
        ParsedPriceCandidate(
            raw_line=c["raw_line"],
            extracted_name=c["extracted_name"],
            brand=c.get("brand"),
            package_size=c.get("package_size"),
            regular_price_cents=c.get("regular_price_cents"),
            promotional_price_cents=c.get("promotional_price_cents"),
            price_cents=c["price_cents"],
            is_promotional=c.get("is_promotional", False),
            promo_details=c.get("promo_details"),
            matched_product_id=c.get("matched_product_id"),
            matched_product_name=c.get("matched_product_name"),
            match_confidence=c.get("match_confidence", "unmatched"),
            canonical_group=c.get("canonical_group"),
        )
        for c in candidates_raw
    ]

    lines_scanned = len([l for l in body.text.splitlines() if l.strip()])
    matched_count = sum(1 for c in candidates if c.match_confidence in ("high", "medium"))

    return PriceImportParseResponse(
        retailer_name=body.retailer_name or "Unknown Retailer",
        store_name=body.store_name,
        candidates=candidates,
        total_lines_scanned=lines_scanned,
        extracted_count=len(candidates),
        matched_count=matched_count,
    )


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
    latitude: float | None = None,
    longitude: float | None = None,
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

    # 2. Location-aware matching when verified street address is present
    if cleaned_address:
        query = db.query(StoreModel).filter(
            StoreModel.retailer_id == retailer.id,
            StoreModel.is_unresolved_location.is_(False),
            func.lower(StoreModel.address) == cleaned_address.lower(),
        )
        if cleaned_zip:
            query = query.filter(StoreModel.zip_code == cleaned_zip)
        store = query.first()
        if store:
            if latitude is not None and store.latitude is None:
                store.latitude = latitude
                store.longitude = longitude
            return store

        # Create distinct physical store for this verified address
        store_slug = f"{retailer_slug}-{cleaned_zip or 'loc'}-{uuid.uuid4().hex[:4]}"
        store = StoreModel(
            id=f"store-{store_slug}",
            retailer_id=retailer.id,
            name=cleaned_store_name,
            slug=store_slug,
            address=cleaned_address,
            city=cleaned_city,
            state=cleaned_state,
            zip_code=cleaned_zip,
            latitude=latitude,
            longitude=longitude,
            is_unresolved_location=False,
            sort_order=100,
        )
        db.add(store)
        db.flush()
        return store

    # 3. Address is missing:
    # A store without a street address cannot be uniquely verified as a distinct physical building.
    # To prevent same-ZIP collisions (Gate 0 Problem A):
    # - It must NEVER match a store that has a known street address.
    # - ZIP alone does not identify a store; stores with different names in the same ZIP remain distinct.
    # - Only match an existing unresolved store with the exact same retailer, name, and ZIP.
    query = db.query(StoreModel).filter(
        StoreModel.retailer_id == retailer.id,
        StoreModel.address.is_(None),
        StoreModel.is_unresolved_location.is_(True),
        func.lower(StoreModel.name) == cleaned_store_name.lower(),
    )
    if cleaned_zip:
        query = query.filter(StoreModel.zip_code == cleaned_zip)
    else:
        query = query.filter(StoreModel.zip_code.is_(None))

    store = query.first()
    if store:
        return store

    # Create distinct unresolved store preserving supplied city/state/ZIP without claiming verified location
    store_slug = f"{retailer_slug}-unresolved-{uuid.uuid4().hex[:6]}"
    store = StoreModel(
        id=f"store-{store_slug}",
        retailer_id=retailer.id,
        name=cleaned_store_name,
        slug=store_slug,
        address=None,
        city=cleaned_city,
        state=cleaned_state,
        zip_code=cleaned_zip,
        latitude=None,
        longitude=None,
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
            latitude=s.latitude,
            longitude=s.longitude,
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
    region_scope: str = Query(
        default="exact",
        description="Scope for ZIP comparison: 'exact' (only specified ZIP) or 'neighborhood' (includes nearby pilot stores)",
    ),
    minimum_savings_threshold_cents: int = Query(
        default=300,
        ge=0,
        le=5000,
        description="Minimum gross savings in cents required to justify making a second stop",
    ),
    db: Session = Depends(get_db),
    provider: RetailerProvider = Depends(get_retailer_provider),
):
    """Compare stores and calculate cheapest 1-store and <=2-store shopping plans.

    Guarantees strict separation between demonstration sample data and user observations.
    Never mixes incompatible sources into a claimed savings figure.
    Provides dedicated side-by-side comparison for Kroger vs Meijer household shopping.
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
    compared_zips: list[str] = []
    if source == "user_contributed":
        active_provider: RetailerProvider = UserContributedRetailerProvider(
            db=db,
            zip_code=zip_code,
            region_scope=region_scope,
        )
        is_demo = False
        pricing_source = "user_contributed"
        pricing_label = "User-Entered Observations"
        if zip_code:
            target_zips = getattr(active_provider, "target_zips", {zip_code})
            compared_zips = sorted(target_zips)
            if region_scope in ("neighborhood", "regional") and len(compared_zips) > 1:
                notice = (
                    f"Prices are consumer-entered observations for {zip_code} and nearby pilot neighborhood stores "
                    f"({', '.join(compared_zips)}). Only physical stores located in these areas are included."
                )
            else:
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
            category=p.category,
            canonical_group=p.canonical_group,
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

    # Run standard pure optimizer (preserves M001-M005 behavior)
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
                latitude=getattr(s, "latitude", None),
                longitude=getattr(s, "longitude", None),
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
                upc=domain_products[pid].upc,
                category=domain_products[pid].category,
                canonical_group=domain_products[pid].canonical_group,
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

    # --- Specialized Kroger vs Meijer Household Workflow (Mission 006) ---
    kroger_stores = [
        s for s in domain_stores
        if "kroger" in s.name.lower() or "kroger" in store_retailer_name_map.get(s.id, "").lower()
    ]
    meijer_stores = [
        s for s in domain_stores
        if "meijer" in s.name.lower() or "meijer" in store_retailer_name_map.get(s.id, "").lower()
    ]

    # Pre-index offers by (store_id, product_id)
    offers_by_store_prod = {}
    for off in domain_offers:
        key = (off.store_id, off.product_id)
        if key not in offers_by_store_prod or off.effective_price_cents < offers_by_store_prod[key].effective_price_cents:
            offers_by_store_prod[key] = off

    # Build equivalent product lookup for canonical groups
    canonical_group_to_prod_ids: dict[str, list[str]] = {}
    for p_id, p_obj in domain_products.items():
        if p_obj.canonical_group:
            canonical_group_to_prod_ids.setdefault(p_obj.canonical_group, []).append(p_id)

    item_comparisons: list[ItemPriceComparisonResponse] = []
    for it in domain_items:
        prod = domain_products[it.product_id]
        cgroup = prod.canonical_group
        candidate_prod_ids = [it.product_id]
        if cgroup and cgroup in canonical_group_to_prod_ids:
            for eq_id in canonical_group_to_prod_ids[cgroup]:
                if eq_id not in candidate_prod_ids:
                    candidate_prod_ids.append(eq_id)

        # Best Kroger offer for this item
        best_kr_offer = None
        best_kr_store = None
        for ks in kroger_stores:
            for cpid in candidate_prod_ids:
                cand = offers_by_store_prod.get((ks.id, cpid))
                if cand and (best_kr_offer is None or cand.effective_price_cents < best_kr_offer.effective_price_cents):
                    best_kr_offer = cand
                    best_kr_store = ks

        # Best Meijer offer for this item
        best_mj_offer = None
        best_mj_store = None
        for ms in meijer_stores:
            for cpid in candidate_prod_ids:
                cand = offers_by_store_prod.get((ms.id, cpid))
                if cand and (best_mj_offer is None or cand.effective_price_cents < best_mj_offer.effective_price_cents):
                    best_mj_offer = cand
                    best_mj_store = ms

        kr_price = best_kr_offer.effective_price_cents if best_kr_offer else None
        kr_reg = best_kr_offer.regular_price_cents if best_kr_offer else None
        kr_is_sale = best_kr_offer.is_on_sale if best_kr_offer else False
        kr_date = best_kr_offer.observation_date if best_kr_offer else None
        kr_sname = best_kr_store.name if best_kr_store else None

        mj_price = best_mj_offer.effective_price_cents if best_mj_offer else None
        mj_reg = best_mj_offer.regular_price_cents if best_mj_offer else None
        mj_is_sale = best_mj_offer.is_on_sale if best_mj_offer else False
        mj_date = best_mj_offer.observation_date if best_mj_offer else None
        mj_sname = best_mj_store.name if best_mj_store else None

        # Calculate unit prices
        kr_unit = calculate_unit_price(kr_price, prod.package_quantity, prod.package_unit) if kr_price else None
        mj_unit = calculate_unit_price(mj_price, prod.package_quantity, prod.package_unit) if mj_price else None
        unit_label = kr_unit[1] if kr_unit else (mj_unit[1] if mj_unit else None)

        cheaper_ret = None
        item_savings = 0
        if kr_price is not None and mj_price is not None:
            if kr_price < mj_price:
                cheaper_ret = "kroger"
                item_savings = (mj_price - kr_price) * it.quantity
            elif mj_price < kr_price:
                cheaper_ret = "meijer"
                item_savings = (kr_price - mj_price) * it.quantity
            else:
                cheaper_ret = "tie"
        elif kr_price is not None:
            cheaper_ret = "kroger"
        elif mj_price is not None:
            cheaper_ret = "meijer"
        else:
            cheaper_ret = "incomplete"

        item_comparisons.append(
            ItemPriceComparisonResponse(
                product_id=prod.id,
                product_name=prod.name,
                brand=prod.brand,
                package_quantity=prod.package_quantity,
                package_unit=prod.package_unit,
                requested_quantity=it.quantity,
                kroger_price_cents=kr_price,
                kroger_regular_price_cents=kr_reg,
                kroger_is_sale=kr_is_sale,
                kroger_date=kr_date,
                kroger_store_name=kr_sname,
                meijer_price_cents=mj_price,
                meijer_regular_price_cents=mj_reg,
                meijer_is_sale=mj_is_sale,
                meijer_date=mj_date,
                meijer_store_name=mj_sname,
                cheaper_retailer=cheaper_ret,
                item_savings_cents=item_savings,
                unit_price_kroger_cents=kr_unit[0] if kr_unit else None,
                unit_price_meijer_cents=mj_unit[0] if mj_unit else None,
                unit_price_unit=unit_label,
            )
        )

    # Coverage metrics
    total_items = len(domain_items)
    kr_cov_count = sum(1 for itm in item_comparisons if itm.kroger_price_cents is not None)
    mj_cov_count = sum(1 for itm in item_comparisons if itm.meijer_price_cents is not None)
    kroger_coverage = f"{kr_cov_count} of {total_items} products have known Kroger prices"
    meijer_coverage = f"{mj_cov_count} of {total_items} products have known Meijer prices"
    kroger_ratio = round(kr_cov_count / total_items, 2) if total_items > 0 else 0.0
    meijer_ratio = round(mj_cov_count / total_items, 2) if total_items > 0 else 0.0

    # Dedicated single-retailer plans
    kroger_plan_resp = None
    if kroger_stores:
        kr_plan = optimize_shopping_plan(
            domain_items, domain_products, domain_offers, kroger_stores, max_stores=1
        )
        kroger_plan_resp = to_plan_response(kr_plan)

    meijer_plan_resp = None
    if meijer_stores:
        mj_plan = optimize_shopping_plan(
            domain_items, domain_products, domain_offers, meijer_stores, max_stores=1
        )
        meijer_plan_resp = to_plan_response(mj_plan)

    # 2-Store split trip between Kroger and Meijer
    split_plan_resp = None
    split_gross_savings = None
    extra_stop_justified = False
    target_two_stores = kroger_stores + meijer_stores
    if target_two_stores:
        km_split = optimize_shopping_plan(
            domain_items, domain_products, domain_offers, target_two_stores, max_stores=2
        )
        split_plan_resp = to_plan_response(km_split)

        # Calculate gross savings comparing best complete single store vs split
        single_totals = []
        if kroger_plan_resp and kroger_plan_resp.is_complete:
            single_totals.append(kroger_plan_resp.total_cents)
        if meijer_plan_resp and meijer_plan_resp.is_complete:
            single_totals.append(meijer_plan_resp.total_cents)

        if single_totals and split_plan_resp.is_complete:
            cheapest_single = min(single_totals)
            split_gross_savings = max(0, cheapest_single - split_plan_resp.total_cents)
            extra_stop_justified = split_gross_savings >= minimum_savings_threshold_cents

    # Comparison Status
    if kr_cov_count == total_items and mj_cov_count == total_items:
        comparison_status = "complete"
    elif kr_cov_count > 0 or mj_cov_count > 0:
        comparison_status = "incomplete_coverage"
    else:
        comparison_status = "no_prices"

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
        region_scope=region_scope,
        compared_zip_codes=compared_zips,
        kroger_plan=kroger_plan_resp,
        meijer_plan=meijer_plan_resp,
        kroger_coverage=kroger_coverage,
        meijer_coverage=meijer_coverage,
        kroger_coverage_ratio=kroger_ratio,
        meijer_coverage_ratio=meijer_ratio,
        split_plan=split_plan_resp,
        split_gross_savings_cents=split_gross_savings,
        extra_stop_justified=extra_stop_justified,
        minimum_savings_threshold_cents=minimum_savings_threshold_cents,
        comparison_status=comparison_status,
        item_comparisons=item_comparisons,
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
    dependencies=[Depends(rate_limit_observations)],
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
        latitude=body.latitude,
        longitude=body.longitude,
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
    dependencies=[Depends(rate_limit_batch_observations)],
    tags=["observations"],
)
def create_batch_price_observations(
    body: BatchPriceObservationCreateRequest,
    x_edit_token: str | None = Header(default=None, alias="X-Edit-Token"),
    db: Session = Depends(get_db),
):
    """Rapidly record multiple product prices observed during a single shopping trip."""
    # 1. Validate observation date
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

    # 2. Check for duplicate products within the batch
    product_ids = [item.product_id for item in body.items]
    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch request contains duplicate entries for the same product.",
        )

    # 3. Upfront validation of price bounds and canonical product existence
    for item in body.items:
        if item.price_cents <= 0 or item.price_cents > 50000:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid price {item.price_cents} cents. Price must be between $0.01 and $500.00.",
            )

    existing_products = {
        p.id: p
        for p in db.query(ProductModel).filter(ProductModel.id.in_(product_ids)).all()
    }
    for item in body.items:
        if item.product_id not in existing_products:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product not found in canonical catalog: {item.product_id}",
            )

    # 4. Resolve or create store with atomic transaction
    try:
        store = _resolve_or_create_store(
            db=db,
            store_name=body.store_name,
            store_id=body.store_id,
            retailer_name=body.retailer_name,
            address=body.address,
            city=body.city,
            state=body.state,
            zip_code=body.zip_code,
            latitude=body.latitude,
            longitude=body.longitude,
        )

        created_obs_responses: list[PriceObservationResponse] = []
        for item in body.items:
            product = existing_products[item.product_id]
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
    except Exception:
        db.rollback()
        raise

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
        latitude=store.latitude,
        longitude=store.longitude,
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

    # Store resolution / correction (Problem B fix: preserve existing locality unless explicitly overridden)
    if body.store_id is not None:
        target_store = db.query(StoreModel).filter(StoreModel.id == body.store_id).first()
        if not target_store:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store with id '{body.store_id}' not found",
            )
        obs.store_id = target_store.id
        obs.store_name = target_store.name
    elif body.store_name is not None and body.store_name.strip():
        current_store = obs.store
        effective_address = body.address if body.address is not None else (current_store.address if current_store else None)
        effective_city = body.city if body.city is not None else (current_store.city if current_store else None)
        effective_state = body.state if body.state is not None else (current_store.state if current_store else None)
        effective_zip = body.zip_code if body.zip_code is not None else (current_store.zip_code if current_store else None)
        effective_retailer = body.retailer_name if body.retailer_name is not None else (
            current_store.retailer.name if current_store and current_store.retailer else None
        )
        effective_lat = body.latitude if body.latitude is not None else (current_store.latitude if current_store else None)
        effective_lon = body.longitude if body.longitude is not None else (current_store.longitude if current_store else None)
        store = _resolve_or_create_store(
            db=db,
            store_name=body.store_name,
            retailer_name=effective_retailer,
            address=effective_address,
            city=effective_city,
            state=effective_state,
            zip_code=effective_zip,
            latitude=effective_lat,
            longitude=effective_lon,
        )
        obs.store_id = store.id
        obs.store_name = store.name
    elif any(v is not None for v in (body.address, body.city, body.state, body.zip_code, body.latitude, body.longitude)):
        current_store = obs.store
        base_name = current_store.name if current_store else "Store"
        effective_address = body.address if body.address is not None else (current_store.address if current_store else None)
        effective_city = body.city if body.city is not None else (current_store.city if current_store else None)
        effective_state = body.state if body.state is not None else (current_store.state if current_store else None)
        effective_zip = body.zip_code if body.zip_code is not None else (current_store.zip_code if current_store else None)
        effective_retailer = body.retailer_name if body.retailer_name is not None else (
            current_store.retailer.name if current_store and current_store.retailer else None
        )
        effective_lat = body.latitude if body.latitude is not None else (current_store.latitude if current_store else None)
        effective_lon = body.longitude if body.longitude is not None else (current_store.longitude if current_store else None)
        store = _resolve_or_create_store(
            db=db,
            store_name=base_name,
            retailer_name=effective_retailer,
            address=effective_address,
            city=effective_city,
            state=effective_state,
            zip_code=effective_zip,
            latitude=effective_lat,
            longitude=effective_lon,
        )
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


@router.get("/system/export", response_model=BackupData, tags=["system"])
def export_system_backup(db: Session = Depends(get_db)):
    """Export complete household database backup as plaintext JSON.

    Protects lists, custom products, stores, and price observations.
    Redacts internal edit token hashes for security.
    """
    prods = db.query(ProductModel).all()
    gls = db.query(GroceryListModel).options(joinedload(GroceryListModel.items)).all()
    obs = db.query(PriceObservationModel).all()
    stores = db.query(StoreModel).all()
    retailers = db.query(RetailerModel).all()

    return BackupData(
        version="1.0",
        exported_at=datetime.now(UTC).isoformat(),
        app_version="0.6.0",
        products=[
            {
                "id": p.id,
                "name": p.name,
                "brand": p.brand,
                "package_quantity": p.package_quantity,
                "package_unit": p.package_unit,
                "aliases": p.aliases,
                "upc": p.upc,
                "category": p.category,
                "canonical_group": p.canonical_group,
            }
            for p in prods
        ],
        grocery_lists=[
            {
                "id": l.id,
                "name": l.name,
                "created_at": l.created_at.isoformat() if l.created_at else None,
                "updated_at": l.updated_at.isoformat() if l.updated_at else None,
                "items": [
                    {
                        "id": itm.id,
                        "product_id": itm.product_id,
                        "quantity": itm.quantity,
                    }
                    for itm in l.items
                ],
            }
            for l in gls
        ],
        price_observations=[
            {
                "id": o.id,
                "product_id": o.product_id,
                "store_id": o.store_id,
                "store_name": o.store_name,
                "price_cents": o.price_cents,
                "observation_date": o.observation_date.isoformat() if o.observation_date else None,
                "is_promotional": o.is_promotional,
                "notes": o.notes,
                "contributor_id": o.contributor_id,
            }
            for o in obs
        ],
        stores=[
            {
                "id": s.id,
                "retailer_id": s.retailer_id,
                "name": s.name,
                "slug": s.slug,
                "sort_order": s.sort_order,
                "address": s.address,
                "city": s.city,
                "state": s.state,
                "zip_code": s.zip_code,
                "latitude": s.latitude,
                "longitude": s.longitude,
                "is_unresolved_location": s.is_unresolved_location,
            }
            for s in stores
        ],
        retailers=[
            {
                "id": r.id,
                "name": r.name,
                "slug": r.slug,
            }
            for r in retailers
        ],
    )


@router.post("/system/import", response_model=BackupImportResponse, tags=["system"])
def import_system_backup(data: BackupData, db: Session = Depends(get_db)):
    """Import plaintext JSON backup safely in an atomic transaction."""
    if not data.version or not isinstance(data.products, list) or not isinstance(data.grocery_lists, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid backup structure: missing version or essential collections",
        )

    imported_prods = 0
    imported_lists = 0
    imported_items = 0
    imported_obs = 0

    try:
        # 1. Retailers
        for r_dict in data.retailers:
            r_id = r_dict.get("id")
            if r_id and not db.get(RetailerModel, r_id):
                db.add(RetailerModel(id=r_id, name=r_dict["name"], slug=r_dict["slug"]))
        db.flush()

        # 2. Stores
        for s_dict in data.stores:
            s_id = s_dict.get("id")
            if s_id and not db.get(StoreModel, s_id):
                db.add(
                    StoreModel(
                        id=s_id,
                        retailer_id=s_dict["retailer_id"],
                        name=s_dict["name"],
                        slug=s_dict["slug"],
                        sort_order=s_dict.get("sort_order", 0),
                        address=s_dict.get("address"),
                        city=s_dict.get("city"),
                        state=s_dict.get("state"),
                        zip_code=s_dict.get("zip_code"),
                        latitude=s_dict.get("latitude"),
                        longitude=s_dict.get("longitude"),
                        is_unresolved_location=s_dict.get("is_unresolved_location", False),
                    )
                )
        db.flush()

        # 3. Products
        for p_dict in data.products:
            p_id = p_dict.get("id")
            if p_id and not db.get(ProductModel, p_id):
                db.add(
                    ProductModel(
                        id=p_id,
                        name=p_dict["name"],
                        brand=p_dict["brand"],
                        package_quantity=p_dict["package_quantity"],
                        package_unit=p_dict["package_unit"],
                        aliases=p_dict.get("aliases", []),
                        upc=p_dict.get("upc"),
                        category=p_dict.get("category"),
                        canonical_group=p_dict.get("canonical_group"),
                    )
                )
                imported_prods += 1
        db.flush()

        # 4. Grocery Lists & Items
        for l_dict in data.grocery_lists:
            l_id = l_dict.get("id")
            if not l_id:
                continue
            existing_list = db.get(GroceryListModel, l_id)
            if not existing_list:
                new_list = GroceryListModel(
                    id=l_id,
                    name=l_dict.get("name"),
                )
                db.add(new_list)
                imported_lists += 1
            db.flush()

            for itm in l_dict.get("items", []):
                itm_id = itm.get("id") or str(uuid.uuid4())
                existing_item = db.get(GroceryListItemModel, itm_id)
                if not existing_item:
                    dup = (
                        db.query(GroceryListItemModel)
                        .filter(
                            GroceryListItemModel.list_id == l_id,
                            GroceryListItemModel.product_id == itm["product_id"],
                        )
                        .first()
                    )
                    if not dup and db.get(ProductModel, itm["product_id"]):
                        db.add(
                            GroceryListItemModel(
                                id=itm_id,
                                list_id=l_id,
                                product_id=itm["product_id"],
                                quantity=itm.get("quantity", 1),
                            )
                        )
                        imported_items += 1
        db.flush()

        # 5. Price Observations
        for o_dict in data.price_observations:
            o_id = o_dict.get("id")
            if not o_id or db.get(PriceObservationModel, o_id):
                continue
            if not db.get(ProductModel, o_dict["product_id"]):
                continue

            obs_date_str = o_dict.get("observation_date")
            try:
                obs_date = date.fromisoformat(obs_date_str) if obs_date_str else date.today()
            except (ValueError, TypeError):
                obs_date = date.today()

            db.add(
                PriceObservationModel(
                    id=o_id,
                    product_id=o_dict["product_id"],
                    store_id=o_dict.get("store_id"),
                    store_name=o_dict.get("store_name", "Unknown Store"),
                    price_cents=o_dict["price_cents"],
                    observation_date=obs_date,
                    is_promotional=o_dict.get("is_promotional", False),
                    notes=o_dict.get("notes"),
                    contributor_id=o_dict.get("contributor_id"),
                )
            )
            imported_obs += 1

        db.commit()
        return BackupImportResponse(
            status="success",
            message="Backup imported successfully into local database.",
            imported_products_count=imported_prods,
            imported_lists_count=imported_lists,
            imported_items_count=imported_items,
            imported_observations_count=imported_obs,
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to restore backup, transaction rolled back safely: {e!s}",
        )


