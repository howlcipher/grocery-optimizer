import React, { useEffect, useState } from "react";
import { Product, StapleItem, PriceObservation } from "../types";
import { computeProductPriceTrend } from "../lib/priceTrends";
import { api } from "../api/client";

interface StaplesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  staples: StapleItem[];
  catalogProducts: Product[];
  onToggleStaple: (productId: string) => void;
  onUpdateStapleQuantity: (productId: string, quantity: number) => void;
  onAddStapleToList: (productId: string, quantity: number) => void;
  onAddAllStaplesToList: () => void;
  referenceStoreName?: string | null;
}

export const StaplesDrawer: React.FC<StaplesDrawerProps> = ({
  isOpen,
  onClose,
  staples,
  catalogProducts,
  onToggleStaple,
  onUpdateStapleQuantity,
  onAddStapleToList,
  onAddAllStaplesToList,
  referenceStoreName,
}) => {
  const [observations, setObservations] = useState<PriceObservation[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Load recent observations to power price trends
  useEffect(() => {
    if (isOpen) {
      api.getPriceObservations(undefined, undefined, undefined, 100)
        .then(setObservations)
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const productMap = new Map<string, Product>();
  for (const p of catalogProducts || []) {
    productMap.set(p.id, p);
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="staples-drawer-title"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: 12,
          }}
        >
          <div>
            <h2 id="staples-drawer-title" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              ⭐ My Staples ({staples.length})
            </h2>
            <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              Your regular groceries, preferred quantities, and local store price trends
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onClose}
            aria-label="Close staples drawer"
            style={{ minWidth: 44, height: 44, padding: "0 12px" }}
          >
            ✕
          </button>
        </div>

        {staples.length > 0 && (
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary touch-target"
              onClick={() => {
                onAddAllStaplesToList();
                onClose();
              }}
              style={{ width: "100%", padding: "12px", fontSize: "1rem", fontWeight: 700 }}
              aria-label="Add all staples to active list"
            >
              ⭐ Add All Staples to List ({staples.length} items)
            </button>
          </div>
        )}

        {staples.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⭐</div>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: 8 }}>
              No staples saved yet
            </h3>
            <p style={{ fontSize: "0.9rem", color: "var(--color-text-muted)", maxWidth: 420, margin: "0 auto" }}>
              Star items from your grocery list, search results, or past receipts to save your frequent groceries here.
              Next time, you can build your weekly grocery list in one tap!
            </p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0 }}>
            {staples.map((staple) => {
              const product = productMap.get(staple.product_id);
              const trend = computeProductPriceTrend(staple.product_id, observations, referenceStoreName);

              return (
                <li
                  key={staple.product_id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "#ffffff",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                        {product ? product.name : staple.product_id}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                        {product ? `${product.brand} • ${product.package_quantity} ${product.package_unit}` : "Catalog Product"}
                      </div>

                      {/* Price Trend Badge */}
                      <div style={{ marginTop: 6 }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 4,
                            backgroundColor:
                              trend.trend_direction === "down"
                                ? "#dcfce7"
                                : trend.trend_direction === "up"
                                ? "#fee2e2"
                                : "#f1f5f9",
                            color:
                              trend.trend_direction === "down"
                                ? "#166534"
                                : trend.trend_direction === "up"
                                ? "#991b1b"
                                : "#475569",
                          }}
                        >
                          {trend.summary}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="remove-btn touch-target"
                      onClick={() => onToggleStaple(staple.product_id)}
                      aria-label={`Remove ${product ? product.name : "item"} from staples`}
                      title="Remove from staples"
                      style={{ fontSize: "1.1rem" }}
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Quantity & Action Controls */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: "1px solid #f1f5f9",
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                        Preferred Qty:
                      </span>
                      <button
                        type="button"
                        className="qty-btn touch-target"
                        onClick={() => onUpdateStapleQuantity(staple.product_id, staple.preferred_quantity - 1)}
                        disabled={staple.preferred_quantity <= 1}
                        aria-label="Decrease preferred quantity"
                      >
                        −
                      </button>
                      <span className="qty-display" style={{ minWidth: 28 }}>
                        {staple.preferred_quantity}
                      </span>
                      <button
                        type="button"
                        className="qty-btn touch-target"
                        onClick={() => onUpdateStapleQuantity(staple.product_id, staple.preferred_quantity + 1)}
                        disabled={staple.preferred_quantity >= 99}
                        aria-label="Increase preferred quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary touch-target"
                      style={{ height: 36, padding: "0 12px", fontSize: "0.85rem" }}
                      onClick={() => onAddStapleToList(staple.product_id, staple.preferred_quantity)}
                      aria-label={`Add ${product ? product.name : "item"} to list`}
                    >
                      + Add to List
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
