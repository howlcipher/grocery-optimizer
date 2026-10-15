import React, { useState, useEffect } from "react";
import { Product, StoreResponse, TripItemObservation } from "../types";
import { api } from "../api/client";
import {
  getRecentStores,
  hasObservationToken,
  saveRecentStore,
} from "../lib/storage";
import { formatCents } from "../lib/money";

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

const REGIONAL_STORES = [
  { name: "Meijer #206", retailer: "Meijer", city: "Lenox", zip: "48042", label: "Meijer (Lenox 48042)" },
  { name: "ALDI #47", retailer: "ALDI", city: "Chesterfield", zip: "48051", label: "ALDI (Chesterfield 48051)" },
  { name: "Kroger #695", retailer: "Kroger", city: "Shelby Twp", zip: "48316", label: "Kroger (Shelby 48316)" },
  { name: "Trader Joe's", retailer: "Trader Joe's", city: "Rochester Hills", zip: "48309", label: "Trader Joe's (Rochester)" },
  { name: "Whole Foods Market", retailer: "Whole Foods Market", city: "Rochester Hills", zip: "48309", label: "Whole Foods (Rochester)" },
  { name: "Costco Wholesale", retailer: "Costco", city: "Shelby Twp", zip: "48315", label: "Costco (Shelby)" },
];

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
  // Mode: "single" for one product; "trip" for multi-item grocery receipt recording
  const [entryMode, setEntryMode] = useState<"single" | "trip">("single");

  // Store metadata
  const [storeName, setStoreName] = useState(initialStoreName);
  const [retailerName, setRetailerName] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeZip, setStoreZip] = useState("");
  const [observationDate, setObservationDate] = useState(
    initialDate || new Date().toISOString().split("T")[0]
  );

  // Single item form state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct);
  const [searchQuery, setSearchQuery] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<Product[]>([]);
  const [priceInput, setPriceInput] = useState(
    initialPriceCents !== undefined ? (initialPriceCents / 100).toFixed(2) : ""
  );
  const [isPromotional, setIsPromotional] = useState(initialPromotional);
  const [notes, setNotes] = useState(initialNotes);

  // Trip multi-item state
  const [tripItems, setTripItems] = useState<
    (TripItemObservation & { product_name: string; brand: string })[]
  >([]);
  const [tripProduct, setTripProduct] = useState<Product | null>(null);
  const [tripSearchQuery, setTripSearchQuery] = useState("");
  const [tripSuggestions, setTripSuggestions] = useState<Product[]>([]);
  const [tripPriceInput, setTripPriceInput] = useState("");
  const [tripPromotional, setTripPromotional] = useState(false);
  const [tripItemNotes, setTripItemNotes] = useState("");

  const [recentStores, setRecentStores] = useState<StoreResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if current user owns the observation being edited
  const isOwner = editingObservationId ? hasObservationToken(editingObservationId) : false;

  useEffect(() => {
    if (isOpen) {
      const recents = getRecentStores();
      setRecentStores(recents);

      // Pre-fill from initial or recent store if available
      if (initialStoreName) {
        setStoreName(initialStoreName);
      } else if (recents.length > 0 && !editingObservationId) {
        const topRecent = recents[0];
        setStoreName(topRecent.name);
        setRetailerName(topRecent.retailer_name || "");
        setStoreCity(topRecent.city || "");
        setStoreZip(topRecent.zip_code || "");
      }

      setSelectedProduct(initialProduct);
      setPriceInput(initialPriceCents !== undefined ? (initialPriceCents / 100).toFixed(2) : "");
      setObservationDate(initialDate || new Date().toISOString().split("T")[0]);
      setIsPromotional(initialPromotional);
      setNotes(initialNotes);
      setEntryMode(editingObservationId ? "single" : "single");
      setTripItems([]);
      setError(null);
    }
  }, [isOpen, initialProduct, initialStoreName, initialPriceCents, initialDate, initialNotes, initialPromotional, editingObservationId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Autocomplete for single-item search
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

  // Autocomplete for trip item search
  useEffect(() => {
    if (tripProduct || !tripSearchQuery.trim()) {
      setTripSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchProducts(tripSearchQuery, 5);
        setTripSuggestions(results);
      } catch {
        setTripSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [tripSearchQuery, tripProduct]);

  if (!isOpen) return null;

  const handleSelectRecentOrRegional = (name: string, retName?: string, city?: string, zip?: string) => {
    setStoreName(name);
    if (retName) setRetailerName(retName);
    if (city) setStoreCity(city);
    if (zip) setStoreZip(zip);
  };

  const handleAddTripItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!tripProduct) {
      setError("Please search and select a product to add to this trip.");
      return;
    }

    const parsedPrice = parseFloat(tripPriceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0 || parsedPrice > 500) {
      setError("Please enter a valid price between $0.01 and $500.00.");
      return;
    }

    const priceCents = Math.round(parsedPrice * 100);

    setTripItems((prev) => [
      ...prev,
      {
        product_id: tripProduct.id,
        product_name: tripProduct.name,
        brand: tripProduct.brand,
        price_cents: priceCents,
        is_promotional: tripPromotional,
        notes: tripItemNotes.trim() || null,
      },
    ]);

    // Reset item input row for rapid subsequent additions
    setTripProduct(null);
    setTripSearchQuery("");
    setTripPriceInput("");
    setTripPromotional(false);
    setTripItemNotes("");
  };

  const handleRemoveTripItem = (index: number) => {
    setTripItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
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
          retailer_name: retailerName.trim() || null,
          city: storeCity.trim() || null,
          zip_code: storeZip.trim() || null,
          price_cents: priceCents,
          observation_date: observationDate,
          is_promotional: isPromotional,
          notes: notes.trim() || null,
        });
      }

      saveRecentStore({
        name: cleanStore,
        retailer_name: retailerName.trim() || undefined,
        city: storeCity.trim() || undefined,
        zip_code: storeZip.trim() || undefined,
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record observation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTripSubmit = async () => {
    setError(null);

    const cleanStore = storeName.trim();
    if (!cleanStore) {
      setError("Please specify the store for this shopping trip.");
      return;
    }

    if (tripItems.length === 0) {
      setError("Please add at least one item to this shopping trip.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createBatchPriceObservations({
        store_name: cleanStore,
        retailer_name: retailerName.trim() || null,
        city: storeCity.trim() || null,
        zip_code: storeZip.trim() || null,
        observation_date: observationDate,
        items: tripItems.map((item) => ({
          product_id: item.product_id,
          price_cents: item.price_cents,
          is_promotional: item.is_promotional,
          notes: item.notes,
        })),
      });

      saveRecentStore({
        name: cleanStore,
        retailer_name: retailerName.trim() || undefined,
        city: storeCity.trim() || undefined,
        zip_code: storeZip.trim() || undefined,
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record trip observations");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteObservation = async () => {
    if (!editingObservationId) return;
    if (!window.confirm("Are you sure you want to delete this recorded price?")) return;

    setIsDeleting(true);
    setError(null);
    try {
      await api.deletePriceObservation(editingObservationId);
      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete observation");
    } finally {
      setIsDeleting(false);
    }
  };

  const tripTotalCents = tripItems.reduce((acc, it) => acc + it.price_cents, 0);

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-price-title"
        style={{ maxWidth: 640 }}
      >
        <div className="drawer-header">
          <div>
            <h2 id="record-price-title" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              {editingObservationId ? "Correct Price Observation" : "Record Store Prices"}
            </h2>
            <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              {editingObservationId
                ? isOwner
                  ? "🔑 Verified Contributor — Edit capability present"
                  : "Community observation"
                : "Contribute shelf prices to help nearby shoppers save"}
            </div>
          </div>
          <button
            type="button"
            className="drawer-close touch-target"
            onClick={onClose}
            aria-label="Close record price modal"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs (only shown when creating new, not editing) */}
        {!editingObservationId && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn ${entryMode === "single" ? "btn-primary" : "btn-secondary"} touch-target`}
              style={{ flex: 1, minHeight: 44, fontSize: "0.9rem" }}
              onClick={() => setEntryMode("single")}
            >
              🏷️ Single Product
            </button>
            <button
              type="button"
              className={`btn ${entryMode === "trip" ? "btn-primary" : "btn-secondary"} touch-target`}
              style={{ flex: 1, minHeight: 44, fontSize: "0.9rem" }}
              onClick={() => setEntryMode("trip")}
            >
              🛒 Shopping Trip (Multi-Item)
            </button>
          </div>
        )}

        {error && (
          <div className="alert-box alert-error" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        {/* --- Shared Store & Locality Selection --- */}
        <section style={{ backgroundColor: "#f8fafc", padding: "12px 14px", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: 8 }}>
            STORE & LOCATION
          </div>

          {/* Quick-select chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {/* Recent stores */}
            {recentStores.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`store-chip ${storeName === s.name && storeZip === (s.zip_code || "") ? "active" : ""}`}
                onClick={() => handleSelectRecentOrRegional(s.name, s.retailer_name, s.city || undefined, s.zip_code || undefined)}
                title={`Recently used: ${s.city || ""} ${s.zip_code || ""}`}
              >
                🕒 {s.name} {s.zip_code ? `(${s.zip_code})` : ""}
              </button>
            ))}

            {/* Regional pilot stores */}
            {REGIONAL_STORES.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`store-chip ${storeName === r.name && storeZip === r.zip ? "active" : ""}`}
                onClick={() => handleSelectRecentOrRegional(r.name, r.retailer, r.city, r.zip)}
              >
                📍 {r.label}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <div>
              <label className="form-label" htmlFor="obs-store-name" style={{ fontSize: "0.8rem" }}>
                Store Name
              </label>
              <input
                id="obs-store-name"
                type="text"
                className="search-input"
                style={{ width: "100%", height: 38 }}
                placeholder="e.g. Meijer #206"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="obs-city" style={{ fontSize: "0.8rem" }}>
                City (Optional)
              </label>
              <input
                id="obs-city"
                type="text"
                className="search-input"
                style={{ width: "100%", height: 38 }}
                placeholder="Lenox"
                value={storeCity}
                onChange={(e) => setStoreCity(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="obs-zip" style={{ fontSize: "0.8rem" }}>
                ZIP Code
              </label>
              <input
                id="obs-zip"
                type="text"
                className="search-input"
                style={{ width: "100%", height: 38 }}
                placeholder="48042"
                value={storeZip}
                onChange={(e) => setStoreZip(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <label className="form-label" htmlFor="obs-date" style={{ fontSize: "0.8rem" }}>
              Observation Date
            </label>
            <input
              id="obs-date"
              type="date"
              max={new Date().toISOString().split("T")[0]}
              className="search-input"
              style={{ width: "100%", height: 38 }}
              value={observationDate}
              onChange={(e) => setObservationDate(e.target.value)}
              required
            />
          </div>
        </section>

        {/* --- Single Product Mode Form --- */}
        {entryMode === "single" && (
          <form noValidate onSubmit={handleSingleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                    placeholder="Search canonical catalog (e.g. Milk, Eggs, Cheerios)..."
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

            {/* Price Input */}
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

            {/* Promotional Flag */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                id="obs-promo"
                type="checkbox"
                checked={isPromotional}
                onChange={(e) => setIsPromotional(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: "var(--color-primary)" }}
              />
              <label htmlFor="obs-promo" style={{ fontWeight: 500, cursor: "pointer", fontSize: "0.9rem" }}>
                This was a temporary sale or promotional price
              </label>
            </div>

            {/* Notes */}
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
                placeholder="e.g. Dairy clearance, club discount tag"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Capability Trust Notice */}
            <div className="consumer-notice-box">
              <strong>Capability-Based Trust & Privacy</strong>
              <p style={{ marginTop: 4, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Prices you submit are shared with the community. Your private edit token is saved in this browser so only you can correct or delete your entries.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              {editingObservationId && isOwner ? (
                <button
                  type="button"
                  className="btn btn-secondary touch-target"
                  style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                  onClick={handleDeleteObservation}
                  disabled={isDeleting || isSubmitting}
                >
                  {isDeleting ? "Deleting..." : "🗑️ Delete Observation"}
                </button>
              ) : <div />}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary touch-target"
                  onClick={onClose}
                  disabled={isSubmitting || isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary touch-target"
                  disabled={isSubmitting || isDeleting}
                >
                  {isSubmitting ? "Saving..." : editingObservationId ? "Update Price" : "Save Price Observation"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* --- Shopping Trip Multi-Item Mode --- */}
        {entryMode === "trip" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Rapid Add Row */}
            <div style={{ backgroundColor: "#eff6ff", padding: "12px", borderRadius: 8, border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e40af", marginBottom: 6 }}>
                ADD TRIP ITEM
              </div>

              {tripProduct ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, background: "#fff", padding: "6px 10px", borderRadius: 6 }}>
                  <div>
                    <strong>{tripProduct.name}</strong> <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>({tripProduct.brand})</span>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}
                    onClick={() => setTripProduct(null)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: 8 }}>
                  <input
                    type="text"
                    className="search-input"
                    style={{ width: "100%", height: 38 }}
                    placeholder="Search product from receipt (e.g. Milk, Eggs, Bread)..."
                    value={tripSearchQuery}
                    onChange={(e) => setTripSearchQuery(e.target.value)}
                  />
                  {tripSuggestions.length > 0 && (
                    <ul className="suggestions-dropdown" style={{ position: "static", marginTop: 4 }}>
                      {tripSuggestions.map((p) => (
                        <li
                          key={p.id}
                          className="suggestion-item"
                          onClick={() => {
                            setTripProduct(p);
                            setTripSuggestions([]);
                          }}
                        >
                          <strong>{p.name}</strong> ({p.brand})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="500.00"
                  className="search-input"
                  style={{ width: 110, height: 38 }}
                  placeholder="Price ($)"
                  value={tripPriceInput}
                  onChange={(e) => setTripPriceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTripItem();
                    }
                  }}
                />

                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={tripPromotional}
                    onChange={(e) => setTripPromotional(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  Sale
                </label>

                <button
                  type="button"
                  className="btn btn-primary touch-target"
                  style={{ minHeight: 38, padding: "0 14px", fontSize: "0.85rem", marginLeft: "auto" }}
                  onClick={() => handleAddTripItem()}
                >
                  + Add Item
                </button>
              </div>
            </div>

            {/* Trip Items List */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                  Items in this Shopping Trip ({tripItems.length})
                </span>
                {tripItems.length > 0 && (
                  <span style={{ fontWeight: 800, color: "var(--color-primary)" }}>
                    Trip Subtotal: {formatCents(tripTotalCents)}
                  </span>
                )}
              </div>

              {tripItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "var(--color-text-muted)", fontSize: "0.9rem", border: "1px dashed #cbd5e1", borderRadius: 8 }}>
                  No items added yet. Search a product and enter its price above to build your trip observations.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
                  {tripItems.map((item, idx) => (
                    <div
                      key={`${item.product_id}-${idx}`}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 6 }}
                    >
                      <div>
                        <strong>{item.product_name}</strong>
                        <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginLeft: 6 }}>
                          ({item.brand})
                        </span>
                        {item.is_promotional && (
                          <span className="sale-pill" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                            Sale
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700 }}>{formatCents(item.price_cents)}</span>
                        <button
                          type="button"
                          className="link-button touch-target"
                          style={{ color: "#ef4444", fontSize: "0.85rem", padding: "2px 6px" }}
                          onClick={() => handleRemoveTripItem(idx)}
                          aria-label={`Remove ${item.product_name} from trip`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Submit */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary touch-target"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary touch-target"
                onClick={handleTripSubmit}
                disabled={isSubmitting || tripItems.length === 0}
              >
                {isSubmitting
                  ? "Recording Trip..."
                  : `Record Entire Trip (${tripItems.length} ${tripItems.length === 1 ? "Item" : "Items"})`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
