import React, { useState, useEffect } from "react";

export interface CandidateStapleItem {
  product_id: string;
  product_name: string;
  quantity: number;
}

interface PostTripStaplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CandidateStapleItem[];
  onSaveStaples: (staples: { product_id: string; quantity: number }[]) => void;
}

export const PostTripStaplesModal: React.FC<PostTripStaplesModalProps> = ({
  isOpen,
  onClose,
  items,
  onSaveStaples,
}) => {
  const [candidates, setCandidates] = useState<{ product_id: string; product_name: string; quantity: number; selected: boolean }[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCandidates(
        (items || []).map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity || 1,
          selected: true,
        }))
      );
    }
  }, [isOpen, items]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || candidates.length === 0) return null;

  const handleToggle = (productId: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.product_id === productId ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.product_id === productId) {
          const newQty = Math.max(1, Math.min(99, c.quantity + delta));
          return { ...c, quantity: newQty };
        }
        return c;
      })
    );
  };

  const handleConfirm = () => {
    const toSave = candidates
      .filter((c) => c.selected)
      .map((c) => ({ product_id: c.product_id, quantity: c.quantity }));
    if (toSave.length > 0) {
      onSaveStaples(toSave);
    }
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-trip-title"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>⭐</div>
          <h2 id="post-trip-title" style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 6px 0" }}>
            Trip Recorded! Save to My Staples?
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", margin: 0 }}>
            Save regular items as staples so you can rebuild your weekly basket in one tap next time.
          </p>
        </div>

        <ul style={{ listStyle: "none", margin: "16px 0", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {candidates.map((c) => (
            <li
              key={c.product_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid var(--color-border)",
                backgroundColor: c.selected ? "var(--color-primary-light)" : "#ffffff",
                gap: 8,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={c.selected}
                  onChange={() => handleToggle(c.product_id)}
                  style={{ width: 18, height: 18, accentColor: "var(--color-primary)" }}
                />
                <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{c.product_name}</span>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Qty:</span>
                <button
                  type="button"
                  className="qty-btn touch-target"
                  onClick={() => handleUpdateQty(c.product_id, -1)}
                  disabled={c.quantity <= 1 || !c.selected}
                  aria-label={`Decrease quantity of ${c.product_name}`}
                >
                  −
                </button>
                <span className="qty-display" style={{ minWidth: 24, fontSize: "0.9rem" }}>
                  {c.quantity}
                </span>
                <button
                  type="button"
                  className="qty-btn touch-target"
                  onClick={() => handleUpdateQty(c.product_id, 1)}
                  disabled={c.quantity >= 99 || !c.selected}
                  aria-label={`Increase quantity of ${c.product_name}`}
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-secondary touch-target"
            style={{ flex: 1 }}
            onClick={onClose}
          >
            Skip / Done
          </button>
          <button
            type="button"
            className="btn btn-primary touch-target"
            style={{ flex: 2 }}
            onClick={handleConfirm}
          >
            ⭐ Add Selected to Staples
          </button>
        </div>
      </div>
    </div>
  );
};
