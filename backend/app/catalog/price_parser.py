"""Price text and document parser for consumer-supplied retailer pricing.

Extracts product names, package sizes, regular prices, promotional prices, and discount conditions
from copy-and-pasted shopping cart text, weekly ad circular text, CSVs, or OCR snippets.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any

from app.catalog.search import normalize_text
from app.domain.models import Product

# Regex patterns for price detection
PRICE_DOLLAR_REGEX = re.compile(r"\$\s*(\d{1,4}(?:\.\d{2})?)")
PRICE_DECIMAL_REGEX = re.compile(r"\b(\d{1,3}\.\d{2})\b")
SALE_WAS_NOW_REGEX = re.compile(
    r"(?:was|reg|regular|orig)\s*\$?\s*(\d+(?:\.\d{2})?)[^\d]+(?:now|sale|for|promo)?\s*\$?\s*(\d+(?:\.\d{2})?)",
    re.IGNORECASE,
)
MULTI_BUY_REGEX = re.compile(r"(\d+)\s*(?:for|\/)\s*\$?\s*(\d+(?:\.\d{2})?)", re.IGNORECASE)
PACKAGE_SIZE_REGEX = re.compile(
    r"\b(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|gal|gallon|lb|lbs|pound|ct|count|pk|pack|qt|quart|liter|l|ml|g|kg)\b",
    re.IGNORECASE,
)
PROMO_KEYWORDS = ["sale", "promo", "deal", "discount", "save", "mperks", "plus card", "special", "coupon"]


def match_product_candidate(
    extracted_name: str,
    package_size: str | None,
    catalog: list[Product],
) -> tuple[Product | None, str]:
    """Match extracted text to the best catalog product.

    Returns (Product or None, confidence: 'high' | 'medium' | 'unmatched').
    """
    if not extracted_name or not catalog:
        return None, "unmatched"

    norm_query = normalize_text(extracted_name)
    q_tokens = set(norm_query.split())

    best_prod: Product | None = None
    best_score = -1.0
    best_confidence = "unmatched"

    for p in catalog:
        norm_pname = normalize_text(p.name)
        norm_brand = normalize_text(p.brand)
        norm_fullname = f"{norm_brand} {norm_pname}".strip()
        p_tokens = set(norm_pname.split())

        # Exact match
        if norm_fullname == norm_query or norm_pname == norm_query:
            score = 100.0
            confidence = "high"
        elif norm_fullname in norm_query or norm_query in norm_fullname:
            score = 80.0
            confidence = "high"
        elif norm_pname in norm_query:
            score = 60.0
            confidence = "high"
        elif any(normalize_text(a) in norm_query for a in p.aliases):
            score = 50.0
            confidence = "high"
        else:
            # Token overlap score
            overlap = len(q_tokens & p_tokens)
            if overlap >= 2:
                score = 30.0 + (overlap * 5.0)
                confidence = "medium"
            elif overlap == 1 and len(p_tokens) == 1:
                score = 25.0
                confidence = "medium"
            else:
                score = 0.0
                confidence = "unmatched"

        # Package size boost
        if package_size and score > 0:
            norm_pkg = normalize_text(package_size)
            norm_prod_pkg = normalize_text(f"{p.package_quantity} {p.package_unit}")
            if norm_prod_pkg in norm_pkg or norm_pkg in norm_prod_pkg:
                score += 15.0

        if score > best_score and confidence != "unmatched":
            best_score = score
            best_prod = p
            best_confidence = confidence

    return best_prod, best_confidence


def parse_price_text(
    raw_text: str,
    catalog: list[Product],
    retailer_name: str | None = None,
) -> list[dict[str, Any]]:
    """Parse raw text lines into structured candidate items with catalog matches."""
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    candidates: list[dict[str, Any]] = []

    # Check if text is CSV formatted
    if len(lines) > 1 and ("," in lines[0] or "\t" in lines[0]):
        try:
            delimiter = "\t" if "\t" in lines[0] else ","
            reader = csv.reader(io.StringIO(raw_text), delimiter=delimiter)
            header = [h.strip().lower() for h in next(reader, [])]
            if any(k in header for k in ["product", "item", "name", "price", "regular"]):
                return _parse_csv_records(reader, header, catalog, retailer_name)
        except (csv.Error, ValueError, IndexError):
            pass  # Fall back to line-by-line parsing

    for line in lines:
        if len(line) < 3:
            continue
        parsed = _parse_single_line(line, catalog)
        if parsed:
            candidates.append(parsed)

    return candidates


def _parse_single_line(line: str, catalog: list[Product]) -> dict[str, Any] | None:
    # 1. Check for was/now promotional pattern (e.g. "Reg $4.99 Sale $3.99")
    was_now_match = SALE_WAS_NOW_REGEX.search(line)
    regular_cents: int | None = None
    promo_cents: int | None = None
    is_promotional = False
    promo_details: str | None = None

    if was_now_match:
        try:
            reg_val = float(was_now_match.group(1))
            now_val = float(was_now_match.group(2))
            regular_cents = round(reg_val * 100)
            candidate_promo = round(now_val * 100)
            if 0 < candidate_promo < regular_cents:
                promo_cents = candidate_promo
                is_promotional = True
                promo_details = f"Sale: was ${reg_val:.2f}, now ${now_val:.2f}"
            else:
                regular_cents = candidate_promo
        except (ValueError, TypeError):
            pass

    # 2. Check for multi-buy pattern (e.g. "2 for $5.00" -> $2.50 ea)
    if regular_cents is None:
        multi_match = MULTI_BUY_REGEX.search(line)
        if multi_match:
            try:
                qty = int(multi_match.group(1))
                total = float(multi_match.group(2))
                if qty > 0 and total > 0:
                    unit_price = total / qty
                    regular_cents = round(unit_price * 100)
                    is_promotional = True
                    promo_details = f"{qty} for ${total:.2f} (${unit_price:.2f} each)"
            except (ValueError, TypeError):
                pass

    # 3. Standard dollar or decimal price
    if regular_cents is None:
        dollar_match = PRICE_DOLLAR_REGEX.search(line)
        if dollar_match:
            try:
                val = float(dollar_match.group(1))
                if 0.01 <= val <= 500.00:
                    regular_cents = round(val * 100)
            except (ValueError, TypeError):
                pass

    if regular_cents is None:
        dec_match = PRICE_DECIMAL_REGEX.search(line)
        if dec_match:
            try:
                val = float(dec_match.group(1))
                if 0.01 <= val <= 500.00:
                    regular_cents = round(val * 100)
            except (ValueError, TypeError):
                pass

    if regular_cents is None:
        return None  # No valid price found in this line

    # 4. Check for promo keywords if not already tagged
    line_lower = line.lower()
    if not is_promotional and any(kw in line_lower for kw in PROMO_KEYWORDS):
        is_promotional = True
        promo_details = "Promotional offer"

    # 5. Extract package size (e.g. "1 gal", "16 oz")
    package_size: str | None = None
    pkg_match = PACKAGE_SIZE_REGEX.search(line)
    if pkg_match:
        qty_str = pkg_match.group(1)
        unit_str = pkg_match.group(2).lower().replace(" ", "")
        package_size = f"{qty_str} {unit_str}"

    # 6. Extract clean product name
    cleaned = line
    # Remove price phrases
    cleaned = PRICE_DOLLAR_REGEX.sub("", cleaned)
    cleaned = SALE_WAS_NOW_REGEX.sub("", cleaned)
    cleaned = MULTI_BUY_REGEX.sub("", cleaned)
    # Remove separators and promo badges
    for kw in PROMO_KEYWORDS:
        cleaned = re.sub(rf"\b{kw}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[-–—:|@/]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    extracted_name = cleaned if cleaned else line.strip()

    # 7. Match against catalog
    best_match, match_confidence = match_product_candidate(extracted_name, package_size, catalog)
    matched_id = best_match.id if best_match else None
    matched_name = f"{best_match.brand} {best_match.name}" if best_match else None
    canonical_grp = getattr(best_match, "canonical_group", None) if best_match else None

    price_cents = promo_cents if (is_promotional and promo_cents) else regular_cents

    return {
        "raw_line": line,
        "extracted_name": extracted_name,
        "package_size": package_size,
        "regular_price_cents": regular_cents,
        "promotional_price_cents": promo_cents,
        "price_cents": price_cents,
        "is_promotional": is_promotional,
        "promo_details": promo_details,
        "matched_product_id": matched_id,
        "matched_product_name": matched_name,
        "match_confidence": match_confidence,
        "canonical_group": canonical_grp,
    }


def _parse_csv_records(
    reader: Any,
    header: list[str],
    catalog: list[Product],
    retailer_name: str | None,
) -> list[dict[str, Any]]:
    """Parse CSV rows with standard column names."""
    results: list[dict[str, Any]] = []

    # Map column indexes
    name_idx = -1
    price_idx = -1
    promo_idx = -1
    size_idx = -1
    brand_idx = -1

    for idx, col in enumerate(header):
        if any(k in col for k in ["product", "item", "name", "description"]):
            name_idx = idx
        elif any(k in col for k in ["sale", "promo"]):
            promo_idx = idx
        elif any(k in col for k in ["price", "reg", "regular"]):
            price_idx = idx
        elif any(k in col for k in ["size", "quantity", "package", "unit"]):
            size_idx = idx
        elif "brand" in col:
            brand_idx = idx

    for row in reader:
        if not row or (name_idx >= 0 and not row[name_idx].strip()):
            continue
        raw_name = row[name_idx].strip() if name_idx >= 0 and name_idx < len(row) else ""
        raw_price = row[price_idx].strip() if price_idx >= 0 and price_idx < len(row) else ""
        raw_promo = row[promo_idx].strip() if promo_idx >= 0 and promo_idx < len(row) else ""
        raw_size = row[size_idx].strip() if size_idx >= 0 and size_idx < len(row) else None
        raw_brand = row[brand_idx].strip() if brand_idx >= 0 and brand_idx < len(row) else None

        line_str = f"{raw_name} ${raw_price} {raw_size or ''}"
        if raw_promo:
            line_str = f"{raw_name} Reg ${raw_price} Sale ${raw_promo} {raw_size or ''}"
        parsed = _parse_single_line(line_str, catalog)
        if parsed:
            if raw_brand:
                parsed["brand"] = raw_brand
            if raw_size:
                parsed["package_size"] = raw_size
            results.append(parsed)

    return results
