from app.catalog.search import normalize_text, search_products
from app.domain.models import Product


def test_normalize_text():
    assert normalize_text("  Whole Milk, 1% - Gallon! ") == "whole milk 1 gallon"
    assert normalize_text("") == ""
    assert normalize_text("   ") == ""


def test_search_empty_or_whitespace():
    p1 = Product("p1", "Milk", "Farm", "1", "gal")
    catalog = [p1]
    assert search_products("", catalog) == []
    assert search_products("   ", catalog) == []


def test_search_exact_vs_prefix_vs_substring_ranking():
    p_exact = Product("p-exact", "Apple", "Fresh", "1", "lb")
    p_prefix = Product("p-prefix", "Apple Juice", "Fresh", "64", "fl oz")
    p_substring = Product("p-sub", "Pineapple Slices", "Dole", "20", "oz")
    p_other = Product("p-other", "Orange Juice", "Tropicana", "52", "fl oz")

    catalog = [p_substring, p_prefix, p_other, p_exact]
    results = search_products("apple", catalog)

    assert len(results) == 3
    assert results[0].id == "p-exact"
    assert results[1].id == "p-prefix"
    assert results[2].id == "p-sub"


def test_search_aliases():
    p_oj = Product("p-oj", "100% Pure Florida Orange Juice", "Florida's Natural", "52", "oz", aliases=["oj", "orange juice"])
    p_milk = Product("p-milk", "Whole Milk", "Farm", "1", "gal")

    catalog = [p_oj, p_milk]
    results = search_products("oj", catalog)
    assert len(results) == 1
    assert results[0].id == "p-oj"


def test_search_distinct_package_sizes():
    p12 = Product("c-12", "Cheerios Original", "General Mills", "12", "oz")
    p18 = Product("c-18", "Cheerios Original", "General Mills", "18", "oz")
    p_honey = Product("c-hn", "Honey Nut Cheerios", "General Mills", "18", "oz")

    catalog = [p_honey, p18, p12]
    results = search_products("cheerios", catalog)

    assert len(results) == 3
    # Distinct package sizes are preserved
    ids = [r.id for r in results]
    assert "c-12" in ids
    assert "c-18" in ids
    assert "c-hn" in ids


def test_search_no_match():
    p1 = Product("p1", "Bread", "Bakery", "20", "oz")
    assert search_products("dragonfruit", [p1]) == []
