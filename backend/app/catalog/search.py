import re
from collections.abc import Sequence

from app.domain.models import Product

_PUNCTUATION_RE = re.compile(r"[\.,\-\'\"/!\?#\$%\^&\*\(\)_+=<>;:\[\]\{\}]")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    """Normalize text: lowercase, remove simple punctuation, collapse whitespace."""
    if not text:
        return ""
    no_punct = _PUNCTUATION_RE.sub(" ", text.lower())
    return _WHITESPACE_RE.sub(" ", no_punct).strip()


def _match_tier(query: str, target: str) -> int:
    """Returns match tier:

    0: Exact match
    1: Prefix match (target starts with query or word in target starts with query)
    2: Substring match (query contained in target)
    3: No match
    """
    if not target or not query:
        return 3

    if target == query:
        return 0

    if target.startswith(query):
        return 1

    words = target.split()
    if any(word.startswith(query) for word in words):
        return 1

    if query in target:
        return 2

    return 3


def search_products(
    query: str,
    catalog: Sequence[Product],
    limit: int = 10,
) -> list[Product]:
    """Search canonical catalog deterministically.

    Ranking:
    1. Match tier (exact match -> prefix match -> substring match)
    2. Product name ascending (case-insensitive)
    3. Product ID ascending
    """
    norm_query = normalize_text(query)
    if not norm_query:
        return []

    scored_products: list[tuple[int, str, str, Product]] = []

    for product in catalog:
        best_tier = 3

        # Check name
        name_tier = _match_tier(norm_query, normalize_text(product.name))
        best_tier = min(best_tier, name_tier)

        # Check brand
        brand_tier = _match_tier(norm_query, normalize_text(product.brand))
        best_tier = min(best_tier, brand_tier)

        # Check aliases
        for alias in product.aliases:
            alias_tier = _match_tier(norm_query, normalize_text(alias))
            best_tier = min(best_tier, alias_tier)

        if best_tier < 3:
            scored_products.append(
                (best_tier, product.name.lower(), product.id, product)
            )

    # Sort deterministically
    scored_products.sort(key=lambda item: (item[0], item[1], item[2]))

    return [item[3] for item in scored_products[:limit]]
