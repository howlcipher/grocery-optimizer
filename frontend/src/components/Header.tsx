import React from "react";

interface HeaderProps {
  onOpenSavedLists: () => void;
  onNewList: () => void;
  onOpenRecordPrice?: () => void;
  onOpenStaples?: () => void;
  savedListsCount: number;
  staplesCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSavedLists,
  onNewList,
  onOpenRecordPrice,
  onOpenStaples,
  savedListsCount,
  staplesCount = 0,
}) => {
  return (
    <header className="app-header">
      <div className="brand-title">
        <span role="img" aria-label="cart">
          🛒
        </span>
        <span>Grocery Optimizer</span>
      </div>
      <div className="header-actions">
        {onOpenStaples && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenStaples}
            aria-label={`View My Staples (${staplesCount})`}
          >
            ⭐ My Staples ({staplesCount})
          </button>
        )}
        {onOpenRecordPrice && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenRecordPrice}
            aria-label="Record store price"
          >
            + Record Price
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary touch-target"
          onClick={onOpenSavedLists}
          aria-label={`View saved lists (${savedListsCount})`}
        >
          Saved Lists ({savedListsCount})
        </button>
        <button
          type="button"
          className="btn btn-primary touch-target"
          onClick={onNewList}
          aria-label="Start new grocery list"
        >
          + New List
        </button>
      </div>
    </header>
  );
};

