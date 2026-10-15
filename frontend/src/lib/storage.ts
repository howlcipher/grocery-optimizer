import { SavedListMetadata, StoreResponse, StapleItem, PurchaseHistoryRecord } from "../types";

const SAVED_LISTS_KEY = "grocery_optimizer_saved_lists";
const ACTIVE_LIST_ID_KEY = "grocery_optimizer_active_list_id";
const OBSERVATION_TOKENS_KEY = "grocery_optimizer_observation_tokens";
const RECENT_STORES_KEY = "grocery_optimizer_recent_stores";
const SELECTED_ZIP_KEY = "grocery_optimizer_selected_zip";
const STAPLES_KEY = "grocery_optimizer_staples";
const PURCHASE_HISTORY_KEY = "grocery_optimizer_purchase_history";

// --- Saved Lists Storage ---

export function getSavedLists(): SavedListMetadata[] {
  try {
    const raw = localStorage.getItem(SAVED_LISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveListMetadata(id: string, name: string): void {
  try {
    const lists = getSavedLists();
    const existingIndex = lists.findIndex((l) => l.id === id);
    const now = new Date().toISOString();
    const displayName = name.trim() || "Untitled List";

    if (existingIndex >= 0) {
      lists[existingIndex] = {
        id,
        name: displayName,
        updatedAt: now,
      };
    } else {
      lists.unshift({
        id,
        name: displayName,
        updatedAt: now,
      });
    }

    localStorage.setItem(SAVED_LISTS_KEY, JSON.stringify(lists));
  } catch (e) {
    console.error("Failed to save list to localStorage:", e);
  }
}

export function removeSavedList(id: string): void {
  try {
    const lists = getSavedLists().filter((l) => l.id !== id);
    localStorage.setItem(SAVED_LISTS_KEY, JSON.stringify(lists));
    if (getActiveListId() === id) {
      localStorage.removeItem(ACTIVE_LIST_ID_KEY);
    }
  } catch (e) {
    console.error("Failed to remove list from localStorage:", e);
  }
}

export function getActiveListId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_LIST_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveListId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_LIST_ID_KEY, id);
  } catch (e) {
    console.error("Failed to set active list ID:", e);
  }
}

// --- Capability Observation Edit Tokens ---

export function getObservationTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OBSERVATION_TOKENS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function getObservationToken(observationId: string): string | null {
  const tokens = getObservationTokens();
  return tokens[observationId] || null;
}

export function saveObservationToken(observationId: string, token: string): void {
  try {
    const tokens = getObservationTokens();
    tokens[observationId] = token;
    localStorage.setItem(OBSERVATION_TOKENS_KEY, JSON.stringify(tokens));
  } catch (e) {
    console.error("Failed to save observation edit token:", e);
  }
}

export function removeObservationToken(observationId: string): void {
  try {
    const tokens = getObservationTokens();
    delete tokens[observationId];
    localStorage.setItem(OBSERVATION_TOKENS_KEY, JSON.stringify(tokens));
  } catch (e) {
    console.error("Failed to remove observation edit token:", e);
  }
}

export function hasObservationToken(observationId: string): boolean {
  return Boolean(getObservationToken(observationId));
}

// --- Recent Stores Storage ---

export function getRecentStores(): StoreResponse[] {
  try {
    const raw = localStorage.getItem(RECENT_STORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentStore(store: Partial<StoreResponse> & { name: string }): void {
  try {
    const recents = getRecentStores();
    const cleanName = store.name.trim();
    const cleanZip = store.zip_code?.trim() || null;

    // Filter out duplicate if same name and zip
    const filtered = recents.filter(
      (s) => !(s.name.toLowerCase() === cleanName.toLowerCase() && (s.zip_code || null) === cleanZip)
    );

    const storeEntry: StoreResponse = {
      id: store.id || `store-recent-${Date.now()}`,
      retailer_name: store.retailer_name || store.name,
      name: cleanName,
      sort_order: store.sort_order || 100,
      address: store.address || null,
      city: store.city || null,
      state: store.state || null,
      zip_code: cleanZip,
      is_unresolved_location: store.is_unresolved_location ?? (!cleanZip),
    };

    filtered.unshift(storeEntry);
    // Keep top 6 recent stores
    localStorage.setItem(RECENT_STORES_KEY, JSON.stringify(filtered.slice(0, 6)));
  } catch (e) {
    console.error("Failed to save recent store:", e);
  }
}

// --- Geographic ZIP Preference ---

export function getSelectedZipCode(): string | null {
  try {
    return localStorage.getItem(SELECTED_ZIP_KEY);
  } catch {
    return null;
  }
}

export function setSelectedZipCode(zip: string | null): void {
  try {
    if (zip && zip.trim()) {
      localStorage.setItem(SELECTED_ZIP_KEY, zip.trim());
    } else {
      localStorage.removeItem(SELECTED_ZIP_KEY);
    }
  } catch (e) {
    console.error("Failed to set selected ZIP:", e);
  }
}

// --- Staples Storage ---

export function getStaples(): StapleItem[] {
  try {
    const raw = localStorage.getItem(STAPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (it) => typeof it === "object" && it !== null && typeof it.product_id === "string"
      );
    }
    return [];
  } catch {
    return [];
  }
}

export function saveStaples(staples: StapleItem[]): void {
  try {
    localStorage.setItem(STAPLES_KEY, JSON.stringify(staples));
  } catch (e) {
    console.error("Failed to save staples to localStorage:", e);
  }
}

export function isStaple(productId: string): boolean {
  if (!productId) return false;
  const staples = getStaples();
  return staples.some((s) => s.product_id === productId);
}

export function getStaple(productId: string): StapleItem | null {
  if (!productId) return null;
  const staples = getStaples();
  return staples.find((s) => s.product_id === productId) || null;
}

export function addOrUpdateStaple(productId: string, preferredQuantity = 1, notes?: string): StapleItem {
  const staples = getStaples();
  const clampedQty = Math.max(1, Math.min(99, Math.round(preferredQuantity) || 1));
  const existingIdx = staples.findIndex((s) => s.product_id === productId);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    staples[existingIdx] = {
      ...staples[existingIdx],
      preferred_quantity: clampedQty,
      notes: notes !== undefined ? notes : staples[existingIdx].notes,
      last_used_at: now,
    };
    saveStaples(staples);
    return staples[existingIdx];
  } else {
    const newStaple: StapleItem = {
      product_id: productId,
      preferred_quantity: clampedQty,
      created_at: now,
      last_used_at: now,
      notes: notes || undefined,
    };
    staples.unshift(newStaple);
    saveStaples(staples);
    return newStaple;
  }
}

export function removeStaple(productId: string): void {
  const staples = getStaples().filter((s) => s.product_id !== productId);
  saveStaples(staples);
}

export function toggleStaple(productId: string, defaultQuantity = 1): boolean {
  if (isStaple(productId)) {
    removeStaple(productId);
    return false;
  } else {
    addOrUpdateStaple(productId, defaultQuantity);
    return true;
  }
}

export function setStapleQuantity(productId: string, quantity: number): void {
  const staples = getStaples();
  const existingIdx = staples.findIndex((s) => s.product_id === productId);
  if (existingIdx >= 0) {
    const clampedQty = Math.max(1, Math.min(99, Math.round(quantity) || 1));
    staples[existingIdx].preferred_quantity = clampedQty;
    staples[existingIdx].last_used_at = new Date().toISOString();
    saveStaples(staples);
  }
}

// --- Purchase History Storage ---

export function getPurchaseHistory(): PurchaseHistoryRecord[] {
  try {
    const raw = localStorage.getItem(PURCHASE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function savePurchaseHistory(
  record: Omit<PurchaseHistoryRecord, "id" | "recorded_at">
): PurchaseHistoryRecord {
  const history = getPurchaseHistory();
  const now = new Date().toISOString();
  const id = `trip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const fullRecord: PurchaseHistoryRecord = {
    ...record,
    id,
    recorded_at: now,
  };

  history.unshift(fullRecord);
  try {
    localStorage.setItem(PURCHASE_HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  } catch (e) {
    console.error("Failed to save purchase history to localStorage:", e);
  }
  return fullRecord;
}

export function deletePurchaseHistoryRecord(id: string): void {
  const history = getPurchaseHistory().filter((h) => h.id !== id);
  try {
    localStorage.setItem(PURCHASE_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to delete purchase history record:", e);
  }
}

export function clearPurchaseHistory(): void {
  try {
    localStorage.removeItem(PURCHASE_HISTORY_KEY);
  } catch (e) {
    console.error("Failed to clear purchase history:", e);
  }
}

