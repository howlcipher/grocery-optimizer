"""Unit tests for price text and document parser."""

from app.catalog.price_parser import parse_price_text
from app.domain.models import Product

MOCK_CATALOG = [
    Product(
        id="prod-milk-gal",
        name="Whole Milk",
        brand="Dairy Pure",
        package_quantity="1",
        package_unit="gal",
        aliases=["milk", "whole milk"],
        canonical_group="whole-milk-1-gal",
    ),
    Product(
        id="prod-kroger-milk",
        name="Kroger Whole Milk",
        brand="Kroger",
        package_quantity="1",
        package_unit="gal",
        aliases=["kroger milk", "milk"],
        canonical_group="whole-milk-1-gal",
    ),
    Product(
        id="prod-eggs-dozen",
        name="Grade A Large White Eggs",
        brand="Eggland's Best",
        package_quantity="12",
        package_unit="ct",
        aliases=["eggs", "dozen eggs"],
        canonical_group="large-eggs-12ct",
    ),
    Product(
        id="prod-cheerios-18",
        name="Cheerios Original Cereal",
        brand="General Mills",
        package_quantity="18",
        package_unit="oz",
        aliases=["cheerios", "cereal"],
        canonical_group="cheerios-cereal",
    ),
]


def test_parse_simple_price_lines():
    text = """
    Whole Milk 1 gal - $2.49
    Grade A Large White Eggs 12 ct @ $1.99
    """
    candidates = parse_price_text(text, MOCK_CATALOG)
    assert len(candidates) == 2

    c1 = candidates[0]
    assert c1["regular_price_cents"] == 249
    assert c1["price_cents"] == 249
    assert c1["is_promotional"] is False
    assert c1["matched_product_id"] == "prod-milk-gal"
    assert c1["match_confidence"] == "high"

    c2 = candidates[1]
    assert c2["price_cents"] == 199
    assert c2["matched_product_id"] == "prod-eggs-dozen"


def test_parse_was_now_promotional_line():
    text = "Kroger Whole Milk 1 gal Reg $2.89 Sale $2.49"
    candidates = parse_price_text(text, MOCK_CATALOG)
    assert len(candidates) == 1
    c = candidates[0]
    assert c["regular_price_cents"] == 289
    assert c["promotional_price_cents"] == 249
    assert c["price_cents"] == 249
    assert c["is_promotional"] is True
    assert "Sale: was $2.89, now $2.49" in str(c["promo_details"])


def test_parse_multi_buy_promotion():
    text = "Grade A Large White Eggs 12 ct 2 for $4.00"
    candidates = parse_price_text(text, MOCK_CATALOG)
    assert len(candidates) == 1
    c = candidates[0]
    assert c["price_cents"] == 200
    assert c["is_promotional"] is True
    assert "2 for $4.00" in str(c["promo_details"])


def test_parse_csv_text():
    csv_text = """Product,Price,Size
Cheerios Original Cereal,4.49,18 oz
Whole Milk,2.39,1 gal
"""
    candidates = parse_price_text(csv_text, MOCK_CATALOG)
    assert len(candidates) == 2
    assert candidates[0]["price_cents"] == 449
    assert candidates[0]["matched_product_id"] == "prod-cheerios-18"
    assert candidates[1]["price_cents"] == 239


def test_parse_unmatched_item_cleanly():
    text = "Organic Dragonfruit Yellow Pitaya 1 ct $6.99"
    candidates = parse_price_text(text, MOCK_CATALOG)
    assert len(candidates) == 1
    c = candidates[0]
    assert c["price_cents"] == 699
    assert c["match_confidence"] in ("unmatched", "medium")
