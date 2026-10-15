import { SavedListMetadata } from "../types";

const SAVED_LISTS_KEY = "grocery_optimizer_saved_lists";
const ACTIVE_LIST_ID_KEY = "grocery_optimizer_active_list_id";

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
