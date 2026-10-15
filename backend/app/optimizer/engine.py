from itertools import combinations

from app.domain.models import (
    ComparisonResult,
    GroceryItem,
    Product,
    ProductOffer,
    ShoppingPlan,
    ShoppingPlanItem,
    Store,
)


def _store_sort_key(store: Store) -> tuple[int, str]:
    return (store.sort_order, store.id)


def optimize_shopping_plan(
    requested_items: list[GroceryItem],
    products_by_id: dict[str, Product],
    offers: list[ProductOffer],
    stores: list[Store],
    max_stores: int = 2,
) -> ShoppingPlan:
    """Deterministic exhaustive optimizer for complete baskets up to max_stores.

    Tie-breaking:
    1. Lowest total cost in integer cents.
    2. Fewer stores actually used.
    3. Stable store ordering (sort_order ascending, then store ID ascending).
    """
    if not requested_items:
        return ShoppingPlan(
            is_complete=True,
            store_ids=[],
            stores=[],
            items=[],
            total_cents=0,
            missing_product_ids=[],
        )

    # Sort stores deterministically
    sorted_stores = sorted(stores, key=_store_sort_key)
    store_map = {store.id: store for store in sorted_stores}

    # Filter to only available offers for requested products
    req_product_ids = {item.product_id for item in requested_items}
    available_offers = [
        offer
        for offer in offers
        if offer.is_available and offer.product_id in req_product_ids and offer.store_id in store_map
    ]

    # Pre-index offers by (store_id, product_id)
    # If multiple offers exist for same product at same store, pick cheapest
    offers_by_store_and_prod: dict[tuple[str, str], ProductOffer] = {}
    for offer in available_offers:
        key = (offer.store_id, offer.product_id)
        if key not in offers_by_store_and_prod:
            offers_by_store_and_prod[key] = offer
        else:
            existing = offers_by_store_and_prod[key]
            if offer.effective_price_cents < existing.effective_price_cents:
                offers_by_store_and_prod[key] = offer

    # Generate all store combinations
    candidate_combinations: list[tuple[Store, ...]] = []
    # 1-store combinations
    for store in sorted_stores:
        candidate_combinations.append((store,))

    # 2-store combinations (if max_stores >= 2)
    if max_stores >= 2 and len(sorted_stores) >= 2:
        candidate_combinations.extend(combinations(sorted_stores, 2))

    best_plan: ShoppingPlan | None = None
    best_tie_key: tuple[int, int, list[tuple[int, str]]] | None = None

    for combo in candidate_combinations:
        combo_items: list[ShoppingPlanItem] = []
        is_combo_valid = True
        used_store_id_set: set[str] = set()

        for req_item in requested_items:
            product = products_by_id.get(req_item.product_id)
            product_name = product.name if product else f"Product {req_item.product_id}"

            # Find best offer among stores in this combination
            best_offer_for_item: ProductOffer | None = None
            best_offer_store: Store | None = None

            for store in combo:
                cand_offer = offers_by_store_and_prod.get((store.id, req_item.product_id))
                if cand_offer is None:
                    continue

                if best_offer_for_item is None:
                    best_offer_for_item = cand_offer
                    best_offer_store = store
                else:
                    if cand_offer.effective_price_cents < best_offer_for_item.effective_price_cents:
                        best_offer_for_item = cand_offer
                        best_offer_store = store
                    elif cand_offer.effective_price_cents == best_offer_for_item.effective_price_cents:
                        # Tie within combination: prefer store earlier in stable store ordering
                        if best_offer_store is not None and _store_sort_key(
                            store
                        ) < _store_sort_key(best_offer_store):
                            best_offer_for_item = cand_offer
                            best_offer_store = store

            if best_offer_for_item is None or best_offer_store is None:
                # Missing at least one requested item in this store combo
                is_combo_valid = False
                break

            subtotal = best_offer_for_item.effective_price_cents * req_item.quantity
            used_store_id_set.add(best_offer_store.id)
            combo_items.append(
                ShoppingPlanItem(
                    product_id=req_item.product_id,
                    product_name=product_name,
                    store_id=best_offer_store.id,
                    store_name=best_offer_store.name,
                    quantity=req_item.quantity,
                    unit_price_cents=best_offer_for_item.effective_price_cents,
                    regular_price_cents=best_offer_for_item.regular_price_cents,
                    is_on_sale=best_offer_for_item.is_on_sale,
                    subtotal_cents=subtotal,
                )
            )

        if not is_combo_valid:
            continue

        total_cents = sum(item.subtotal_cents for item in combo_items)
        used_stores = [s for s in sorted_stores if s.id in used_store_id_set]
        used_store_keys = [_store_sort_key(s) for s in used_stores]
        num_used_stores = len(used_stores)

        tie_key = (total_cents, num_used_stores, used_store_keys)

        if best_tie_key is None or tie_key < best_tie_key:
            best_tie_key = tie_key
            best_plan = ShoppingPlan(
                is_complete=True,
                store_ids=[s.id for s in used_stores],
                stores=used_stores,
                items=combo_items,
                total_cents=total_cents,
                missing_product_ids=[],
            )

    if best_plan is not None:
        return best_plan

    # If no complete plan exists, find which products could not be fulfilled
    all_available_prod_ids = {offer.product_id for offer in available_offers}
    missing = sorted([item.product_id for item in requested_items if item.product_id not in all_available_prod_ids])

    # If all items are individually available somewhere, but no <= max_stores combination covers them all:
    if not missing:
        missing = sorted(req_product_ids)

    return ShoppingPlan(
        is_complete=False,
        store_ids=[],
        stores=[],
        items=[],
        total_cents=0,
        missing_product_ids=missing,
    )


def compare_shopping_plans(
    requested_items: list[GroceryItem],
    products_by_id: dict[str, Product],
    offers: list[ProductOffer],
    stores: list[Store],
) -> ComparisonResult:
    """Compute both the best one-store trip and the best trip using up to two stores."""
    one_store_plan = optimize_shopping_plan(
        requested_items=requested_items,
        products_by_id=products_by_id,
        offers=offers,
        stores=stores,
        max_stores=1,
    )

    best_plan = optimize_shopping_plan(
        requested_items=requested_items,
        products_by_id=products_by_id,
        offers=offers,
        stores=stores,
        max_stores=2,
    )

    savings_cents: int | None = None
    if one_store_plan.is_complete and best_plan.is_complete:
        savings_cents = max(0, one_store_plan.total_cents - best_plan.total_cents)

    additional_stops = 0
    if best_plan.is_complete:
        additional_stops = max(0, len(best_plan.store_ids) - 1)

    return ComparisonResult(
        one_store_plan=one_store_plan,
        best_plan=best_plan,
        savings_cents=savings_cents,
        additional_stops=additional_stops,
    )
