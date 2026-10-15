from app.domain.models import Product, ProductOffer, Retailer, Store

SEED_RETAILERS: list[Retailer] = [
    Retailer(id="ret-fresh-basket", name="Fresh Basket", slug="fresh-basket"),
    Retailer(id="ret-value-foods", name="Value Foods", slug="value-foods"),
]

SEED_STORES: list[Store] = [
    Store(
        id="store-fb-north",
        retailer_id="ret-fresh-basket",
        name="Fresh Basket Northside",
        slug="fb-north",
        sort_order=10,
    ),
    Store(
        id="store-fb-river",
        retailer_id="ret-fresh-basket",
        name="Fresh Basket Riverside",
        slug="fb-river",
        sort_order=20,
    ),
    Store(
        id="store-vf-east",
        retailer_id="ret-value-foods",
        name="Value Foods Eastgate",
        slug="vf-east",
        sort_order=30,
    ),
]

SEED_PRODUCTS: list[Product] = [
    Product(
        id="prod-milk-gal",
        name="Whole Milk",
        brand="Dairy Pure",
        package_quantity="1",
        package_unit="gal",
        aliases=["whole milk", "milk"],
        upc="011110416001",
    ),
    Product(
        id="prod-milk-2pct",
        name="2% Reduced Fat Milk",
        brand="Dairy Pure",
        package_quantity="1",
        package_unit="gal",
        aliases=["2% milk", "reduced fat milk"],
        upc="011110416002",
    ),
    Product(
        id="prod-eggs-dozen",
        name="Grade A Large White Eggs",
        brand="Eggland's Best",
        package_quantity="12",
        package_unit="ct",
        aliases=["eggs", "dozen eggs"],
        upc="011110416003",
    ),
    Product(
        id="prod-cheerios-12",
        name="Cheerios Original Cereal",
        brand="General Mills",
        package_quantity="12",
        package_unit="oz",
        aliases=["cheerios", "cereal"],
        upc="016000275270",
    ),
    Product(
        id="prod-cheerios-18",
        name="Cheerios Original Cereal",
        brand="General Mills",
        package_quantity="18",
        package_unit="oz",
        aliases=["cheerios", "cereal", "family size cheerios"],
        upc="016000275287",
    ),
    Product(
        id="prod-bread-white",
        name="Classic White Sandwich Bread",
        brand="Wonder",
        package_quantity="20",
        package_unit="oz",
        aliases=["bread", "white bread"],
        upc="072250011166",
    ),
    Product(
        id="prod-bread-wheat",
        name="100% Whole Wheat Bread",
        brand="Nature's Own",
        package_quantity="20",
        package_unit="oz",
        aliases=["wheat bread", "whole wheat bread"],
        upc="072250037128",
    ),
    Product(
        id="prod-butter",
        name="Salted Butter Quarters",
        brand="Land O Lakes",
        package_quantity="16",
        package_unit="oz",
        aliases=["butter"],
        upc="034500151364",
    ),
    Product(
        id="prod-chicken-breast",
        name="Boneless Skinless Chicken Breasts",
        brand="Tyson",
        package_quantity="2",
        package_unit="lb",
        aliases=["chicken", "chicken breast"],
        upc="023700016027",
    ),
    Product(
        id="prod-ground-beef",
        name="80/20 Ground Beef",
        brand="Fresh Choice",
        package_quantity="1",
        package_unit="lb",
        aliases=["ground beef", "beef", "hamburger"],
        upc="020000000010",
    ),
    Product(
        id="prod-coffee-colombian",
        name="Medium Roast Colombian Ground Coffee",
        brand="Eight O'Clock",
        package_quantity="12",
        package_unit="oz",
        aliases=["coffee", "ground coffee"],
        upc="011141100234",
    ),
    Product(
        id="prod-oj-52",
        name="Pure Premium Original Orange Juice",
        brand="Tropicana",
        package_quantity="52",
        package_unit="fl oz",
        aliases=["oj", "orange juice"],
        upc="048500001028",
    ),
    Product(
        id="prod-bananas",
        name="Yellow Bananas",
        brand="Chiquita",
        package_quantity="2",
        package_unit="lb",
        aliases=["banana", "bananas"],
        upc="040110000001",
    ),
    Product(
        id="prod-apples-gala",
        name="Gala Apples",
        brand="Washington Orchard",
        package_quantity="3",
        package_unit="lb",
        aliases=["apple", "apples", "gala apples"],
        upc="033383000012",
    ),
    Product(
        id="prod-specialty-tea",
        name="Organic Earl Grey Loose Leaf Tea",
        brand="Artisan Tea",
        package_quantity="4",
        package_unit="oz",
        aliases=["tea", "earl grey"],
        upc="055555000019",
    ),
    Product(
        id="prod-dragonfruit",
        name="Fresh Red Dragonfruit",
        brand="Exotic Farms",
        package_quantity="1",
        package_unit="ct",
        aliases=["dragonfruit", "pitaya"],
        upc="099999000001",
    ),
    Product(
        id="prod-rolled-oats",
        name="Old Fashioned Rolled Oats",
        brand="Value Grain",
        package_quantity="32",
        package_unit="oz",
        aliases=["oats", "oatmeal", "rolled oats"],
        upc="077777000018",
    ),
]

SEED_OFFERS: list[ProductOffer] = [
    # Whole Milk
    ProductOffer("off-m1-n", "ret-fresh-basket", "store-fb-north", "prod-milk-gal", "FB-M-01", 389, None, True),
    ProductOffer("off-m1-r", "ret-fresh-basket", "store-fb-river", "prod-milk-gal", "FB-M-01", 379, None, True),
    ProductOffer("off-m1-e", "ret-value-foods", "store-vf-east", "prod-milk-gal", "VF-M-01", 329, None, True),

    # 2% Milk
    ProductOffer("off-m2-n", "ret-fresh-basket", "store-fb-north", "prod-milk-2pct", "FB-M-02", 379, None, True),
    ProductOffer("off-m2-r", "ret-fresh-basket", "store-fb-river", "prod-milk-2pct", "FB-M-02", 369, None, True),
    ProductOffer("off-m2-e", "ret-value-foods", "store-vf-east", "prod-milk-2pct", "VF-M-02", 319, None, True),

    # Large Eggs
    ProductOffer("off-e-n", "ret-fresh-basket", "store-fb-north", "prod-eggs-dozen", "FB-E-01", 349, None, True),
    ProductOffer("off-e-r", "ret-fresh-basket", "store-fb-river", "prod-eggs-dozen", "FB-E-01", 329, None, True),
    ProductOffer("off-e-e", "ret-value-foods", "store-vf-east", "prod-eggs-dozen", "VF-E-01", 299, None, True),

    # Cheerios 12 oz
    ProductOffer("off-c12-n", "ret-fresh-basket", "store-fb-north", "prod-cheerios-12", "FB-C-12", 429, None, True),
    ProductOffer("off-c12-r", "ret-fresh-basket", "store-fb-river", "prod-cheerios-12", "FB-C-12", 419, None, True),
    ProductOffer("off-c12-e", "ret-value-foods", "store-vf-east", "prod-cheerios-12", "VF-C-12", 389, None, True),

    # Cheerios 18 oz (With promotional pricing at Fresh Basket Northside: $5.49 reg, $4.49 sale)
    ProductOffer("off-c18-n", "ret-fresh-basket", "store-fb-north", "prod-cheerios-18", "FB-C-18", 549, 449, True),
    ProductOffer("off-c18-r", "ret-fresh-basket", "store-fb-river", "prod-cheerios-18", "FB-C-18", 529, None, True),
    ProductOffer("off-c18-e", "ret-value-foods", "store-vf-east", "prod-cheerios-18", "VF-C-18", 499, None, True),

    # White Bread
    ProductOffer("off-bw-n", "ret-fresh-basket", "store-fb-north", "prod-bread-white", "FB-B-01", 249, None, True),
    ProductOffer("off-bw-r", "ret-fresh-basket", "store-fb-river", "prod-bread-white", "FB-B-01", 239, None, True),
    ProductOffer("off-bw-e", "ret-value-foods", "store-vf-east", "prod-bread-white", "VF-B-01", 199, None, True),

    # Wheat Bread
    ProductOffer("off-bwh-n", "ret-fresh-basket", "store-fb-north", "prod-bread-wheat", "FB-B-02", 329, None, True),
    ProductOffer("off-bwh-r", "ret-fresh-basket", "store-fb-river", "prod-bread-wheat", "FB-B-02", 319, None, True),
    ProductOffer("off-bwh-e", "ret-value-foods", "store-vf-east", "prod-bread-wheat", "VF-B-02", 289, None, True),

    # Butter
    ProductOffer("off-but-n", "ret-fresh-basket", "store-fb-north", "prod-butter", "FB-BT-01", 499, 429, True),
    ProductOffer("off-but-r", "ret-fresh-basket", "store-fb-river", "prod-butter", "FB-BT-01", 489, None, True),
    ProductOffer("off-but-e", "ret-value-foods", "store-vf-east", "prod-butter", "VF-BT-01", 449, None, True),

    # Chicken Breast
    ProductOffer("off-ck-n", "ret-fresh-basket", "store-fb-north", "prod-chicken-breast", "FB-CK-01", 999, None, True),
    ProductOffer("off-ck-r", "ret-fresh-basket", "store-fb-river", "prod-chicken-breast", "FB-CK-01", 949, None, True),
    ProductOffer("off-ck-e", "ret-value-foods", "store-vf-east", "prod-chicken-breast", "VF-CK-01", 849, None, True),

    # Ground Beef
    ProductOffer("off-gb-n", "ret-fresh-basket", "store-fb-north", "prod-ground-beef", "FB-GB-01", 599, None, True),
    ProductOffer("off-gb-r", "ret-fresh-basket", "store-fb-river", "prod-ground-beef", "FB-GB-01", 579, None, True),
    ProductOffer("off-gb-e", "ret-value-foods", "store-vf-east", "prod-ground-beef", "VF-GB-01", 499, None, True),

    # Coffee Colombian (Sale at Value Foods: $7.99 reg, $6.99 sale)
    ProductOffer("off-cf-n", "ret-fresh-basket", "store-fb-north", "prod-coffee-colombian", "FB-CF-01", 849, None, True),
    ProductOffer("off-cf-r", "ret-fresh-basket", "store-fb-river", "prod-coffee-colombian", "FB-CF-01", 829, None, True),
    ProductOffer("off-cf-e", "ret-value-foods", "store-vf-east", "prod-coffee-colombian", "VF-CF-01", 799, 699, True),

    # Orange Juice
    ProductOffer("off-oj-n", "ret-fresh-basket", "store-fb-north", "prod-oj-52", "FB-OJ-01", 469, None, True),
    ProductOffer("off-oj-r", "ret-fresh-basket", "store-fb-river", "prod-oj-52", "FB-OJ-01", 449, None, True),
    ProductOffer("off-oj-e", "ret-value-foods", "store-vf-east", "prod-oj-52", "VF-OJ-01", 419, None, True),

    # Bananas (Deterministic price tie: exactly 118 cents at all 3 stores)
    ProductOffer("off-bn-n", "ret-fresh-basket", "store-fb-north", "prod-bananas", "FB-BN-01", 118, None, True),
    ProductOffer("off-bn-r", "ret-fresh-basket", "store-fb-river", "prod-bananas", "FB-BN-01", 118, None, True),
    ProductOffer("off-bn-e", "ret-value-foods", "store-vf-east", "prod-bananas", "VF-BN-01", 118, None, True),

    # Gala Apples
    ProductOffer("off-ap-n", "ret-fresh-basket", "store-fb-north", "prod-apples-gala", "FB-AP-01", 499, None, True),
    ProductOffer("off-ap-r", "ret-fresh-basket", "store-fb-river", "prod-apples-gala", "FB-AP-01", 479, None, True),
    ProductOffer("off-ap-e", "ret-value-foods", "store-vf-east", "prod-apples-gala", "VF-AP-01", 429, None, True),

    # Specialty Tea (Available ONLY at Fresh Basket Northside; missing at Riverside and Eastgate)
    ProductOffer("off-tea-n", "ret-fresh-basket", "store-fb-north", "prod-specialty-tea", "FB-TEA-01", 699, None, True),

    # Rolled Oats (Available ONLY at Value Foods Eastgate; missing at Fresh Basket Northside and Riverside)
    ProductOffer("off-oats-e", "ret-value-foods", "store-vf-east", "prod-rolled-oats", "VF-OAT-01", 349, None, True),

    # Dragonfruit (Offered only as unavailable across all stores -> unfulfillable scenario)
    ProductOffer("off-df-n", "ret-fresh-basket", "store-fb-north", "prod-dragonfruit", "FB-DF-01", 599, None, False),
    ProductOffer("off-df-r", "ret-fresh-basket", "store-fb-river", "prod-dragonfruit", "FB-DF-01", 599, None, False),
    ProductOffer("off-df-e", "ret-value-foods", "store-vf-east", "prod-dragonfruit", "VF-DF-01", 499, None, False),
]
