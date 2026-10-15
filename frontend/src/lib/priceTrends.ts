import { PriceObservation, PriceTrendInfo } from "../types";

/**
 * Computes deterministic, exact-cent price trend for a canonical product
 * at a specific store using real user observations.
 *
 * Requirements:
 * - Same physical store comparisons
 * - Integer cent arithmetic (no float drift)
 * - Explicit missing/insufficient data states
 * - Never invents trends or estimates without historical observations
 */
export function computeProductPriceTrend(
  productId: string,
  observations: PriceObservation[],
  storeName?: string | null
): PriceTrendInfo {
  // Filter for matching product
  let productObs = observations.filter((o) => o.product_id === productId);

  // If store specified, filter for that store
  if (storeName && storeName.trim()) {
    const storeLower = storeName.trim().toLowerCase();
    const storeSpecific = productObs.filter((o) => o.store_name.toLowerCase() === storeLower);
    if (storeSpecific.length > 0) {
      productObs = storeSpecific;
    }
  }

  // Sort by observation_date DESC, then id DESC
  productObs.sort((a, b) => {
    if (a.observation_date !== b.observation_date) {
      return b.observation_date.localeCompare(a.observation_date);
    }
    return (b.id || "").localeCompare(a.id || "");
  });

  if (productObs.length === 0) {
    return {
      product_id: productId,
      store_name: storeName || "Any Store",
      latest_price_cents: 0,
      latest_date: "",
      trend_direction: "no_data",
      summary: "No observed prices recorded yet",
    };
  }

  const latest = productObs[0];
  const targetStore = latest.store_name;

  if (productObs.length === 1) {
    const priceStr = `$${(latest.price_cents / 100).toFixed(2)}`;
    return {
      product_id: productId,
      store_name: targetStore,
      latest_price_cents: latest.price_cents,
      latest_date: latest.observation_date,
      trend_direction: "insufficient_data",
      summary: `${priceStr} at ${targetStore} (${latest.observation_date})`,
    };
  }

  // 2+ observations at this store
  const previous = productObs[1];
  const diffCents = latest.price_cents - previous.price_cents;
  const latestPriceStr = `$${(latest.price_cents / 100).toFixed(2)}`;
  const prevPriceStr = `$${(previous.price_cents / 100).toFixed(2)}`;

  if (diffCents < 0) {
    const absDiff = Math.abs(diffCents);
    const dropStr = `$${(absDiff / 100).toFixed(2)}`;
    return {
      product_id: productId,
      store_name: targetStore,
      latest_price_cents: latest.price_cents,
      latest_date: latest.observation_date,
      previous_price_cents: previous.price_cents,
      previous_date: previous.observation_date,
      diff_cents: diffCents,
      trend_direction: "down",
      summary: `↓ ${dropStr} lower (${latestPriceStr} vs ${prevPriceStr} on ${previous.observation_date})`,
    };
  } else if (diffCents > 0) {
    const riseStr = `$${(diffCents / 100).toFixed(2)}`;
    return {
      product_id: productId,
      store_name: targetStore,
      latest_price_cents: latest.price_cents,
      latest_date: latest.observation_date,
      previous_price_cents: previous.price_cents,
      previous_date: previous.observation_date,
      diff_cents: diffCents,
      trend_direction: "up",
      summary: `↑ ${riseStr} higher (${latestPriceStr} vs ${prevPriceStr} on ${previous.observation_date})`,
    };
  } else {
    return {
      product_id: productId,
      store_name: targetStore,
      latest_price_cents: latest.price_cents,
      latest_date: latest.observation_date,
      previous_price_cents: previous.price_cents,
      previous_date: previous.observation_date,
      diff_cents: 0,
      trend_direction: "equal",
      summary: `Unchanged at ${latestPriceStr} since ${previous.observation_date}`,
    };
  }
}
