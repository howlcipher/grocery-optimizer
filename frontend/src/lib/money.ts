/**
 * Formats integer cents into a standard currency string (e.g. 6594 -> "$65.94").
 */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || isNaN(cents)) {
    return "$0.00";
  }
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}
