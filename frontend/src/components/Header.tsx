import React from "react";

interface HeaderProps {
  onOpenSavedLists: () => void;
  onNewList: () => void;
  onOpenRecordPrice?: () => void;
  onOpenStaples?: () => void;
  onOpenPriceImport?: () => void;
  onOpenCreateProduct?: () => void;
  onOpenBackupRestore?: () => void;
  savedListsCount: number;
  staplesCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSavedLists,
  onNewList,
  onOpenRecordPrice,
  onOpenStaples,
  onOpenPriceImport,
  onOpenCreateProduct,
  onOpenBackupRestore,
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
        {onOpenPriceImport && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenPriceImport}
            aria-label="Import prices from text, cart, or ad"
          >
            📋 Import Prices
          </button>
        )}
        {onOpenCreateProduct && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenCreateProduct}
            aria-label="Add custom product"
          >
            + Product
          </button>
        )}
        {onOpenStaples && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenStaples}
            aria-label={`View My Staples (${staplesCount})`}
          >
            ⭐ Staples ({staplesCount})
          </button>
        )}
        {onOpenRecordPrice && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenRecordPrice}
            aria-label="Record store price"
          >
            + Price
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary touch-target"
          onClick={onOpenSavedLists}
          aria-label={`View saved lists (${savedListsCount})`}
        >
          Lists ({savedListsCount})
        </button>
        {onOpenBackupRestore && (
          <button
            type="button"
            className="btn btn-secondary touch-target"
            onClick={onOpenBackupRestore}
            aria-label="Backup and restore data"
          >
            📦 Backup
          </button>
        )}
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
