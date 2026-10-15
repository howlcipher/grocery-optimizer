import React, { useState } from "react";
import { GroceryItem, GroceryList as GroceryListType, Product } from "../types";
import { getSelectedZipCode, setSelectedZipCode as saveSelectedZip } from "../lib/storage";

interface GroceryListProps {
  list: GroceryListType;
  onUpdateListName: (name: string) => void;
  onUpdateQuantity: (itemId: string, newQty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onComparePrices: (source: "demonstration" | "user_contributed", zipCode?: string | null) => void;
  onCompareProductPrices?: (product: Product) => void;
  onRecordPriceForProduct?: (product: Product) => void;
  isComparing: boolean;
}

export const GroceryList: React.FC<GroceryListProps> = ({
  list,
  onUpdateListName,
  onUpdateQuantity,
  onRemoveItem,
  onComparePrices,
  onCompareProductPrices,
  onRecordPriceForProduct,
  isComparing,
}) => {
  const [listName, setListName] = useState(list.name || "My Grocery List");
  const [pricingMode, setPricingMode] = useState<"demonstration" | "user_contributed">("demonstration");
  const [zipCode, setZipCode] = useState(getSelectedZipCode() || "");

  const handleNameBlur = () => {
    if (listName.trim() !== (list.name || "")) {
      onUpdateListName(listName.trim() || "My Grocery List");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const handleZipChange = (val: string) => {
    setZipCode(val.trim());
    saveSelectedZip(val.trim() || null);
  };

  const isEmpty = list.items.length === 0;

  return (
    <div className="card">
      <div className="list-name-section">
        <div>
          <label htmlFor="list-name-input" className="sr-only" style={{ display: "none" }}>
            List Name
          </label>
          <input
            id="list-name-input"
            type="text"
            className="list-title-input touch-target"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleKeyDown}
            title="Click to rename list"
            aria-label="Grocery list name"
          />
        </div>
        <span
          style={{
            fontSize: "0.875rem",
            color: "var(--color-text-muted)",
            fontWeight: 500,
          }}
        >
          {list.items.length} {list.items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {isEmpty ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            📝
          </div>
          <h3 style={{ fontSize: "1.2rem", marginBottom: 8, fontWeight: 600 }}>
            Your grocery list is empty
          </h3>
          <p>Search for groceries above to start finding the cheapest stores.</p>
        </div>
      ) : (
        <>
          <ul className="items-list" aria-label="Grocery items on list">
            {list.items.map((item: GroceryItem) => (
              <li key={item.id} className="item-row">
                <div className="item-info">
                  <div className="item-name">{item.product.name}</div>
                  <div className="item-meta">
                    {item.product.brand} • {item.product.package_quantity}{" "}
                    {item.product.package_unit}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    {onCompareProductPrices && (
                      <button
                        type="button"
                        className="link-button touch-target"
                        style={{ fontSize: "0.85rem", color: "var(--color-primary)", padding: "4px 8px" }}
                        onClick={() => onCompareProductPrices(item.product)}
                        aria-label={`Compare store prices for ${item.product.name}`}
                      >
                        🔍 Compare Stores
                      </button>
                    )}
                    {onRecordPriceForProduct && (
                      <button
                        type="button"
                        className="link-button touch-target"
                        style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", padding: "4px 8px" }}
                        onClick={() => onRecordPriceForProduct(item.product)}
                        aria-label={`Record price for ${item.product.name}`}
                      >
                        + Record Price
                      </button>
                    )}
                  </div>
                </div>

                <div className="item-controls">
                  <button
                    type="button"
                    className="qty-btn touch-target"
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    aria-label={`Decrease quantity of ${item.product.name}`}
                  >
                    −
                  </button>

                  <span
                    className="qty-display"
                    aria-label={`Quantity: ${item.quantity}`}
                  >
                    {item.quantity}
                  </span>

                  <button
                    type="button"
                    className="qty-btn touch-target"
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    disabled={item.quantity >= 99}
                    aria-label={`Increase quantity of ${item.product.name}`}
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="remove-btn touch-target"
                    onClick={() => onRemoveItem(item.id)}
                    aria-label={`Remove ${item.product.name} from list`}
                    title="Remove item"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Pricing Source Selection Bar */}
          <div style={{ marginTop: 20, padding: "12px 16px", backgroundColor: "var(--color-bg)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Compare with:</span>
              <div className="source-toggle-group" role="radiogroup" aria-label="Comparison pricing dataset">
                <button
                  type="button"
                  className={`source-toggle-btn ${pricingMode === "demonstration" ? "active" : ""}`}
                  onClick={() => setPricingMode("demonstration")}
                  role="radio"
                  aria-checked={pricingMode === "demonstration"}
                >
                  🧪 Demo Data
                </button>
                <button
                  type="button"
                  className={`source-toggle-btn ${pricingMode === "user_contributed" ? "active" : ""}`}
                  onClick={() => setPricingMode("user_contributed")}
                  role="radio"
                  aria-checked={pricingMode === "user_contributed"}
                >
                  👥 User Observations
                </button>
              </div>
            </div>

            {/* Area ZIP input for user observations */}
            {pricingMode === "user_contributed" && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label htmlFor="user-zip-input" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Shopping Area ZIP:
                </label>
                <input
                  id="user-zip-input"
                  type="text"
                  className="search-input"
                  style={{ width: 110, height: 34, fontSize: "0.85rem", padding: "0 8px" }}
                  placeholder="e.g. 48042"
                  value={zipCode}
                  onChange={(e) => handleZipChange(e.target.value)}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  Leave blank to compare across all observed stores
                </span>
              </div>
            )}

            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 6 }}>
              {pricingMode === "demonstration"
                ? "Uses synthetic demonstration store offers from Mission 001 seed data."
                : "Uses real consumer-submitted shelf prices. Missing prices will not be faked or assumed."}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary touch-target"
              style={{
                width: "100%",
                height: 52,
                fontSize: "1.1rem",
                borderRadius: "var(--radius-md)",
              }}
              onClick={() => onComparePrices(pricingMode, zipCode || null)}
              disabled={isEmpty || isComparing}
              aria-label="Compare prices across stores"
            >
              {isComparing
                ? "Comparing Prices..."
                : pricingMode === "user_contributed"
                ? zipCode
                  ? `Compare User Prices in ZIP ${zipCode} →`
                  : "Compare User-Entered Prices →"
                : "Compare Demonstration Prices →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
