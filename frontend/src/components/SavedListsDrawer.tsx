import React, { useEffect, useState } from "react";
import { SavedListMetadata, PurchaseHistoryRecord } from "../types";
import {
  getPurchaseHistory,
  deletePurchaseHistoryRecord,
  clearPurchaseHistory,
} from "../lib/storage";

interface SavedListsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  savedLists: SavedListMetadata[];
  activeListId: string | null;
  onSelectList: (id: string) => void;
  onDeleteList: (id: string) => void;
  onCloneList: (id: string) => void;
  onNewList: () => void;
  onLoadTripIntoList?: (trip: PurchaseHistoryRecord) => void;
}

export const SavedListsDrawer: React.FC<SavedListsDrawerProps> = ({
  isOpen,
  onClose,
  savedLists,
  activeListId,
  onSelectList,
  onDeleteList,
  onCloneList,
  onNewList,
  onLoadTripIntoList,
}) => {
  const [activeTab, setActiveTab] = useState<"lists" | "history">("lists");
  const [history, setHistory] = useState<PurchaseHistoryRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHistory(getPurchaseHistory());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDeleteTrip = (id: string) => {
    deletePurchaseHistoryRecord(id);
    setHistory(getPurchaseHistory());
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear your local purchase history?")) {
      clearPurchaseHistory();
      setHistory([]);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-lists-title"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: 12,
          }}
        >
          <div>
            <h2 id="saved-lists-title" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
              Lists & Purchase History
            </h2>
            <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              Stored locally on this device • Never sent to any cloud server
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onClose}
            aria-label="Close saved lists"
            style={{ minWidth: 44, height: 44, padding: "0 12px" }}
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className={`btn ${activeTab === "lists" ? "btn-primary" : "btn-secondary"} touch-target`}
            style={{ flex: 1, minHeight: 40, fontSize: "0.9rem" }}
            onClick={() => setActiveTab("lists")}
          >
            📋 Saved Lists ({savedLists.length})
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "history" ? "btn-primary" : "btn-secondary"} touch-target`}
            style={{ flex: 1, minHeight: 40, fontSize: "0.9rem" }}
            onClick={() => {
              setHistory(getPurchaseHistory());
              setActiveTab("history");
            }}
          >
            🧾 Purchase History ({history.length})
          </button>
        </div>

        {/* Tab 1: Saved Lists */}
        {activeTab === "lists" && (
          <>
            {savedLists.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px 0" }}>
                <p>No saved lists found yet.</p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0 }}>
                {savedLists.map((list) => {
                  const isActive = list.id === activeListId;
                  const dateStr = new Date(list.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <li
                      key={list.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        border: `2px solid ${
                          isActive ? "var(--color-primary)" : "var(--color-border)"
                        }`,
                        backgroundColor: isActive ? "var(--color-primary-light)" : "#ffffff",
                        gap: 10,
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          background: "transparent",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          flex: 1,
                          minWidth: 0,
                        }}
                        onClick={() => {
                          onSelectList(list.id);
                          onClose();
                        }}
                        aria-label={`Open list ${list.name}`}
                      >
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                          {list.name} {isActive && <span style={{ color: "var(--color-primary)" }}>(Active)</span>}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                          Updated {dateStr}
                        </div>
                      </button>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary touch-target"
                          onClick={() => {
                            onCloneList(list.id);
                            onClose();
                          }}
                          aria-label={`Clone list ${list.name}`}
                          title="Clone as new list"
                          style={{ height: 36, padding: "0 10px", fontSize: "0.8rem" }}
                        >
                          📋 Clone
                        </button>
                        <button
                          type="button"
                          className="remove-btn touch-target"
                          onClick={() => onDeleteList(list.id)}
                          aria-label={`Delete list ${list.name}`}
                          title="Delete saved list"
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-primary touch-target"
                style={{ width: "100%" }}
                onClick={() => {
                  onNewList();
                  onClose();
                }}
              >
                + Start New List
              </button>
            </div>
          </>
        )}

        {/* Tab 2: Purchase History */}
        {activeTab === "history" && (
          <>
            {history.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 16px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🧾</div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: 8 }}>
                  No shopping trips recorded yet
                </h3>
                <p style={{ fontSize: "0.9rem", color: "var(--color-text-muted)", maxWidth: 420, margin: "0 auto" }}>
                  When you photograph a grocery receipt or record a shopping trip, your confirmed purchases are saved here on your device.
                  You can review past trips or re-add all purchased items to your active grocery list anytime.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    Showing {history.length} past shopping trips
                  </span>
                  <button
                    type="button"
                    className="link-button touch-target"
                    style={{ fontSize: "0.8rem", color: "#ef4444" }}
                    onClick={handleClearHistory}
                  >
                    Clear History
                  </button>
                </div>

                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12, margin: 0, padding: 0 }}>
                  {history.map((trip) => (
                    <li
                      key={trip.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)",
                        backgroundColor: "#ffffff",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                            {trip.store_name}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                            {trip.trip_date} {trip.city ? `• ${trip.city}` : ""} {trip.zip_code ? `(${trip.zip_code})` : ""}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--color-primary)" }}>
                            ${(trip.total_cents / 100).toFixed(2)}
                          </div>
                          <span
                            style={{
                              display: "inline-block",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: 4,
                              backgroundColor: trip.source === "receipt_scan" ? "#fef3c7" : "#e0f2fe",
                              color: trip.source === "receipt_scan" ? "#92400e" : "#0369a1",
                              marginTop: 2,
                            }}
                          >
                            {trip.source === "receipt_scan" ? "🧾 Receipt" : "🛒 Trip"}
                          </span>
                        </div>
                      </div>

                      {/* Items list */}
                      {trip.items.length > 0 && (
                        <div
                          style={{
                            backgroundColor: "#f8fafc",
                            padding: "8px 10px",
                            borderRadius: 6,
                            fontSize: "0.8rem",
                          }}
                        >
                          <div style={{ fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 4 }}>
                            {trip.items.length} items purchased:
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
                            {trip.items.map((it, idx) => (
                              <span key={idx} style={{ color: "#334155" }}>
                                {it.quantity > 1 ? `${it.quantity}x ` : ""}{it.product_name} (${(it.price_cents / 100).toFixed(2)})
                                {idx < trip.items.length - 1 ? " •" : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {onLoadTripIntoList && trip.items.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary touch-target"
                            style={{ height: 34, padding: "0 10px", fontSize: "0.8rem" }}
                            onClick={() => {
                              onLoadTripIntoList(trip);
                              onClose();
                            }}
                          >
                            🛒 Add Trip Items to Grocery List
                          </button>
                        )}
                        <button
                          type="button"
                          className="remove-btn touch-target"
                          onClick={() => handleDeleteTrip(trip.id)}
                          aria-label={`Delete trip from ${trip.store_name} on ${trip.trip_date}`}
                          title="Delete trip from history"
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
