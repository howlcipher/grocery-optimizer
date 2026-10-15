import React, { useEffect } from "react";
import { SavedListMetadata } from "../types";

interface SavedListsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  savedLists: SavedListMetadata[];
  activeListId: string | null;
  onSelectList: (id: string) => void;
  onDeleteList: (id: string) => void;
  onNewList: () => void;
}

export const SavedListsDrawer: React.FC<SavedListsDrawerProps> = ({
  isOpen,
  onClose,
  savedLists,
  activeListId,
  onSelectList,
  onDeleteList,
  onNewList,
}) => {
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

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Saved grocery lists"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: 12,
          }}
        >
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Your Saved Lists</h2>
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

        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: 16 }}>
          Saved lists are stored locally on this device.
        </p>

        {savedLists.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px 0" }}>
            <p>No saved lists found yet.</p>
          </div>
        ) : (
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
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
                    gap: 12,
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

                  <button
                    type="button"
                    className="remove-btn touch-target"
                    onClick={() => onDeleteList(list.id)}
                    aria-label={`Delete list ${list.name}`}
                    title="Delete saved list"
                  >
                    🗑️
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
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
      </div>
    </div>
  );
};
