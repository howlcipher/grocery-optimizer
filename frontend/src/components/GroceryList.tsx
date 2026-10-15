import React, { useState } from "react";
import { GroceryItem, GroceryList as GroceryListType } from "../types";

interface GroceryListProps {
  list: GroceryListType;
  onUpdateListName: (name: string) => void;
  onUpdateQuantity: (itemId: string, newQty: number) => void;
  onRemoveItem: (itemId: string) => void;
  onComparePrices: () => void;
  isComparing: boolean;
}

export const GroceryList: React.FC<GroceryListProps> = ({
  list,
  onUpdateListName,
  onUpdateQuantity,
  onRemoveItem,
  onComparePrices,
  isComparing,
}) => {
  const [listName, setListName] = useState(list.name || "My Grocery List");

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

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-primary touch-target"
              style={{
                width: "100%",
                height: 52,
                fontSize: "1.1rem",
                borderRadius: "var(--radius-md)",
              }}
              onClick={onComparePrices}
              disabled={isEmpty || isComparing}
              aria-label="Compare prices across stores"
            >
              {isComparing ? "Comparing Prices..." : "Compare Prices →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
