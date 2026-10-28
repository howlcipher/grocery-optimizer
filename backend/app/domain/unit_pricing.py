"""Unit pricing calculation for standardized price comparisons."""

from __future__ import annotations


def calculate_unit_price(
    price_cents: int,
    package_quantity: str | None,
    package_unit: str | None,
) -> tuple[float, str] | None:
    """Calculate unit price in cents per standardized unit (e.g. $/oz, $/lb, $/gal, $/ct).

    Returns (unit_price_cents, unit_label) or None if package size is invalid.
    """
    if price_cents <= 0 or not package_quantity or not package_unit:
        return None

    try:
        qty = float(package_quantity.strip())
        if qty <= 0:
            return None
    except (ValueError, TypeError):
        return None

    unit = package_unit.strip().lower()

    # Standardize units
    if unit in ("oz", "ounce", "ounces"):
        return round(price_cents / qty, 2), "oz"
    elif unit in ("fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces"):
        return round(price_cents / qty, 2), "fl oz"
    elif unit in ("gal", "gallon", "gallons"):
        return round(price_cents / qty, 2), "gal"
    elif unit in ("lb", "lbs", "pound", "pounds"):
        return round(price_cents / qty, 2), "lb"
    elif unit in ("ct", "count", "pk", "pack", "ea", "each"):
        return round(price_cents / qty, 2), "ct"
    elif unit in ("qt", "quart", "quarts"):
        return round(price_cents / qty, 2), "qt"
    elif unit in ("l", "liter", "liters"):
        return round(price_cents / qty, 2), "L"
    elif unit in ("g", "gram", "grams"):
        return round(price_cents / qty, 2), "g"
    else:
        return round(price_cents / qty, 2), unit
