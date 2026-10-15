import { describe, it, expect, beforeEach } from "vitest";
import {
  getActiveListId,
  getSavedLists,
  removeSavedList,
  saveListMetadata,
  setActiveListId,
  getStaples,
  addOrUpdateStaple,
  removeStaple,
  toggleStaple,
  isStaple,
  getStaple,
  setStapleQuantity,
  getPurchaseHistory,
  savePurchaseHistory,
  deletePurchaseHistoryRecord,
  clearPurchaseHistory,
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

  describe("staples storage", () => {
    it("manages staples lifecycle with clamping and toggling", () => {
      expect(getStaples()).toEqual([]);
      expect(isStaple("prod-1")).toBe(false);

      // Add staple with default quantity 1
      const added = addOrUpdateStaple("prod-1");
      expect(added.product_id).toBe("prod-1");
      expect(added.preferred_quantity).toBe(1);
      expect(isStaple("prod-1")).toBe(true);

      // Clamping preferred quantity to range 1..99
      addOrUpdateStaple("prod-2", 150);
      expect(getStaple("prod-2")?.preferred_quantity).toBe(99);

      addOrUpdateStaple("prod-3", -5);
      expect(getStaple("prod-3")?.preferred_quantity).toBe(1);

      // setStapleQuantity clamps
      setStapleQuantity("prod-1", 5);
      expect(getStaple("prod-1")?.preferred_quantity).toBe(5);

      setStapleQuantity("prod-1", 120);
      expect(getStaple("prod-1")?.preferred_quantity).toBe(99);

      // Toggle off
      const toggledOff = toggleStaple("prod-1");
      expect(toggledOff).toBe(false);
      expect(isStaple("prod-1")).toBe(false);

      // Toggle on
      const toggledOn = toggleStaple("prod-1", 3);
      expect(toggledOn).toBe(true);
      expect(isStaple("prod-1")).toBe(true);
      expect(getStaple("prod-1")?.preferred_quantity).toBe(3);

      // Remove staple
      removeStaple("prod-1");
      expect(isStaple("prod-1")).toBe(false);
    });
  });

  describe("purchase history storage", () => {
    it("records and manages local shopping trips", () => {
      expect(getPurchaseHistory()).toEqual([]);

      const trip = savePurchaseHistory({
        trip_date: "2026-10-15",
        store_name: "Meijer #206",
        source: "receipt_scan",
        total_cents: 897,
        items: [
          { product_id: "prod-milk", product_name: "Whole Milk", price_cents: 299, quantity: 1 },
          { product_id: "prod-eggs", product_name: "Large Eggs", price_cents: 349, quantity: 1 },
        ],
      });

      expect(trip.id).toBeDefined();
      expect(trip.recorded_at).toBeDefined();

      const history = getPurchaseHistory();
      expect(history.length).toBe(1);
      expect(history[0].store_name).toBe("Meijer #206");
      expect(history[0].items.length).toBe(2);

      deletePurchaseHistoryRecord(trip.id);
      expect(getPurchaseHistory().length).toBe(0);

      savePurchaseHistory({
        trip_date: "2026-10-16",
        store_name: "ALDI #47",
        source: "manual_trip",
        total_cents: 549,
        items: [],
      });
      expect(getPurchaseHistory().length).toBe(1);
      clearPurchaseHistory();
      expect(getPurchaseHistory().length).toBe(0);
    });
  });
});
