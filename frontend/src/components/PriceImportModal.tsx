import React, { useState, useEffect } from "react";
import { api } from "../api/client";
import { ParsedPriceCandidate, Product, StoreResponse } from "../types";
import { formatCents } from "../lib/money";
import { CreateProductModal } from "./CreateProductModal";

interface PriceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onObservationsSaved?: () => void;
}

export const PriceImportModal: React.FC<PriceImportModalProps> = ({
  isOpen,
  onClose,
  onObservationsSaved,
}) => {
  const [retailer, setRetailer] = useState<"Kroger" | "Meijer">("Kroger");
  const [stores, setStores] = useState<StoreResponse[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [customStoreName, setCustomStoreName] = useState<string>("");
  const [observationDate, setObservationDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [rawText, setRawText] = useState<string>("");

  // Parsing & candidates state
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [candidates, setCandidates] = useState<ParsedPriceCandidate[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Custom product modal integration
  const [isCreateProductOpen, setIsCreateProductOpen] = useState<boolean>(false);
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Load stores and catalog products
    api.getStores().then((allStores) => {
      setStores(allStores);
      const matching = allStores.find((s) =>
        s.name.toLowerCase().includes(retailer.toLowerCase()) ||
        s.retailer_name.toLowerCase().includes(retailer.toLowerCase())
      );
      if (matching) setSelectedStoreId(matching.id);
    });
    api.getProducts(200).then(setCatalog).catch(() => {});
  }, [isOpen, retailer]);

  if (!isOpen) return null;

  const handleParse = async () => {
    if (!rawText.trim()) {
      setError("Please paste price text or cart data to import.");
      return;
    }

    setIsParsing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await api.parsePriceImport(rawText, retailer);
      setCandidates(res.candidates);
      // Select all candidates by default
      const allIdx = new Set(res.candidates.map((_, i) => i));
      setSelectedIndices(allIdx);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse text.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleToggleSelect = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIndices(new Set(candidates.map((_, i) => i)));
    } else {
      setSelectedIndices(new Set());
    }
  };

  const handleCandidateProductChange = (index: number, productId: string) => {
    const matched = catalog.find((p) => p.id === productId);
    setCandidates((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              matched_product_id: productId || null,
              matched_product_name: matched?.name || null,
              match_confidence: productId ? "high" : "unmatched",
            }
          : c
      )
    );
  };

  const handleProductCreated = (newProd: Product) => {
    setCatalog((prev) => [...prev, newProd]);
    if (activeCandidateIndex !== null) {
      handleCandidateProductChange(activeCandidateIndex, newProd.id);
      setActiveCandidateIndex(null);
    }
  };

  const handleSaveObservations = async () => {
    const storeObj = stores.find((s) => s.id === selectedStoreId);
    const storeName = storeObj ? storeObj.name : (customStoreName.trim() || `${retailer} Store`);

    const selectedCandidates = candidates.filter((_, i) => selectedIndices.has(i));
    const validItems = selectedCandidates.filter((c) => c.matched_product_id);

    if (validItems.length === 0) {
      setError("No matched products selected to save. Please match at least one candidate.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.createBatchPriceObservations({
        store_id: storeObj?.id || null,
        store_name: storeName,
        retailer_name: retailer,
        address: storeObj?.address || null,
        city: storeObj?.city || null,
        state: storeObj?.state || null,
        zip_code: storeObj?.zip_code || null,
        observation_date: observationDate,
        items: validItems.map((c) => ({
          product_id: c.matched_product_id!,
          product_name: c.matched_product_name || c.extracted_name,
          price_cents: c.price_cents,
          is_promotional: c.is_promotional,
          notes: c.promo_details || `Imported from ${retailer} text`,
        })),
      });

      setSuccessMessage(`Successfully saved ${validItems.length} price observations for ${storeName}!`);
      setCandidates([]);
      setRawText("");
      if (onObservationsSaved) {
        onObservationsSaved();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save observations.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="price-import-title">
        <div className="modal-content" style={{ maxWidth: 840, maxHeight: "90vh", overflowY: "auto" }}>
          <div className="modal-header">
            <div>
              <h2 id="price-import-title" style={{ fontSize: "1.35rem", fontWeight: 700 }}>
                Price Import Assistant
              </h2>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                Easily import prices from weekly ads, screenshots, cart exports, or pasted text.
              </p>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close modal">
              ✕
            </button>
          </div>

          {error && (
            <div className="alert-box alert-error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div className="alert-box alert-success" style={{ marginBottom: 12 }}>
              {successMessage}
            </div>
          )}

          {/* Store & Date Configuration */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>
                Target Retailer
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={`btn ${retailer === "Kroger" ? "btn-primary" : "btn-secondary"}`}
                  style={{ flex: 1, padding: "6px 10px" }}
                  onClick={() => setRetailer("Kroger")}
                >
                  Kroger
                </button>
                <button
                  type="button"
                  className={`btn ${retailer === "Meijer" ? "btn-primary" : "btn-secondary"}`}
                  style={{ flex: 1, padding: "6px 10px" }}
                  onClick={() => setRetailer("Meijer")}
                >
                  Meijer
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="store-select" style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>
                Physical Store Location
              </label>
              <select
                id="store-select"
                className="search-input"
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
              >
                {stores
                  .filter((s) => s.name.toLowerCase().includes(retailer.toLowerCase()) || s.retailer_name.toLowerCase().includes(retailer.toLowerCase()))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city || s.zip_code || "Locality"})
                    </option>
                  ))}
                <option value="">Other / Custom Store Name...</option>
              </select>
              {!selectedStoreId && (
                <input
                  type="text"
                  className="search-input"
                  style={{ marginTop: 6 }}
                  placeholder="e.g. Kroger #456 - New Baltimore"
                  value={customStoreName}
                  onChange={(e) => setCustomStoreName(e.target.value)}
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="obs-date" style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>
                Observation Date
              </label>
              <input
                id="obs-date"
                type="date"
                className="search-input"
                value={observationDate}
                onChange={(e) => setObservationDate(e.target.value)}
              />
            </div>
          </div>

          {/* Paste Section (if no candidates parsed yet) */}
          {candidates.length === 0 ? (
            <div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label htmlFor="raw-price-text" style={{ display: "block", fontWeight: 600, fontSize: "0.9rem", marginBottom: 4 }}>
                  Paste Product & Price Text (or CSV lines)
                </label>
                <textarea
                  id="raw-price-text"
                  rows={8}
                  className="search-input"
                  style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem", padding: 8 }}
                  placeholder={`Example lines:\nWhole Milk 1 Gallon $2.89\nLarge White Eggs 12 ct Was $2.49 Now $1.79\nHoneycrisp Apples 3 lb $4.99\nBoneless Skinless Chicken Breast 2 lb $7.98`}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  Supports regular prices, was/now sales ("Was $2.99 Now $1.99"), multi-buys ("2 for $5"), and CSV formats. All processed 100% locally on your device.
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleParse}
                  disabled={isParsing || !rawText.trim()}
                >
                  {isParsing ? "Extracting Prices..." : "Extract & Match Prices →"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                    Staged Price Candidates ({candidates.length})
                  </span>
                  <span style={{ marginLeft: 8, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    Review matches before saving
                  </span>
                </div>
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: "0.8rem" }}
                  onClick={() => setCandidates([])}
                >
                  ← Edit Text
                </button>
              </div>

              <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 16 }}>
                <table className="plan-items-table" style={{ fontSize: "0.85rem", width: "100%" }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--color-surface)", zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 36, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selectedIndices.size === candidates.length && candidates.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          aria-label="Select all candidates"
                        />
                      </th>
                      <th>Extracted Item</th>
                      <th style={{ textAlign: "right", width: 90 }}>Price</th>
                      <th>Catalog Match</th>
                      <th style={{ width: 90, textAlign: "center" }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((cand, idx) => (
                      <tr key={idx} style={{ opacity: selectedIndices.has(idx) ? 1 : 0.5 }}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedIndices.has(idx)}
                            onChange={() => handleToggleSelect(idx)}
                            aria-label={`Select item ${cand.extracted_name}`}
                          />
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{cand.extracted_name}</div>
                          {cand.brand && (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                              {cand.brand} • {cand.package_size || ""}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, color: cand.is_promotional ? "#b91c1c" : "inherit" }}>
                            {formatCents(cand.price_cents)}
                          </div>
                          {cand.is_promotional && cand.regular_price_cents && (
                            <div style={{ fontSize: "0.75rem", textDecoration: "line-through", color: "var(--color-text-muted)" }}>
                              {formatCents(cand.regular_price_cents)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <select
                              className="search-input"
                              style={{ fontSize: "0.8rem", padding: "2px 6px", height: 28 }}
                              value={cand.matched_product_id || ""}
                              onChange={(e) => handleCandidateProductChange(idx, e.target.value)}
                            >
                              <option value="">-- No Match / Select Product --</option>
                              {catalog.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.brand} {p.name} ({p.package_quantity} {p.package_unit})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: "2px 6px", fontSize: "0.75rem", height: 28, whiteSpace: "nowrap" }}
                              onClick={() => {
                                setActiveCandidateIndex(idx);
                                setIsCreateProductOpen(true);
                              }}
                              title="Add custom product to catalog"
                            >
                              + New
                            </button>
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            className="status-pill"
                            style={{
                              fontSize: "0.75rem",
                              padding: "2px 6px",
                              borderRadius: 4,
                              background:
                                cand.match_confidence === "high"
                                  ? "#dcfce7"
                                  : cand.match_confidence === "medium"
                                  ? "#fef9c3"
                                  : "#f3f4f6",
                              color:
                                cand.match_confidence === "high"
                                  ? "#15803d"
                                  : cand.match_confidence === "medium"
                                  ? "#a16207"
                                  : "#6b7280",
                            }}
                          >
                            {cand.match_confidence === "high"
                              ? "✓ Matched"
                              : cand.match_confidence === "medium"
                              ? "⚠️ Review"
                              : "❓ Unmatched"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {selectedIndices.size} of {candidates.length} items selected
                </span>

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveObservations}
                    disabled={isSaving || selectedIndices.size === 0}
                  >
                    {isSaving ? "Saving..." : `Confirm & Save to ${retailer}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isCreateProductOpen && (
        <CreateProductModal
          isOpen={isCreateProductOpen}
          onClose={() => {
            setIsCreateProductOpen(false);
            setActiveCandidateIndex(null);
          }}
          onProductCreated={handleProductCreated}
          initialName={
            activeCandidateIndex !== null && candidates[activeCandidateIndex]
              ? candidates[activeCandidateIndex].extracted_name
              : ""
          }
        />
      )}
    </>
  );
};
