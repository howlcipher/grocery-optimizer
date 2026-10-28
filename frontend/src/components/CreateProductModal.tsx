import React, { useState } from "react";
import { api } from "../api/client";
import { Product } from "../types";

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductCreated: (product: Product) => void;
  initialName?: string;
}

const CATEGORIES = [
  "Dairy & Refrigerated",
  "Fresh Produce",
  "Bakery & Bread",
  "Meat & Seafood",
  "Pantry & Dry Goods",
  "Beverages",
  "Snacks & Breakfast",
  "Frozen Foods",
  "Household & Paper",
];

export const CreateProductModal: React.FC<CreateProductModalProps> = ({
  isOpen,
  onClose,
  onProductCreated,
  initialName = "",
}) => {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [packageQuantity, setPackageQuantity] = useState("1");
  const [packageUnit, setPackageUnit] = useState("ea");
  const [category, setCategory] = useState("Pantry & Dry Goods");
  const [canonicalGroup, setCanonicalGroup] = useState("");
  const [upc, setUpc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Product name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await api.createProduct({
        name: name.trim(),
        brand: brand.trim() || "Generic",
        package_quantity: packageQuantity.trim() || "1",
        package_unit: packageUnit.trim().toLowerCase() || "ea",
        category: category.trim() || undefined,
        canonical_group: canonicalGroup.trim() || undefined,
        upc: upc.trim() || undefined,
      });
      onProductCreated(created);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-product-title">
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2 id="create-product-title" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Add Custom Household Product
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && (
          <div className="alert-box alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label htmlFor="prod-name" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
              Product Name *
            </label>
            <input
              id="prod-name"
              type="text"
              className="search-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Whole Milk, Honeycrisp Apples, Large Eggs"
              required
              autoFocus
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label htmlFor="prod-brand" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Brand
              </label>
              <input
                id="prod-brand"
                type="text"
                className="search-input"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Kroger, Meijer, Store Brand"
              />
            </div>

            <div className="form-group">
              <label htmlFor="prod-category" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Category
              </label>
              <select
                id="prod-category"
                className="search-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div className="form-group">
              <label htmlFor="prod-qty" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Package Quantity
              </label>
              <input
                id="prod-qty"
                type="text"
                className="search-input"
                value={packageQuantity}
                onChange={(e) => setPackageQuantity(e.target.value)}
                placeholder="e.g. 1, 12, 16, 32"
              />
            </div>

            <div className="form-group">
              <label htmlFor="prod-unit" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                Unit
              </label>
              <input
                id="prod-unit"
                type="text"
                className="search-input"
                value={packageUnit}
                onChange={(e) => setPackageUnit(e.target.value)}
                placeholder="e.g. gal, oz, lb, ct, ea"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label htmlFor="prod-canonical-group" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
              Equivalent Comparison Group (Optional)
            </label>
            <input
              id="prod-canonical-group"
              type="text"
              className="search-input"
              value={canonicalGroup}
              onChange={(e) => setCanonicalGroup(e.target.value)}
              placeholder="e.g. whole-milk-1-gal, peanut-butter-16oz"
            />
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              Links this product with equivalents across Kroger and Meijer store brands.
            </span>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label htmlFor="prod-upc" style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
              UPC / Barcode (Optional)
            </label>
            <input
              id="prod-upc"
              type="text"
              className="search-input"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              placeholder="e.g. 011110416003"
            />
          </div>

          <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Save Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
