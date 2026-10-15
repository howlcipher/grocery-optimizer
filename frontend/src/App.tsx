import React, { useState, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { ProductSearch } from "./components/ProductSearch";
import { GroceryList } from "./components/GroceryList";
import { ComparisonResults } from "./components/ComparisonResults";
import { SavedListsDrawer } from "./components/SavedListsDrawer";
import { RecordPriceModal } from "./components/RecordPriceModal";
import { ProductPricesModal } from "./components/ProductPricesModal";
import { StaplesDrawer } from "./components/StaplesDrawer";
import { PostTripStaplesModal, CandidateStapleItem } from "./components/PostTripStaplesModal";
import {
  ComparisonResponse,
  GroceryList as GroceryListType,
  PriceObservation,
  Product,
  StapleItem,
  PurchaseHistoryRecord,
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
  getStaples,
  isStaple,
  toggleStaple,
  setStapleQuantity,
  addOrUpdateStaple,
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

  // Staples state
  const [isStaplesDrawerOpen, setIsStaplesDrawerOpen] = useState(false);
  const [staples, setStaples] = useState<StapleItem[]>(getStaples());
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isPostTripModalOpen, setIsPostTripModalOpen] = useState(false);
  const [postTripCandidates, setPostTripCandidates] = useState<CandidateStapleItem[]>([]);

  const refreshStaples = useCallback(() => {
    setStaples(getStaples());
  }, []);

  useEffect(() => {
    api.getProducts(100).then(setCatalogProducts).catch(() => {});
  }, []);

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

  const handleToggleStaple = (productId: string) => {
    toggleStaple(productId);
    refreshStaples();
  };

  const handleUpdateStapleQuantity = (productId: string, qty: number) => {
    setStapleQuantity(productId, qty);
    refreshStaples();
  };

  const handleAddStapleToList = async (productId: string, quantity: number) => {
    if (!list) return;
    setError(null);
    try {
      const existing = list.items.find((it) => it.product.id === productId);
      let updated: GroceryListType;
      if (existing) {
        const newQty = Math.min(99, Math.max(existing.quantity, quantity));
        updated = await api.updateItemQuantity(list.id, existing.id, newQty);
      } else {
        if (list.items.length >= 100) {
          setError("Grocery list has reached the maximum of 100 items.");
          return;
        }
        updated = await api.addItem(list.id, productId, Math.max(1, Math.min(99, quantity)));
      }
      setList(updated);
      saveListMetadata(updated.id, updated.name || "My Grocery List");
      refreshSavedLists();
      if (comparison) setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add staple to list");
    }
  };

  const handleAddAllStaplesToList = async () => {
    if (!list) return;
    const currentStaples = getStaples();
    if (currentStaples.length === 0) return;

    setError(null);
    setIsLoading(true);
    try {
      let currentList = list;
      for (const staple of currentStaples) {
        const existing = currentList.items.find((it) => it.product.id === staple.product_id);
        if (existing) {
          if (existing.quantity < staple.preferred_quantity) {
            currentList = await api.updateItemQuantity(currentList.id, existing.id, staple.preferred_quantity);
          }
        } else {
          if (currentList.items.length >= 100) {
            setError("Grocery list limit reached (100 items). Some staples were not added.");
            break;
          }
          currentList = await api.addItem(currentList.id, staple.product_id, staple.preferred_quantity);
        }
      }
      setList(currentList);
      saveListMetadata(currentList.id, currentList.name || "My Grocery List");
      refreshSavedLists();
      if (comparison) setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add staples to list");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloneList = async (sourceListId: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const sourceList = await api.getList(sourceListId);
      const clonedName = `${sourceList.name || "Grocery List"} (Copy)`;
      let newList = await api.createList(clonedName);

      for (const item of sourceList.items) {
        newList = await api.addItem(newList.id, item.product.id, item.quantity);
      }

      setList(newList);
      setActiveListId(newList.id);
      saveListMetadata(newList.id, newList.name || clonedName);
      refreshSavedLists();
      setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to clone list");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadTripIntoList = async (trip: PurchaseHistoryRecord) => {
    if (!list) return;
    setError(null);
    setIsLoading(true);
    try {
      let currentList = list;
      for (const item of trip.items) {
        const existing = currentList.items.find((it) => it.product.id === item.product_id);
        if (existing) {
          const newQty = Math.min(99, existing.quantity + (item.quantity || 1));
          currentList = await api.updateItemQuantity(currentList.id, existing.id, newQty);
        } else {
          if (currentList.items.length >= 100) {
            setError("List limit reached (100 items). Some trip items were not added.");
            break;
          }
          currentList = await api.addItem(currentList.id, item.product_id, item.quantity || 1);
        }
      }
      setList(currentList);
      saveListMetadata(currentList.id, currentList.name || "My Grocery List");
      refreshSavedLists();
      if (comparison) setComparison(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add trip items to list");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTripSaved = (items: CandidateStapleItem[]) => {
    const unstarred = items.filter((it) => !isStaple(it.product_id));
    if (unstarred.length > 0) {
      setPostTripCandidates(unstarred);
      setIsPostTripModalOpen(true);
    }
  };

  const handleSavePostTripStaples = (selected: { product_id: string; quantity: number }[]) => {
    for (const item of selected) {
      addOrUpdateStaple(item.product_id, item.quantity);
    }
    refreshStaples();
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
        onOpenStaples={() => setIsStaplesDrawerOpen(true)}
        staplesCount={staples.length}
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
            <ProductSearch
              onSelectProduct={handleSelectProduct}
              isProductStaple={isStaple}
              onToggleStaple={handleToggleStaple}
            />
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
              onAddStaplesToList={handleAddAllStaplesToList}
              staplesCount={staples.length}
              isProductStaple={isStaple}
              onToggleStaple={handleToggleStaple}
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
        onCloneList={handleCloneList}
        onNewList={handleNewList}
        onLoadTripIntoList={handleLoadTripIntoList}
      />

      <StaplesDrawer
        isOpen={isStaplesDrawerOpen}
        onClose={() => setIsStaplesDrawerOpen(false)}
        staples={staples}
        catalogProducts={catalogProducts}
        onToggleStaple={handleToggleStaple}
        onUpdateStapleQuantity={handleUpdateStapleQuantity}
        onAddStapleToList={handleAddStapleToList}
        onAddAllStaplesToList={handleAddAllStaplesToList}
        referenceStoreName={comparison?.best_plan.stores[0]?.name || null}
      />

      <RecordPriceModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setRecordModalProduct(null);
          setEditingObservation(null);
          refreshStaples();
        }}
        initialProduct={recordModalProduct}
        initialStoreName={editingObservation?.store_name || ""}
        initialPriceCents={editingObservation?.price_cents}
        initialDate={editingObservation?.observation_date || ""}
        initialNotes={editingObservation?.notes || ""}
        initialPromotional={editingObservation?.is_promotional || false}
        editingObservationId={editingObservation?.id || null}
        onSaved={() => {
          refreshStaples();
          if (comparison && comparisonSource === "user_contributed") {
            handleComparePrices("user_contributed", selectedZipCode);
          }
        }}
        onTripSaved={handleTripSaved}
      />

      <PostTripStaplesModal
        isOpen={isPostTripModalOpen}
        onClose={() => setIsPostTripModalOpen(false)}
        items={postTripCandidates}
        onSaveStaples={handleSavePostTripStaples}
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
        isProductStaple={isStaple}
        onToggleStaple={handleToggleStaple}
      />
    </div>
  );
};
