import React, { useEffect, useState, useCallback } from "react";
import { PriceObservation, Product, ProductPricesComparisonResponse } from "../types";
import { api } from "../api/client";
import { getSelectedZipCode, hasObservationToken } from "../lib/storage";

interface ProductPricesModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onRecordPriceForProduct: (product: Product, editObs?: PriceObservation) => void;
  isProductStaple?: (productId: string) => boolean;
  onToggleStaple?: (productId: string) => void;
}

export const ProductPricesModal: React.FC<ProductPricesModalProps> = ({
  isOpen,
  onClose,
  product,
  onRecordPriceForProduct,
  isProductStaple,
  onToggleStaple,
}) => {
  const [data, setData] = useState<ProductPricesComparisonResponse | null>(null);
  const [zipFilter, setZipFilter] = useState(getSelectedZipCode() || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrices = useCallback(async () => {
    if (!product) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.compareProductStorePrices(product.id, zipFilter || null);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load store prices");
    } finally {
      setIsLoading(false);
    }
  }, [product, zipFilter]);

  useEffect(() => {
    if (isOpen && product) {
      loadPrices();
    } else {
      setData(null);
    }
  }, [isOpen, product, loadPrices]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-prices-title"
        style={{ maxWidth: 640 }}
      >
        <div className="drawer-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {onToggleStaple && (
                <button
                  type="button"
                  className="touch-target star-btn"
                  onClick={() => onToggleStaple(product.id)}
                  aria-label={isProductStaple && isProductStaple(product.id) ? `Remove ${product.name} from staples` : `Add ${product.name} to staples`}
                  title={isProductStaple && isProductStaple(product.id) ? "In My Staples" : "Add to My Staples"}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.3rem",
                    cursor: "pointer",
                    padding: "0 2px",
                    lineHeight: 1,
                    color: isProductStaple && isProductStaple(product.id) ? "#f59e0b" : "#94a3b8",
                  }}
                >
                  {isProductStaple && isProductStaple(product.id) ? "★" : "☆"}
                </button>
              )}
              <h2 id="product-prices-title" style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                {product.name}
              </h2>
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              {product.brand} • {product.package_quantity} {product.package_unit}
            </div>
          </div>
          <button
            type="button"
            className="drawer-close touch-target"
            onClick={onClose}
            aria-label="Close product prices comparison"
          >
            ✕
          </button>
        </div>

        {/* Location Filter Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Filter by Area:</span>
          <input
            type="text"
            className="search-input"
            style={{ width: 110, height: 36, fontSize: "0.85rem", padding: "0 8px" }}
            placeholder="e.g. 48042"
            value={zipFilter}
            onChange={(e) => setZipFilter(e.target.value.trim())}
          />
          {zipFilter && (
            <button
              type="button"
              className="link-button"
              style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}
              onClick={() => setZipFilter("")}
            >
              Clear ZIP Filter
            </button>
          )}
        </div>

        {error && (
          <div className="alert-box alert-error" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="empty-state">
            <p>Loading observed store prices...</p>
          </div>
        ) : data && data.observations.length > 0 ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                Prices observed across <strong>{data.store_count} stores</strong> {zipFilter ? `in ZIP ${zipFilter}` : ""}
              </span>
              <button
                type="button"
                className="btn btn-secondary touch-target"
                style={{ minHeight: 44, padding: "0 14px", fontSize: "0.85rem" }}
                onClick={() => onRecordPriceForProduct(product)}
              >
                + Record Store Price
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.observations.map((obs, idx) => {
                const isCheapest = idx === 0;
                const isOwnObservation = hasObservationToken(obs.id);
                return (
                  <div
                    key={obs.id}
                    className={`store-group-card ${isCheapest ? "highlight-store-card" : ""}`}
                    style={{ padding: "12px 16px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "1.05rem" }}>{obs.store_name}</strong>
                          {isCheapest && (
                            <span className="savings-badge" style={{ padding: "2px 8px", fontSize: "0.75rem" }}>
                              Lowest Price
                            </span>
                          )}
                          {obs.is_promotional && (
                            <span className="sale-pill" style={{ fontSize: "0.75rem" }}>
                              Sale
                            </span>
                          )}
                          {isOwnObservation && (
                            <span style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "1px 6px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 600 }}>
                              Your Entry
                            </span>
                          )}
                        </div>

                        {/* Store Locality Info */}
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                          {obs.store_city || obs.store_zip_code ? (
                            <span>📍 {obs.store_city ? `${obs.store_city}, ` : ""}{obs.store_state || ""} {obs.store_zip_code || ""} • </span>
                          ) : obs.is_unresolved_location ? (
                            <span style={{ fontStyle: "italic" }}>📍 Unresolved location • </span>
                          ) : null}
                          Observed {obs.observation_date}
                          {obs.is_stale && (
                            <span className="stale-badge" style={{ marginLeft: 6 }}>
                              Stale (&gt;30d)
                            </span>
                          )}
                        </div>

                        {obs.notes && (
                          <div style={{ fontSize: "0.8rem", fontStyle: "italic", marginTop: 4, color: "var(--color-text-muted)" }}>
                            "{obs.notes}"
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-primary)" }}>
                          {obs.formatted_price}
                        </span>
                        {isOwnObservation && (
                          <button
                            type="button"
                            className="link-button touch-target"
                            style={{ fontSize: "0.85rem", color: "var(--color-primary)", padding: "4px 8px", marginTop: 4 }}
                            onClick={() => onRecordPriceForProduct(product, obs)}
                            aria-label={`Correct your price observation for ${obs.store_name}`}
                          >
                            Correct Entry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>
              {zipFilter
                ? `No user-entered prices recorded in ZIP ${zipFilter} for this product yet.`
                : "No user-entered prices recorded for this product yet."}
            </p>
            <button
              type="button"
              className="btn btn-primary touch-target"
              style={{ marginTop: 12 }}
              onClick={() => onRecordPriceForProduct(product)}
            >
              Be the first to record a price!
            </button>
          </div>
        )}

        <div className="consumer-notice-box" style={{ marginTop: 16 }}>
          <strong>Consumer Trust Notice</strong>
          <p style={{ marginTop: 4, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {data?.disclaimer ||
              "Prices are consumer-observed shelf prices for community comparison. They are not live retailer feeds or store guarantees."}
          </p>
        </div>
      </div>
    </div>
  );
};
