from app.domain.models import GroceryItem, Product, ProductOffer, Store
from app.optimizer.engine import compare_shopping_plans, optimize_shopping_plan


def test_optimizer_empty_basket():
    plan = optimize_shopping_plan([], {}, [], [], max_stores=1)
    assert plan.is_complete is True
    assert plan.total_cents == 0
    assert len(plan.items) == 0


def test_optimizer_single_store_cheapest():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    p1 = Product(id="prod-milk", name="Whole Milk", brand="Farm", package_quantity="1", package_unit="gal")

    req = [GroceryItem(id="item-1", product_id="prod-milk", quantity=1)]
    products = {"prod-milk": p1}

    # Store 1 milk is $4.00 (400c), Store 2 milk is $3.50 (350c)
    offers = [
        ProductOffer("off-1", "r1", "store-1", "prod-milk", "sku1", 400, None, True),
        ProductOffer("off-2", "r2", "store-2", "prod-milk", "sku2", 350, None, True),
    ]

    plan = optimize_shopping_plan(req, products, offers, [s1, s2], max_stores=1)
    assert plan.is_complete is True
    assert plan.total_cents == 350
    assert plan.store_ids == ["store-2"]
    assert len(plan.items) == 1
    assert plan.items[0].store_id == "store-2"
    assert plan.items[0].unit_price_cents == 350
    assert plan.items[0].subtotal_cents == 350


def test_optimizer_quantity_multiplication():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    p1 = Product(id="prod-eggs", name="Large Eggs", brand="Farm", package_quantity="12", package_unit="ct")

    req = [GroceryItem(id="item-1", product_id="prod-eggs", quantity=3)]
    products = {"prod-eggs": p1}
    offers = [
        ProductOffer("off-1", "r1", "store-1", "prod-eggs", "sku1", 299, None, True),
    ]

    plan = optimize_shopping_plan(req, products, offers, [s1], max_stores=1)
    assert plan.is_complete is True
    assert plan.total_cents == 299 * 3
    assert plan.items[0].quantity == 3
    assert plan.items[0].unit_price_cents == 299
    assert plan.items[0].subtotal_cents == 897


def test_optimizer_promotional_pricing():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    p1 = Product(id="prod-cereal", name="Cheerios", brand="General Mills", package_quantity="18", package_unit="oz")
    p2 = Product(id="prod-chips", name="Chips", brand="Lays", package_quantity="10", package_unit="oz")

    req = [
        GroceryItem(id="item-1", product_id="prod-cereal", quantity=1),
        GroceryItem(id="item-2", product_id="prod-chips", quantity=1),
    ]
    products = {"prod-cereal": p1, "prod-chips": p2}

    # Cereal has valid promo ($4.99 reg, $3.99 promo) -> promo effective
    # Chips has invalid promo ($3.00 reg, $3.50 promo) -> regular price effective
    offers = [
        ProductOffer("off-1", "r1", "store-1", "prod-cereal", "sku1", 499, 399, True),
        ProductOffer("off-2", "r1", "store-1", "prod-chips", "sku2", 300, 350, True),
    ]

    plan = optimize_shopping_plan(req, products, offers, [s1], max_stores=1)
    assert plan.is_complete is True
    assert plan.items[0].unit_price_cents == 399
    assert plan.items[0].is_on_sale is True
    assert plan.items[1].unit_price_cents == 300
    assert plan.items[1].is_on_sale is False
    assert plan.total_cents == 699


def test_optimizer_unavailable_offers_ignored():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    p1 = Product(id="prod-coffee", name="Coffee", brand="Roaster", package_quantity="12", package_unit="oz")

    req = [GroceryItem(id="item-1", product_id="prod-coffee", quantity=1)]
    products = {"prod-coffee": p1}

    # Store 1 has coffee for $5.00 but unavailable; Store 2 has coffee for $8.00 available
    offers = [
        ProductOffer("off-1", "r1", "store-1", "prod-coffee", "sku1", 500, None, False),
        ProductOffer("off-2", "r2", "store-2", "prod-coffee", "sku2", 800, None, True),
    ]

    plan = optimize_shopping_plan(req, products, offers, [s1, s2], max_stores=2)
    assert plan.is_complete is True
    assert plan.total_cents == 800
    assert plan.store_ids == ["store-2"]


def test_optimizer_two_store_split_and_savings():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    p_milk = Product("prod-milk", "Milk", "Farm", "1", "gal")
    p_eggs = Product("prod-eggs", "Eggs", "Farm", "12", "ct")

    req = [
        GroceryItem("i1", "prod-milk", 1),
        GroceryItem("i2", "prod-eggs", 1),
    ]
    products = {"prod-milk": p_milk, "prod-eggs": p_eggs}

    # Store 1: Milk $3.00, Eggs $5.00 (Total $8.00)
    # Store 2: Milk $5.00, Eggs $3.00 (Total $8.00)
    # Split across Store 1 & Store 2: Milk $3.00 at Store 1, Eggs $3.00 at Store 2 (Total $6.00)
    offers = [
        ProductOffer("o1", "r1", "store-1", "prod-milk", "k1", 300, None, True),
        ProductOffer("o2", "r1", "store-1", "prod-eggs", "k2", 500, None, True),
        ProductOffer("o3", "r2", "store-2", "prod-milk", "k3", 500, None, True),
        ProductOffer("o4", "r2", "store-2", "prod-eggs", "k4", 300, None, True),
    ]

    result = compare_shopping_plans(req, products, offers, [s1, s2])
    assert result.one_store_plan.is_complete is True
    assert result.one_store_plan.total_cents == 800

    assert result.best_plan.is_complete is True
    assert result.best_plan.total_cents == 600
    assert set(result.best_plan.store_ids) == {"store-1", "store-2"}

    assert result.savings_cents == 200
    assert result.additional_stops == 1


def test_optimizer_incomplete_one_store_basket_with_valid_two_store_plan():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    p_bread = Product("prod-bread", "Bread", "Bakery", "20", "oz")
    p_butter = Product("prod-butter", "Butter", "Dairy", "16", "oz")

    req = [
        GroceryItem("i1", "prod-bread", 1),
        GroceryItem("i2", "prod-butter", 1),
    ]
    products = {"prod-bread": p_bread, "prod-butter": p_butter}

    # Store 1 has only bread; Store 2 has only butter
    offers = [
        ProductOffer("o1", "r1", "store-1", "prod-bread", "k1", 250, None, True),
        ProductOffer("o2", "r2", "store-2", "prod-butter", "k2", 350, None, True),
    ]

    result = compare_shopping_plans(req, products, offers, [s1, s2])
    assert result.one_store_plan.is_complete is False
    assert result.best_plan.is_complete is True
    assert result.best_plan.total_cents == 600
    assert set(result.best_plan.store_ids) == {"store-1", "store-2"}
    assert result.savings_cents is None
    assert result.additional_stops == 1


def test_optimizer_completely_unfulfillable_basket():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    p_apple = Product("prod-apple", "Honeycrisp Apple", "Orchard", "1", "lb")

    req = [GroceryItem("i1", "prod-apple", 2)]
    products = {"prod-apple": p_apple}
    offers = []

    result = compare_shopping_plans(req, products, offers, [s1])
    assert result.one_store_plan.is_complete is False
    assert result.best_plan.is_complete is False
    assert "prod-apple" in result.best_plan.missing_product_ids
    assert result.savings_cents is None


def test_optimizer_deterministic_tie_breaking():
    # Tie 1: equal total between 1 store and 2 stores -> prefer 1 store
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    p_tea = Product("prod-tea", "Green Tea", "TeaCo", "20", "ct")

    req = [GroceryItem("i1", "prod-tea", 1)]
    products = {"prod-tea": p_tea}

    # Both stores offer tea for $3.00
    offers = [
        ProductOffer("o1", "r1", "store-1", "prod-tea", "k1", 300, None, True),
        ProductOffer("o2", "r2", "store-2", "prod-tea", "k2", 300, None, True),
    ]

    plan = optimize_shopping_plan(req, products, offers, [s1, s2], max_stores=2)
    assert plan.is_complete is True
    # Stable ordering: store-1 has sort_order 1 < store-2 sort_order 2
    assert plan.store_ids == ["store-1"]
    assert plan.items[0].store_id == "store-1"


def test_optimizer_max_stores_strict_limit():
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    s3 = Store(id="store-3", retailer_id="r3", name="Store 3", slug="s3", sort_order=3)

    p1 = Product("p1", "Item 1", "B", "1", "ct")
    p2 = Product("p2", "Item 2", "B", "1", "ct")
    p3 = Product("p3", "Item 3", "B", "1", "ct")

    # Item 1 only at Store 1
    # Item 2 only at Store 2
    # Item 3 only at Store 3
    req = [GroceryItem("i1", "p1", 1), GroceryItem("i2", "p2", 1), GroceryItem("i3", "p3", 1)]
    products = {"p1": p1, "p2": p2, "p3": p3}
    offers = [
        ProductOffer("o1", "r1", "store-1", "p1", "k1", 100, None, True),
        ProductOffer("o2", "r2", "store-2", "p2", "k2", 100, None, True),
        ProductOffer("o3", "r3", "store-3", "p3", "k3", 100, None, True),
    ]

    # Needs 3 stores, but max_stores=2
    plan = optimize_shopping_plan(req, products, offers, [s1, s2, s3], max_stores=2)
    assert plan.is_complete is False
    assert len(plan.store_ids) == 0


def test_optimizer_combination_tie_breaking():
    # Two pairs of stores: (s1, s3) and (s2, s3), both total $2.00
    s1 = Store(id="store-1", retailer_id="r1", name="Store 1", slug="s1", sort_order=1)
    s2 = Store(id="store-2", retailer_id="r2", name="Store 2", slug="s2", sort_order=2)
    s3 = Store(id="store-3", retailer_id="r3", name="Store 3", slug="s3", sort_order=3)

    p1 = Product("p1", "Item 1", "B", "1", "ct")
    p2 = Product("p2", "Item 2", "B", "1", "ct")

    req = [GroceryItem("i1", "p1", 1), GroceryItem("i2", "p2", 1)]
    products = {"p1": p1, "p2": p2}

    # Item 1 at Store 1 ($1) and Store 2 ($1)
    # Item 2 only at Store 3 ($1)
    offers = [
        ProductOffer("o1", "r1", "store-1", "p1", "k1", 100, None, True),
        ProductOffer("o2", "r2", "store-2", "p1", "k2", 100, None, True),
        ProductOffer("o3", "r3", "store-3", "p2", "k3", 100, None, True),
    ]

    plan = optimize_shopping_plan(req, products, offers, [s1, s2, s3], max_stores=2)
    assert plan.is_complete is True
    # (store-1, store-3) comes before (store-2, store-3) in stable ordering
    assert plan.store_ids == ["store-1", "store-3"]

