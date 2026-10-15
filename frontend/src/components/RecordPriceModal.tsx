import React, { useState, useEffect } from "react";
import { Product } from "../types";
import { api } from "../api/client";

interface RecordPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProduct?: Product | null;
  initialStoreName?: string;
  initialPriceCents?: number;
  initialDate?: string;
  initialNotes?: string;
  initialPromotional?: boolean;
  editingObservationId?: string | null;
  onSaved?: () => void;
}

const COMMON_STORES = ["Meijer", "Kroger", "ALDI", "Trader Joe's", "Whole Foods Market", "Costco"];

export const RecordPriceModal: React.FC<RecordPriceModalProps> = ({
  isOpen,
  onClose,
  initialProduct = null,
  initialStoreName = "",
  initialPriceCents = undefined,
  initialDate = "",
  initialNotes = "",
  initialPromotional = false,
  editingObservationId = null,
  onSaved,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct);
  const [searchQuery, setSearchQuery] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<Product[]>([]);
  const [storeName, setStoreName] = useState(initialStoreName);
  const [priceInput, setPriceInput] = useState(
    initialPriceCents !== undefined ? (initialPriceCents / 100).toFixed(2) : ""
  );
  const [observationDate, setObservationDate] = useState(
    initialDate || new Date().toISOString().split("T")[0]
  );
  const [isPromotional, setIsPromotional] = useState(initialPromotional);
  const [notes, setNotes] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedProduct(initialProduct);
      setStoreName(initialStoreName);
      setPriceInput(initialPriceCents !== undefined ? (initialPriceCents / 100).toFixed(2) : "");
      setObservationDate(initialDate || new Date().toISOString().split("T")[0]);
      setIsPromotional(initialPromotional);
      setNotes(initialNotes);
      setError(null);
    }
  }, [isOpen, initialProduct, initialStoreName, initialPriceCents, initialDate, initialNotes, initialPromotional]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (selectedProduct || !searchQuery.trim()) {
      setProductSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchProducts(searchQuery, 5);
        setProductSuggestions(results);
      } catch {
        setProductSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedProduct]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedProduct) {
      setError("Please select a product from the catalog.");
      return;
    }

    const cleanStore = storeName.trim();
    if (!cleanStore) {
      setError("Please enter or select a store name.");
      return;
    }

    const parsedPrice = parseFloat(priceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 500) {
      setError("Please enter a valid price between $0.01 and $500.00.");
      return;
    }

    const priceCents = Math.round(parsedPrice * 100);

    const todayStr = new Date().toISOString().split("T")[0];
    if (observationDate > todayStr) {
      setError("Observation date cannot be in the future.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingObservationId) {
        await api.updatePriceObservation(editingObservationId, {
          store_name: cleanStore,
          price_cents: priceCents,
          observation_date: observationDate,
          is_promotional: isPromotional,
          notes: notes.trim() || null,
        });
      } else {
        await api.createPriceObservation({
          product_id: selectedProduct.id,
          store_name: cleanStore,
          price_cents: priceCents,
          observation_date: observationDate,
          is_promotional: isPromotional,
          notes: notes.trim() || null,
        });
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record observation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-price-title"
      >
        <div className="drawer-header">
          <h2 id="record-price-title" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            {editingObservationId ? "Correct Price Observation" : "Record Store Shelf Price"}
          </h2>
          <button
            type="button"
            className="drawer-close touch-target"
            onClick={onClose}
            aria-label="Close record price modal"
          >
            ✕
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div className="alert-box alert-error" role="alert">
              {error}
            </div>
          )}

          {/* Product Selection */}
          <div>
            <label className="form-label" htmlFor="obs-product-search">
              Product
            </label>
            {selectedProduct ? (
              <div className="selected-product-card">
                <div>
                  <strong>{selectedProduct.name}</strong>
                  <div style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
                    {selectedProduct.brand} • {selectedProduct.package_quantity} {selectedProduct.package_unit}
                  </div>
                </div>
                {!initialProduct && (
                  <button
                    type="button"
                    className="btn btn-secondary touch-target"
                    style={{ height: 36, padding: "0 10px", fontSize: "0.85rem" }}
                    onClick={() => {
                      setSelectedProduct(null);
                      setSearchQuery("");
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div>
                <input
                  id="obs-product-search"
                  type="text"
                  className="search-input"
                  style={{ width: "100%" }}
                  placeholder="Type product name (e.g., Milk, Eggs, Cheerios)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                />
                {productSuggestions.length > 0 && (
                  <ul className="suggestions-dropdown" style={{ position: "static", marginTop: 4 }}>
                    {productSuggestions.map((p) => (
                      <li
                        key={p.id}
                        className="suggestion-item"
                        onClick={() => {
                          setSelectedProduct(p);
                          setProductSuggestions([]);
                        }}
                      >
                        <strong>{p.name}</strong> ({p.brand})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Store Selection */}
          <div>
            <label className="form-label" htmlFor="obs-store-name">
              Store
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {COMMON_STORES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`store-chip ${storeName === name ? "active" : ""}`}
                  onClick={() => setStoreName(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <input
              id="obs-store-name"
              type="text"
              className="search-input"
              style={{ width: "100%" }}
              placeholder="Or enter store name (e.g. ALDI - Rochester Hills)..."
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
            />
          </div>

          {/* Price & Date Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="form-label" htmlFor="obs-price">
                Observed Price ($)
              </label>
              <input
                id="obs-price"
                type="number"
                step="0.01"
                min="0.01"
                max="500.00"
                className="search-input"
                style={{ width: "100%" }}
                placeholder="3.49"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="obs-date">
                Observation Date
              </label>
              <input
                id="obs-date"
                type="date"
                max={new Date().toISOString().split("T")[0]}
                className="search-input"
                style={{ width: "100%" }}
                value={observationDate}
                onChange={(e) => setObservationDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Promotional Flag */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="obs-promo"
              type="checkbox"
              checked={isPromotional}
              onChange={(e) => setIsPromotional(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: "var(--color-primary)" }}
            />
            <label htmlFor="obs-promo" style={{ fontWeight: 500, cursor: "pointer" }}>
              This was a temporary sale or promotional price
            </label>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="form-label" htmlFor="obs-notes">
              Shelf Note (Optional)
            </label>
            <input
              id="obs-notes"
              type="text"
              maxLength={255}
              className="search-input"
              style={{ width: "100%" }}
              placeholder="e.g., Dairy shelf tag, yellow clearance sticker"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Consumer Trust Notice */}
          <div className="consumer-notice-box">
            <strong>Price Attribution & Consumer Disclaimer</strong>
            <p style={{ marginTop: 4, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              Prices are user-recorded shelf observations for shopping comparison. They are not authorized live retailer feeds or retailer price guarantees.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-secondary touch-target"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary touch-target"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : editingObservationId ? "Update Price" : "Save Price Observation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
