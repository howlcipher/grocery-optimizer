import React, { useState, useEffect } from "react";
import { Product, StoreResponse, TripItemObservation } from "../types";
import { api } from "../api/client";
import {
  getRecentStores,
  hasObservationToken,
  saveRecentStore,
} from "../lib/storage";
import { formatCents } from "../lib/money";
import { recognizeReceiptText } from "../lib/ocrService";
import { parseReceiptText } from "../lib/receiptParser";

export interface EnhancedTripItem extends TripItemObservation {
  product_name: string;
  brand: string;
  confidence?: "high" | "medium" | "unmatched";
  rawText?: string;
  candidateProducts?: Product[];
  isEditingProduct?: boolean;
}

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
  const [tripItems, setTripItems] = useState<EnhancedTripItem[]>([]);
  const [tripProduct, setTripProduct] = useState<Product | null>(null);
  const [tripSearchQuery, setTripSearchQuery] = useState("");
  const [tripSuggestions, setTripSuggestions] = useState<Product[]>([]);
  const [tripPriceInput, setTripPriceInput] = useState("");
  const [tripPromotional, setTripPromotional] = useState(false);
  const [tripItemNotes, setTripItemNotes] = useState("");

  // Receipt OCR Assistant State
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [scanSummary, setScanSummary] = useState<string | null>(null);

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
      setScanSummary(null);
      setIsScanningReceipt(false);
      api.getProducts(100).then(setCatalogProducts).catch(() => {});
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
        confidence: "high",
      },
    ]);

    // Reset item input row for rapid subsequent additions
    setTripProduct(null);
    setTripSearchQuery("");
    setTripPriceInput("");
    setTripPromotional(false);
    setTripItemNotes("");
  };

  const handleReceiptFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";
    setIsScanningReceipt(true);
    setOcrStatus("Preprocessing receipt photo...");
    setOcrProgress(0.1);
    setError(null);
    setScanSummary(null);

    try {
      let products = catalogProducts;
      if (products.length === 0) {
        products = await api.getProducts(100);
        setCatalogProducts(products);
      }

      const ocrText = await recognizeReceiptText(file, (p) => {
        setOcrStatus(p.status);
        setOcrProgress(p.progress);
      });

      const parsed = parseReceiptText(ocrText, products);

      if (parsed.storeName && !storeName) {
        setStoreName(parsed.storeName);
        setRetailerName(parsed.storeName);
      }
      if (parsed.zipCode && !storeZip) {
        setStoreZip(parsed.zipCode);
      }
      if (parsed.address && !storeCity) {
        setStoreCity(parsed.address);
      }
      if (parsed.date) {
        setObservationDate(parsed.date);
      }

      if (parsed.items.length === 0) {
        setError("No grocery items or prices could be recognized on this receipt. You can add items manually below.");
      } else {
        const newTripItems: EnhancedTripItem[] = parsed.items.map((item) => {
          const matchedProd = products.find((p) => p.id === item.matchedProductId);
          return {
            product_id: item.matchedProductId || "",
            product_name: matchedProd ? matchedProd.name : item.rawText,
            brand: matchedProd ? matchedProd.brand : "Review Needed",
            price_cents: item.priceCents,
            is_promotional: item.isPromotional || false,
            notes: null,
            confidence: item.matchConfidence,
            rawText: item.rawText,
            candidateProducts: item.candidateProducts || [],
          };
        });

        setTripItems((prev) => [...prev, ...newTripItems]);
        setScanSummary(
          `Extracted ${parsed.items.length} items from receipt. (${parsed.ignoredLines.length} deposit/tax/noise lines excluded). Review your items below before saving.`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to scan receipt");
    } finally {
      setIsScanningReceipt(false);
      setOcrStatus("");
      setOcrProgress(0);
    }
  };

  const handleUpdateTripItemProduct = (index: number, newProd: Product) => {
    setTripItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              product_id: newProd.id,
              product_name: newProd.name,
              brand: newProd.brand,
              confidence: "high",
              isEditingProduct: false,
            }
          : item
      )
    );
  };

  const handleUpdateTripItemPrice = (index: number, newPriceInput: string) => {
    const val = parseFloat(newPriceInput);
    if (!isNaN(val) && val >= 0) {
      setTripItems((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, price_cents: Math.round(val * 100) } : item
        )
      );
    }
  };

  const handleToggleTripItemPromo = (index: number) => {
    setTripItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, is_promotional: !item.is_promotional } : item
      )
    );
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

    // Upfront validation: all items must have a valid selected canonical product
    const unmatchedIndex = tripItems.findIndex((it) => !it.product_id);
    if (unmatchedIndex !== -1) {
      setError(
        `Item "${tripItems[unmatchedIndex].rawText || tripItems[unmatchedIndex].product_name}" is unmatched. Please select a matching product from the catalog or remove it before saving.`
      );
      return;
    }

    // Upfront validation: price bounds
    const invalidPriceItem = tripItems.find(
      (it) => isNaN(it.price_cents) || it.price_cents <= 0 || it.price_cents > 50000
    );
    if (invalidPriceItem) {
      setError(`Item "${invalidPriceItem.product_name}" has an invalid price. Price must be between $0.01 and $500.00.`);
      return;
    }

    // Check for duplicate products in trip
    const productIds = tripItems.map((it) => it.product_id);
    if (new Set(productIds).size !== productIds.length) {
      setError("This shopping trip contains duplicate items for the same product. Please remove or combine duplicates before saving.");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (observationDate > todayStr) {
      setError("Observation date cannot be in the future.");
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
            {/* Private Receipt Scanner Card */}
            <div className="receipt-scan-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#065f46" }}>
                      📷 Private Receipt Assistant
                    </span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: 4 }}>
                      Zero Cloud Uploads
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    Photograph or upload a receipt. Items and prices are recognized locally in your browser.
                  </p>
                </div>

                <label
                  className="btn btn-primary touch-target"
                  style={{ minHeight: 36, padding: "0 14px", fontSize: "0.85rem", cursor: isScanningReceipt ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <span>{isScanningReceipt ? "Scanning..." : "📷 Scan Receipt Photo"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    disabled={isScanningReceipt}
                    onChange={handleReceiptFileSelected}
                  />
                </label>
              </div>

              {isScanningReceipt && (
                <div style={{ marginTop: 10, background: "#ffffff", padding: "10px 12px", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600, color: "#1e40af", marginBottom: 4 }}>
                    <span>{ocrStatus}</span>
                    <span>{Math.round(ocrProgress * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(ocrProgress * 100)}%`,
                        backgroundColor: "var(--color-primary)",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {scanSummary && !isScanningReceipt && (
                <div style={{ marginTop: 10, fontSize: "0.8rem", background: "#f0fdf4", color: "#15803d", padding: "8px 10px", borderRadius: 6, border: "1px solid #bbf7d0" }}>
                  ✓ {scanSummary}
                </div>
              )}
            </div>

            {/* Manual Rapid Add Row */}
            <div style={{ backgroundColor: "#eff6ff", padding: "12px", borderRadius: 8, border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e40af", marginBottom: 6 }}>
                ADD ITEM MANUALLY
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

            {/* Trip Items Review Staging List */}
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
                  No items added yet. Scan a receipt photo above or search products to build your trip observations.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                  {tripItems.map((item, idx) => (
                    <div
                      key={`${item.product_id || item.rawText}-${idx}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        padding: "10px 12px",
                        background: item.confidence === "unmatched" ? "#fef2f2" : "#f8fafc",
                        border: item.confidence === "unmatched" ? "1px solid #fecaca" : "1px solid #e2e8f0",
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {item.confidence === "high" && (
                            <span className="confidence-pill confidence-high">✓ Matched</span>
                          )}
                          {item.confidence === "medium" && (
                            <span className="confidence-pill confidence-medium">⚠️ Review Match</span>
                          )}
                          {item.confidence === "unmatched" && (
                            <span className="confidence-pill confidence-unmatched">❓ Unmatched</span>
                          )}

                          <strong>{item.product_name}</strong>
                          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                            ({item.brand})
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            type="button"
                            className="link-button"
                            style={{ fontSize: "0.8rem", color: "var(--color-primary)" }}
                            onClick={() => {
                              setTripItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, isEditingProduct: !it.isEditingProduct } : it
                                )
                              );
                            }}
                          >
                            {item.isEditingProduct ? "Done" : item.product_id ? "Change" : "Select Product"}
                          </button>

                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={item.is_promotional || false}
                              onChange={() => handleToggleTripItemPromo(idx)}
                              style={{ width: 16, height: 16 }}
                            />
                            Sale
                          </label>

                          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <span style={{ fontSize: "0.85rem" }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max="500.00"
                              className="search-input"
                              style={{ width: 75, height: 30, fontSize: "0.85rem", padding: "0 6px" }}
                              value={(item.price_cents / 100).toFixed(2)}
                              onChange={(e) => handleUpdateTripItemPrice(idx, e.target.value)}
                            />
                          </div>

                          <button
                            type="button"
                            className="link-button touch-target"
                            style={{ color: "#ef4444", fontSize: "0.9rem", padding: "2px 6px" }}
                            onClick={() => handleRemoveTripItem(idx)}
                            aria-label={`Remove ${item.product_name} from trip`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {item.rawText && (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          Receipt line: <em>"{item.rawText}"</em>
                        </div>
                      )}

                      {/* Inline Product Selector when editing or unmatched */}
                      {(item.isEditingProduct || item.confidence === "unmatched") && (
                        <div style={{ marginTop: 4, background: "#ffffff", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4 }}>
                            Select canonical product from catalog:
                          </div>
                          <select
                            className="search-input"
                            style={{ width: "100%", height: 32, fontSize: "0.85rem" }}
                            value={item.product_id || ""}
                            onChange={(e) => {
                              const chosen = catalogProducts.find((p) => p.id === e.target.value);
                              if (chosen) handleUpdateTripItemProduct(idx, chosen);
                            }}
                          >
                            <option value="" disabled>-- Choose matching product --</option>
                            {(item.candidateProducts && item.candidateProducts.length > 0
                              ? item.candidateProducts
                              : catalogProducts
                            ).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.brand} • {p.package_quantity} {p.package_unit})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
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
