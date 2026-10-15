import { describe, it, expect } from "vitest";
import { computeProductPriceTrend } from "../src/lib/priceTrends";
import { PriceObservation } from "../src/types";

function createTestObservation(overrides: Partial<PriceObservation> & { id: string; product_id: string; price_cents: number; observation_date: string }): PriceObservation {
  return {
    product_name: "Test Product",
    product_brand: "Test Brand",
    store_id: "store-1",
    store_name: "Test Store",
    formatted_price: `$${(overrides.price_cents / 100).toFixed(2)}`,
    is_promotional: false,
    is_stale: false,
    notes: null,
    source: "user",
    source_attribution: "Local Shopper",
    created_at: `${overrides.observation_date}T10:00:00Z`,
    updated_at: `${overrides.observation_date}T10:00:00Z`,
    ...overrides,
  };
}

describe("computeProductPriceTrend", () => {
  it("handles empty observation dataset", () => {
    const trend = computeProductPriceTrend("prod-milk", []);
    expect(trend.trend_direction).toBe("no_data");
    expect(trend.summary).toBe("No observed prices recorded yet");
  });

  it("handles single observation as insufficient historical data", () => {
    const observations: PriceObservation[] = [
      createTestObservation({
        id: "obs-1",
        product_id: "prod-milk",
        store_id: "store-1",
        store_name: "Meijer #206",
        price_cents: 299,
        observation_date: "2026-10-15",
      }),
    ];

    const trend = computeProductPriceTrend("prod-milk", observations, "Meijer #206");
    expect(trend.trend_direction).toBe("insufficient_data");
    expect(trend.latest_price_cents).toBe(299);
    expect(trend.summary).toContain("$2.99 at Meijer #206 (2026-10-15)");
  });

  it("detects price drop between consecutive observations at the same store", () => {
    const observations: PriceObservation[] = [
      createTestObservation({
        id: "obs-2",
        product_id: "prod-milk",
        store_id: "store-1",
        store_name: "Meijer #206",
        price_cents: 279,
        observation_date: "2026-10-15",
        is_promotional: true,
      }),
      createTestObservation({
        id: "obs-1",
        product_id: "prod-milk",
        store_id: "store-1",
        store_name: "Meijer #206",
        price_cents: 299,
        observation_date: "2026-10-01",
      }),
    ];

    const trend = computeProductPriceTrend("prod-milk", observations, "Meijer #206");
    expect(trend.trend_direction).toBe("down");
    expect(trend.diff_cents).toBe(-20);
    expect(trend.summary).toContain("↓ $0.20 lower ($2.79 vs $2.99 on 2026-10-01)");
  });

  it("detects price increase between consecutive observations at the same store", () => {
    const observations: PriceObservation[] = [
      createTestObservation({
        id: "obs-2",
        product_id: "prod-eggs",
        store_id: "store-1",
        store_name: "ALDI #47",
        price_cents: 349,
        observation_date: "2026-10-15",
      }),
      createTestObservation({
        id: "obs-1",
        product_id: "prod-eggs",
        store_id: "store-1",
        store_name: "ALDI #47",
        price_cents: 299,
        observation_date: "2026-10-01",
      }),
    ];

    const trend = computeProductPriceTrend("prod-eggs", observations, "ALDI #47");
    expect(trend.trend_direction).toBe("up");
    expect(trend.diff_cents).toBe(50);
    expect(trend.summary).toContain("↑ $0.50 higher ($3.49 vs $2.99 on 2026-10-01)");
  });

  it("detects unchanged price between observations", () => {
    const observations: PriceObservation[] = [
      createTestObservation({
        id: "obs-2",
        product_id: "prod-bread",
        store_id: "store-1",
        store_name: "Kroger #695",
        price_cents: 199,
        observation_date: "2026-10-15",
      }),
      createTestObservation({
        id: "obs-1",
        product_id: "prod-bread",
        store_id: "store-1",
        store_name: "Kroger #695",
        price_cents: 199,
        observation_date: "2026-10-05",
      }),
    ];

    const trend = computeProductPriceTrend("prod-bread", observations, "Kroger #695");
    expect(trend.trend_direction).toBe("equal");
    expect(trend.diff_cents).toBe(0);
    expect(trend.summary).toBe("Unchanged at $1.99 since 2026-10-05");
  });
});
