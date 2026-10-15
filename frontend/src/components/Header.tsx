import React from "react";

interface HeaderProps {
  onOpenSavedLists: () => void;
  onNewList: () => void;
  savedListsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSavedLists,
  onNewList,
  savedListsCount,
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
