import React, { useEffect, useState, useCallback } from "react";
import { PriceObservation, Product, ProductPricesComparisonResponse } from "../types";
import { api } from "../api/client";

interface ProductPricesModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onRecordPriceForProduct: (product: Product, editObs?: PriceObservation) => void;
}

export const ProductPricesModal: React.FC<ProductPricesModalProps> = ({
  isOpen,
  onClose,
  product,
  onRecordPriceForProduct,
}) => {
  const [data, setData] = useState<ProductPricesComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPrices = useCallback(async () => {
    if (!product) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.compareProductStorePrices(product.id);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load store prices");
    } finally {
      setIsLoading(false);
    }
  }, [product]);

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
      >
        <div className="drawer-header">
          <div>
            <h2 id="product-prices-title" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              {product.name}
            </h2>
            <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
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
                Prices observed across <strong>{data.store_count} stores</strong>
              </span>
              <button
                type="button"
                className="btn btn-secondary touch-target"
                style={{ height: 36, padding: "0 12px", fontSize: "0.85rem" }}
                onClick={() => onRecordPriceForProduct(product)}
              >
                + Record Store Price
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.observations.map((obs, idx) => {
                const isCheapest = idx === 0;
                return (
                  <div
                    key={obs.id}
                    className={`store-group-card ${isCheapest ? "highlight-store-card" : ""}`}
                    style={{ padding: "12px 16px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 4 }}>
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
                        <button
                          type="button"
                          className="link-button touch-target"
                          style={{ height: 28, fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 4 }}
                          onClick={() => onRecordPriceForProduct(product, obs)}
                        >
                          Correct Entry
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>No user-entered prices recorded for this product yet.</p>
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
