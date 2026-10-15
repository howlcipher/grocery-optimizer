import React from "react";
import { ComparisonResponse, PlanItemResponse } from "../types";
import { formatCents } from "../lib/money";

interface ComparisonResultsProps {
  comparison: ComparisonResponse;
  onBackToList: () => void;
}

export const ComparisonResults: React.FC<ComparisonResultsProps> = ({
  comparison,
  onBackToList,
}) => {
  const { one_store_plan, best_plan, savings_cents, additional_stops } = comparison;

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
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-secondary touch-target"
          onClick={onBackToList}
          aria-label="Back to editing grocery list"
        >
          ← Edit List
        </button>
      </div>

      {/* Unfulfillable Basket Warning */}
      {!isBestPlanComplete && (
        <div className="alert-box alert-error" role="alert">
          <h3 style={{ fontWeight: 700, marginBottom: 6 }}>No Complete Shopping Plan Found</h3>
          <p>
            We couldn't find a complete plan. These items aren't available at any combination of up to two stores:
          </p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            {best_plan.missing_products.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> ({p.brand})
              </li>
            ))}
          </ul>
        </div>
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
