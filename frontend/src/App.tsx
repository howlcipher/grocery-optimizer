import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { ProductSearch } from "./components/ProductSearch";
import { GroceryList } from "./components/GroceryList";
import { ComparisonResults } from "./components/ComparisonResults";
import { SavedListsDrawer } from "./components/SavedListsDrawer";
import {
  ComparisonResponse,
  GroceryList as GroceryListType,
  Product,
} from "./types";
import { api } from "./api/client";
import {
  getActiveListId,
  getSavedLists,
  removeSavedList,
  saveListMetadata,
  setActiveListId,
} from "./lib/storage";

export const App: React.FC = () => {
  const [list, setList] = useState<GroceryListType | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [savedLists, setSavedLists] = useState(getSavedLists());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        // If list doesn't exist on server, remove from storage and fall through
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
      // If we previously had comparison results, invalidate them since list changed
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

  const handleComparePrices = async () => {
    if (!list || list.items.length === 0) return;
    setIsComparing(true);
    setError(null);
    try {
      const res = await api.comparePrices(list.id);
      setComparison(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to compare prices");
    } finally {
      setIsComparing(false);
    }
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

  return (
    <div className="app-container">
      <Header
        onOpenSavedLists={() => setIsSavedDrawerOpen(true)}
        onNewList={handleNewList}
        savedListsCount={savedLists.length}
      />

      <main>
        {error && (
          <div className="alert-box alert-error" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="empty-state">
            <p>Loading your grocery list...</p>
          </div>
        ) : comparison ? (
          <ComparisonResults
            comparison={comparison}
            onBackToList={() => setComparison(null)}
          />
        ) : list ? (
          <>
            <ProductSearch onSelectProduct={handleSelectProduct} />
            <GroceryList
              list={list}
              onUpdateListName={handleUpdateListName}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onComparePrices={handleComparePrices}
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
    </div>
  );
};
