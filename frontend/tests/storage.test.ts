import { describe, it, expect, beforeEach } from "vitest";
import {
  getActiveListId,
  getSavedLists,
  removeSavedList,
  saveListMetadata,
  setActiveListId,
} from "../src/lib/storage";

describe("storage utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and retrieves list metadata in localStorage", () => {
    expect(getSavedLists()).toEqual([]);

    saveListMetadata("list-1", "Weekly Staples");
    const lists = getSavedLists();
    expect(lists.length).toBe(1);
    expect(lists[0].id).toBe("list-1");
    expect(lists[0].name).toBe("Weekly Staples");
    expect(lists[0].updatedAt).toBeDefined();

    // Updating existing
    saveListMetadata("list-1", "Weekly Groceries");
    const updated = getSavedLists();
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe("Weekly Groceries");
  });

  it("removes a saved list", () => {
    saveListMetadata("list-1", "List 1");
    saveListMetadata("list-2", "List 2");
    expect(getSavedLists().length).toBe(2);

    removeSavedList("list-1");
    const lists = getSavedLists();
    expect(lists.length).toBe(1);
    expect(lists[0].id).toBe("list-2");
  });

  it("tracks active list id", () => {
    expect(getActiveListId()).toBeNull();
    setActiveListId("list-abc");
    expect(getActiveListId()).toBe("list-abc");
  });
});
