import React from "react";
import { ComparisonResponse, PlanItemResponse } from "../types";
import { formatCents } from "../lib/money";

interface ComparisonResultsProps {
  comparison: ComparisonResponse;
  onBackToList: () => void;
  onSwitchSource?: (source: "demonstration" | "user_contributed") => void;
  onFilterZip?: (zip: string | null) => void;
  onSetRegionScope?: (scope: "exact" | "neighborhood") => void;
  isSwitching?: boolean;
}

export const ComparisonResults: React.FC<ComparisonResultsProps> = ({
  comparison,
  onBackToList,
  onSwitchSource,
  onFilterZip,
  onSetRegionScope,
  isSwitching = false,
}) => {
  const { one_store_plan, best_plan, savings_cents, additional_stops, zip_code } = comparison;

  // Group items by store for the best plan
  const itemsByStore: Record<string, PlanItemResponse[]> = {};
  for (const item of best_plan.items) {
    if (!itemsByStore[item.store_name]) {
      itemsByStore[item.store_name] = [];
    }
    itemsByStore[item.store_name].push(item);
  }

  const isOneStoreComplete = one_store_plan.is_complete;
  const isBestPlanComplete = best_plan.is_complete;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary touch-target"
          onClick={onBackToList}
          aria-label="Back to editing grocery list"
        >
          ← Edit List
        </button>

        {/* Pricing Source Toggle */}
        {onSwitchSource && (
          <div className="source-toggle-group" role="group" aria-label="Pricing source selector">
            <button
              type="button"
              className={`source-toggle-btn ${comparison.pricing_source === "demonstration" ? "active" : ""}`}
              onClick={() => onSwitchSource("demonstration")}
              disabled={isSwitching || comparison.pricing_source === "demonstration"}
            >
              Demo Data
            </button>
            <button
              type="button"
              className={`source-toggle-btn ${comparison.pricing_source === "user_contributed" ? "active" : ""}`}
              onClick={() => onSwitchSource("user_contributed")}
              disabled={isSwitching || comparison.pricing_source === "user_contributed"}
            >
              User Observations
            </button>
          </div>
        )}
      </div>

      {/* Data Source Provenance Notice */}
      <div className={`consumer-notice-box ${comparison.is_demonstration ? "demo-notice" : "user-notice"}`} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className={`provenance-pill ${comparison.is_demonstration ? "pill-demo" : "pill-user"}`}>
              {comparison.pricing_source_label || (comparison.is_demonstration ? "Demonstration Prices" : "User-Entered Observations")}
            </span>
            {zip_code && (
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--color-primary)", background: "#e0f2fe", padding: "2px 8px", borderRadius: 4 }}>
                📍 {zip_code}
              </span>
            )}

            {!comparison.is_demonstration && zip_code && onSetRegionScope && (
              <div className="region-scope-group" role="group" aria-label="Geographic comparison scope">
                <button
                  type="button"
                  className={`region-scope-btn ${comparison.region_scope !== "neighborhood" ? "active" : ""}`}
                  onClick={() => onSetRegionScope("exact")}
                >
                  This ZIP
                </button>
                <button
                  type="button"
                  className={`region-scope-btn ${comparison.region_scope === "neighborhood" ? "active" : ""}`}
                  onClick={() => onSetRegionScope("neighborhood")}
                >
                  Nearby Stores
                </button>
              </div>
            )}
          </div>

          {!comparison.is_demonstration && onFilterZip && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label htmlFor="comp-zip-input" style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                Area ZIP:
              </label>
              <input
                id="comp-zip-input"
                type="text"
                className="search-input"
                style={{ width: 90, height: 32, fontSize: "0.8rem", padding: "0 6px" }}
                placeholder="e.g. 48042"
                defaultValue={zip_code || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onFilterZip((e.target as HTMLInputElement).value.trim() || null);
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value.trim() !== (zip_code || "")) {
                    onFilterZip(e.target.value.trim() || null);
                  }
                }}
              />
              {zip_code && (
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}
                  onClick={() => onFilterZip(null)}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <p style={{ marginTop: 6, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          {comparison.data_notice ||
            (comparison.is_demonstration
              ? "Prices shown are demonstration sample data from the mission seeder for feature testing."
              : "Prices are user-entered observations. Missing observation data does not mean stores lack this item. Never mixed with synthetic data.")}
        </p>

        {comparison.compared_zip_codes && comparison.compared_zip_codes.length > 1 && (
          <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#166534", fontWeight: 600 }}>
            📍 Regional comparison includes physical stores across ZIPs: {comparison.compared_zip_codes.join(", ")}
          </div>
        )}
      </div>

      {/* Unfulfillable Basket Warning */}
      {!isBestPlanComplete && (
        <div className="alert-box alert-error" role="alert">
          <h3 style={{ fontWeight: 700, marginBottom: 6 }}>No Complete Shopping Plan Found</h3>
          <p>
            {comparison.is_demonstration
              ? "We couldn't find a complete plan. These items aren't available at any combination of up to two stores:"
              : zip_code
              ? `We couldn't find a complete plan using user-recorded observations in ZIP ${zip_code}. These items have no recorded prices at physical stores in this area:`
              : "We couldn't find a complete plan using user-recorded observations. These items have no recorded prices for any combination of up to two stores:"}
          </p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            {best_plan.missing_products.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> ({p.brand})
              </li>
            ))}
          </ul>
          {!comparison.is_demonstration && (
            <p style={{ marginTop: 8, fontSize: "0.85rem", fontStyle: "italic" }}>
              Shoppers can record shelf prices for missing items to enable full basket comparison. Missing data does not mean stores do not stock the item.
            </p>
          )}
        </div>
      )}

      {/* Kroger vs Meijer Two-Store Household Comparison (Mission 006) */}
      {(comparison.kroger_coverage || comparison.meijer_coverage || (comparison.item_comparisons && comparison.item_comparisons.length > 0)) && (
        <section className="kroger-meijer-comparison-section" style={{ marginBottom: 24 }} aria-label="Kroger versus Meijer price hunt">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-main)" }}>
              🛒 Kroger vs Meijer Price Hunt
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {comparison.kroger_coverage && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  🔵 {comparison.kroger_coverage}
                </span>
              )}
              {comparison.meijer_coverage && (
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "#fef2f2",
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                  }}
                >
                  🔴 {comparison.meijer_coverage}
                </span>
              )}
            </div>
          </div>

          {/* Partial Coverage Warning */}
          {comparison.is_coverage_complete === false && (
            <div className="alert-box" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e", marginBottom: 16 }}>
              <strong>⚠️ Incomplete Basket Coverage:</strong> One or both stores are missing confirmed prices for some items. We never substitute zero or invent missing prices. Check the item table below for details.
            </div>
          )}

          {/* Side-by-Side Store Totals & Split Trip Decision */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 16 }}>
            {/* Kroger Plan Card */}
            <div style={{ padding: 14, borderRadius: 8, border: "2px solid #bfdbfe", background: "#f8fafc" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "#1d4ed8", marginBottom: 4 }}>
                All-Kroger Basket
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                {comparison.kroger_plan?.is_complete
                  ? formatCents(comparison.kroger_plan.total_cents)
                  : "Incomplete Basket"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                {comparison.kroger_plan?.stores?.[0]?.name || "Kroger Store"}
              </div>
            </div>

            {/* Meijer Plan Card */}
            <div style={{ padding: 14, borderRadius: 8, border: "2px solid #fecaca", background: "#f8fafc" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "#b91c1c", marginBottom: 4 }}>
                All-Meijer Basket
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                {comparison.meijer_plan?.is_complete
                  ? formatCents(comparison.meijer_plan.total_cents)
                  : "Incomplete Basket"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                {comparison.meijer_plan?.stores?.[0]?.name || "Meijer Store"}
              </div>
            </div>

            {/* Two-Store Split Plan Card */}
            <div style={{ padding: 14, borderRadius: 8, border: "2px solid var(--color-primary)", background: "var(--color-primary-light)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-primary)" }}>
                  2-Store Split Trip
                </span>
                {comparison.split_gross_savings_cents !== undefined && comparison.split_gross_savings_cents !== null && comparison.split_gross_savings_cents > 0 && (
                  <span className="savings-badge" style={{ fontSize: "0.75rem", padding: "2px 8px" }}>
                    Save {formatCents(comparison.split_gross_savings_cents)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                {comparison.split_plan?.is_complete
                  ? formatCents(comparison.split_plan.total_cents)
                  : "Incomplete Basket"}
              </div>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, marginTop: 4 }}>
                {comparison.extra_stop_justified
                  ? `✓ Second stop justified (Gross savings exceed threshold)`
                  : `💡 Second stop not justified (Savings below $3.00 threshold)`}
              </div>
            </div>
          </div>

          {/* Side-by-Side Item Comparisons Table */}
          {comparison.item_comparisons && comparison.item_comparisons.length > 0 && (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
              <div style={{ background: "#f8fafc", padding: "10px 16px", borderBottom: "1px solid var(--color-border)", fontWeight: 700, fontSize: "0.95rem" }}>
                Item Price Comparison (Side-by-Side)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="plan-items-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col" style={{ textAlign: "center" }}>Qty</th>
                      <th scope="col" style={{ textAlign: "right" }}>Kroger Offer</th>
                      <th scope="col" style={{ textAlign: "right" }}>Meijer Offer</th>
                      <th scope="col" style={{ textAlign: "center" }}>Cheaper Option</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.item_comparisons.map((it) => (
                      <tr key={it.product_id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            {it.brand} • {it.package_quantity} {it.package_unit}
                          </div>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 600 }}>x{it.requested_quantity}</td>
                        <td style={{ textAlign: "right" }}>
                          {it.kroger_price_cents !== null && it.kroger_price_cents !== undefined ? (
                            <div>
                              <span style={{ fontWeight: 700 }}>{formatCents(it.kroger_price_cents)}</span>
                              {it.kroger_is_sale && <span className="sale-pill" style={{ marginLeft: 4 }}>Sale</span>}
                              {it.unit_price_kroger_cents && (
                                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                  {formatCents(it.unit_price_kroger_cents)}/{it.unit_price_unit || "oz"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No price</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {it.meijer_price_cents !== null && it.meijer_price_cents !== undefined ? (
                            <div>
                              <span style={{ fontWeight: 700 }}>{formatCents(it.meijer_price_cents)}</span>
                              {it.meijer_is_sale && <span className="sale-pill" style={{ marginLeft: 4 }}>Sale</span>}
                              {it.unit_price_meijer_cents && (
                                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                  {formatCents(it.unit_price_meijer_cents)}/{it.unit_price_unit || "oz"}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--color-text-muted)", fontStyle: "italic" }}>No price</span>
                          )}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {it.cheaper_retailer === "kroger" ? (
                            <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                              Kroger {it.item_savings_cents > 0 ? `(-${formatCents(it.item_savings_cents)})` : ""}
                            </span>
                          ) : it.cheaper_retailer === "meijer" ? (
                            <span style={{ background: "#fef2f2", color: "#b91c1c", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                              Meijer {it.item_savings_cents > 0 ? `(-${formatCents(it.item_savings_cents)})` : ""}
                            </span>
                          ) : it.cheaper_retailer === "tie" ? (
                            <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Equal</span>
                          ) : (
                            <span style={{ color: "#b45309", fontSize: "0.75rem", fontWeight: 600 }}>Incomplete</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Summary Cards Grid */}
      <div className="results-summary-grid">
        {/* Best One-Store Trip Card */}
        <div className="summary-card">
          <div className="summary-title">Best One-Store Trip</div>
          {isOneStoreComplete ? (
            <>
              <div className="summary-stores">
                {one_store_plan.stores.map((s) => s.name).join(", ")}
              </div>
              {one_store_plan.stores.some((s) => s.city || s.zip_code) && (
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                  {one_store_plan.stores
                    .map((s) => {
                      const cityState = s.city ? (s.state ? `${s.city}, ${s.state}` : s.city) : (s.state || "");
                      return [cityState, s.zip_code].filter(Boolean).join(" ");
                    })
                    .filter(Boolean)
                    .join(" • ")}
                </div>
              )}
              <div className="summary-total">
                {formatCents(one_store_plan.total_cents)}
              </div>
              <div className="stop-note">1 single stop for everything</div>
            </>
          ) : (
            <div style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
              No single store has everything on your list.
            </div>
          )}
        </div>

        {/* Cheapest Overall Card */}
        <div
          className={`summary-card ${
            isBestPlanComplete ? "highlight" : ""
          }`}
        >
          <div className="summary-title">Cheapest Overall</div>
          {isBestPlanComplete ? (
            <>
              <div className="summary-stores">
                {best_plan.stores.map((s) => s.name).join(" + ")}
              </div>
              {best_plan.stores.some((s) => s.city || s.zip_code) && (
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                  {best_plan.stores
                    .map((s) => {
                      const cityState = s.city ? (s.state ? `${s.city}, ${s.state}` : s.city) : (s.state || "");
                      return [cityState, s.zip_code].filter(Boolean).join(" ");
                    })
                    .filter(Boolean)
                    .join(" • ")}
                </div>
              )}
              <div className="summary-total">
                {formatCents(best_plan.total_cents)}
              </div>
              {savings_cents !== null && savings_cents > 0 ? (
                <div>
                  <span className="savings-badge">
                    Save {formatCents(savings_cents)}
                  </span>
                  <div className="stop-note">
                    {additional_stops} additional stop
                  </div>
                </div>
              ) : isOneStoreComplete ? (
                <div className="stop-note">
                  One store is already your cheapest option.
                </div>
              ) : (
                <div className="stop-note">
                  Fulfills entire list across {best_plan.stores.length} stores
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
              No complete plan available.
            </div>
          )}
        </div>
      </div>

      {/* Item Breakdown by Store */}
      {isBestPlanComplete && (
        <section className="store-breakdown" aria-label="Store shopping instructions">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 16 }}>
            What to Buy Where
          </h2>

          {Object.entries(itemsByStore).map(([storeName, items]) => {
            const storeSubtotal = items.reduce(
              (acc, it) => acc + it.subtotal_cents,
              0
            );

            return (
              <div key={storeName} className="store-group-card">
                <div className="store-group-header">
                  <span>Buy at {storeName}</span>
                  <span style={{ fontWeight: 800 }}>
                    {formatCents(storeSubtotal)}
                  </span>
                </div>

                <table className="plan-items-table">
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col" style={{ textAlign: "center" }}>Qty</th>
                      <th scope="col" style={{ textAlign: "right" }}>Price</th>
                      <th scope="col" style={{ textAlign: "right" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.product_id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>{item.product_name}</span>
                          {item.is_on_sale && (
                            <span className="sale-pill" aria-label="On sale">
                              Sale
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 500 }}>
                          x{item.quantity}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span>{formatCents(item.unit_price_cents)}</span>
                          {item.is_on_sale && item.regular_price_cents > item.unit_price_cents && (
                            <span
                              className="original-price-strike"
                              aria-label={`Regular price ${formatCents(item.regular_price_cents)}`}
                            >
                              {formatCents(item.regular_price_cents)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          {formatCents(item.subtotal_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
};
