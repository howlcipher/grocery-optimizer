import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { ProductSearch } from "./components/ProductSearch";
import { GroceryList } from "./components/GroceryList";
import { ComparisonResults } from "./components/ComparisonResults";
import { SavedListsDrawer } from "./components/SavedListsDrawer";
import { RecordPriceModal } from "./components/RecordPriceModal";
import { ProductPricesModal } from "./components/ProductPricesModal";
import {
  ComparisonResponse,
  GroceryList as GroceryListType,
  PriceObservation,
  Product,
} from "./types";
import { api } from "./api/client";
import {
  getActiveListId,
  getSavedLists,
  getSelectedZipCode,
  removeSavedList,
  saveListMetadata,
  setActiveListId,
  setSelectedZipCode,
} from "./lib/storage";

export const App: React.FC = () => {
  const [list, setList] = useState<GroceryListType | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [comparisonSource, setComparisonSource] = useState<"demonstration" | "user_contributed">("demonstration");
  const [selectedZipCode, setSelectedZipCodeState] = useState<string | null>(getSelectedZipCode());
  const [regionScope, setRegionScope] = useState<"exact" | "neighborhood">("exact");
  const [isComparing, setIsComparing] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [savedLists, setSavedLists] = useState(getSavedLists());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Price observation modals state
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordModalProduct, setRecordModalProduct] = useState<Product | null>(null);
  const [editingObservation, setEditingObservation] = useState<PriceObservation | null>(null);
  const [isPricesModalOpen, setIsPricesModalOpen] = useState(false);
  const [pricesModalProduct, setPricesModalProduct] = useState<Product | null>(null);

  const refreshSavedLists = useCallback(() => {
    setSavedLists(getSavedLists());
  }, []);

  const loadOrCreateInitialList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const storedId = getActiveListId();

    if (storedId) {
      try {
        const fetched = await api.getList(storedId);
        setList(fetched);
        saveListMetadata(fetched.id, fetched.name || "My Grocery List");
        refreshSavedLists();
        setIsLoading(false);
        return;
      } catch {
        removeSavedList(storedId);
        refreshSavedLists();
      }
    }

    try {
      const created = await api.createList("My Grocery List");
      setList(created);
      setActiveListId(created.id);
      saveListMetadata(created.id, created.name || "My Grocery List");
      refreshSavedLists();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initialize list");
    } finally {
      setIsLoading(false);
    }
  }, [refreshSavedLists]);

  useEffect(() => {
    loadOrCreateInitialList();
  }, [loadOrCreateInitialList]);

  const handleSelectProduct = async (product: Product) => {
    if (!list) return;
    setError(null);
    try {
      const updated = await api.addItem(list.id, product.id, 1);
      setList(updated);
      saveListMetadata(updated.id, updated.name || "My Grocery List");
      refreshSavedLists();
      if (comparison) setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add product");
    }
  };

  const handleUpdateQuantity = async (itemId: string, newQty: number) => {
    if (!list) return;
    setError(null);
    try {
      const updated = await api.updateItemQuantity(list.id, itemId, newQty);
      setList(updated);
      if (comparison) setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update quantity");
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!list) return;
    setError(null);
    try {
      const updated = await api.removeItem(list.id, itemId);
      setList(updated);
      if (comparison) setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove item");
    }
  };

  const handleUpdateListName = async (name: string) => {
    if (!list) return;
    setError(null);
    try {
      const updated = await api.updateListName(list.id, name);
      setList(updated);
      saveListMetadata(updated.id, updated.name || "My Grocery List");
      refreshSavedLists();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update list name");
    }
  };

  const handleComparePrices = async (
    source: "demonstration" | "user_contributed" = "demonstration",
    zipCode?: string | null,
    scope: "exact" | "neighborhood" = regionScope
  ) => {
    if (!list || list.items.length === 0) return;
    setIsComparing(true);
    setError(null);
    setComparisonSource(source);
    setRegionScope(scope);
    const activeZip = zipCode !== undefined ? zipCode : selectedZipCode;
    try {
      const res = await api.comparePrices(list.id, source, activeZip, scope);
      setComparison(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to compare prices");
    } finally {
      setIsComparing(false);
    }
  };

  const handleFilterZip = (zip: string | null) => {
    setSelectedZipCodeState(zip);
    setSelectedZipCode(zip);
    handleComparePrices(comparisonSource, zip, regionScope);
  };

  const handleSetRegionScope = (scope: "exact" | "neighborhood") => {
    setRegionScope(scope);
    handleComparePrices(comparisonSource, selectedZipCode, scope);
  };

  const handleNewList = async () => {
    setIsLoading(true);
    setError(null);
    setComparison(null);
    try {
      const created = await api.createList("My Grocery List");
      setList(created);
      setActiveListId(created.id);
      saveListMetadata(created.id, created.name || "My Grocery List");
      refreshSavedLists();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create new list");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectList = async (id: string) => {
    setIsLoading(true);
    setError(null);
    setComparison(null);
    try {
      const fetched = await api.getList(id);
      setList(fetched);
      setActiveListId(fetched.id);
      saveListMetadata(fetched.id, fetched.name || "My Grocery List");
      refreshSavedLists();
    } catch {
      setError("Could not load that saved list. It may have expired.");
      removeSavedList(id);
      refreshSavedLists();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSavedList = (id: string) => {
    removeSavedList(id);
    refreshSavedLists();
    if (list?.id === id) {
      handleNewList();
    }
  };

  const handleOpenRecordPriceModal = (product?: Product | null, editObs?: PriceObservation | null) => {
    setRecordModalProduct(product || null);
    setEditingObservation(editObs || null);
    setIsRecordModalOpen(true);
  };

  const handleOpenProductPricesModal = (product: Product) => {
    setPricesModalProduct(product);
    setIsPricesModalOpen(true);
  };

  return (
    <div className="app-container">
      <Header
        onOpenSavedLists={() => setIsSavedDrawerOpen(true)}
        onNewList={handleNewList}
        savedListsCount={savedLists.length}
        onOpenRecordPrice={() => handleOpenRecordPriceModal(null, null)}
      />

      <main className="main-content">
        {error && (
          <div className="alert-box alert-error" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="loading-state">
            <p>Loading your grocery list...</p>
          </div>
        ) : comparison ? (
          <ComparisonResults
            comparison={comparison}
            onBackToList={() => setComparison(null)}
            onSwitchSource={(s) => handleComparePrices(s, selectedZipCode)}
            onFilterZip={handleFilterZip}
            onSetRegionScope={handleSetRegionScope}
            isSwitching={isComparing}
          />
        ) : list ? (
          <>
            <ProductSearch onSelectProduct={handleSelectProduct} />
            <GroceryList
              list={list}
              onUpdateListName={handleUpdateListName}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onComparePrices={(source, zip) => {
                setSelectedZipCodeState(zip || null);
                handleComparePrices(source, zip);
              }}
              onCompareProductPrices={handleOpenProductPricesModal}
              onRecordPriceForProduct={(prod) => handleOpenRecordPriceModal(prod, null)}
              isComparing={isComparing}
            />
          </>
        ) : null}
      </main>

      <SavedListsDrawer
        isOpen={isSavedDrawerOpen}
        onClose={() => setIsSavedDrawerOpen(false)}
        savedLists={savedLists}
        activeListId={list?.id || null}
        onSelectList={handleSelectList}
        onDeleteList={handleDeleteSavedList}
        onNewList={handleNewList}
      />

      <RecordPriceModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setRecordModalProduct(null);
          setEditingObservation(null);
        }}
        initialProduct={recordModalProduct}
        initialStoreName={editingObservation?.store_name || ""}
        initialPriceCents={editingObservation?.price_cents}
        initialDate={editingObservation?.observation_date || ""}
        initialNotes={editingObservation?.notes || ""}
        initialPromotional={editingObservation?.is_promotional || false}
        editingObservationId={editingObservation?.id || null}
        onSaved={() => {
          if (comparison && comparisonSource === "user_contributed") {
            handleComparePrices("user_contributed", selectedZipCode);
          }
        }}
      />

      <ProductPricesModal
        isOpen={isPricesModalOpen}
        onClose={() => {
          setIsPricesModalOpen(false);
          setPricesModalProduct(null);
        }}
        product={pricesModalProduct}
        onRecordPriceForProduct={(prod, editObs) => {
          setIsPricesModalOpen(false);
          handleOpenRecordPriceModal(prod, editObs || null);
        }}
      />
    </div>
  );
};
