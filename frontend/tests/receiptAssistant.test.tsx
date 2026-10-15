import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordPriceModal } from "../src/components/RecordPriceModal";
import { ComparisonResults } from "../src/components/ComparisonResults";
import { api } from "../src/api/client";
import * as ocrService from "../src/lib/ocrService";
import { ComparisonResponse, Product } from "../src/types";

vi.mock("../src/api/client", () => ({
  api: {
    searchProducts: vi.fn(),
    getProducts: vi.fn(),
    createPriceObservation: vi.fn(),
    createBatchPriceObservations: vi.fn(),
    updatePriceObservation: vi.fn(),
    deletePriceObservation: vi.fn(),
    getStores: vi.fn(),
    compareProductStorePrices: vi.fn(),
  },
}));

vi.mock("../src/lib/ocrService", () => ({
  recognizeReceiptText: vi.fn(),
  preprocessReceiptImage: vi.fn(),
}));

describe("Receipt Assistant & Regional Comparison", () => {
  const mockCatalog: Product[] = [
    {
      id: "prod-milk-gal",
      name: "Whole Milk",
      brand: "Dairy Pure",
      package_quantity: "1",
      package_unit: "gal",
      aliases: ["whole milk", "milk"],
    },
    {
      id: "prod-eggs-dozen",
      name: "Grade A Large White Eggs",
      brand: "Eggland's Best",
      package_quantity: "12",
      package_unit: "ct",
      aliases: ["eggs", "large eggs"],
    },
    {
      id: "prod-bread-white",
      name: "Classic White Bread",
      brand: "Wonder",
      package_quantity: "20",
      package_unit: "oz",
      aliases: ["bread", "white bread"],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(api.getProducts).mockResolvedValue(mockCatalog);
  });

  it("processes receipt photo client-side, excludes Michigan deposits, displays confidence pills, and allows human correction", async () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    // Mock OCR text with Michigan bottle deposit and transaction noise
    const simulatedOcr = `
MEIJER #206
36865 26 MILE RD
LENOX MI 48042
10/15/2026

WHOLE MILK GAL 3.49
MI DEP .10
GRADE A LARGE EGGS 2.69
SUBTOTAL 6.28
TAX 0.00
TOTAL 6.28
VISA 1234
    `.trim();

    vi.mocked(ocrService.recognizeReceiptText).mockResolvedValueOnce(simulatedOcr);

    vi.mocked(api.createBatchPriceObservations).mockResolvedValueOnce({
      created_count: 2,
      store: {
        id: "store-meijer-48042",
        retailer_name: "Meijer",
        name: "Meijer #206",
        sort_order: 1,
        city: "Lenox",
        state: "MI",
        zip_code: "48042",
        is_unresolved_location: false,
      },
      observations: [
        {
          id: "obs-1",
          product_id: "prod-milk-gal",
          product_name: "Whole Milk",
          product_brand: "Dairy Pure",
          store_id: "store-meijer-48042",
          store_name: "Meijer #206",
          price_cents: 349,
          formatted_price: "$3.49",
          observation_date: "2026-10-15",
          is_promotional: false,
          is_stale: false,
          notes: null,
          source: "user_contributed",
          source_attribution: "User-entered observation",
          edit_token: "tok_test_1",
          created_at: "2026-10-15T12:00:00Z",
          updated_at: "2026-10-15T12:00:00Z",
        },
        {
          id: "obs-2",
          product_id: "prod-eggs-dozen",
          product_name: "Grade A Large White Eggs",
          product_brand: "Eggland's Best",
          store_id: "store-meijer-48042",
          store_name: "Meijer #206",
          price_cents: 250, // user-corrected price
          formatted_price: "$2.50",
          observation_date: "2026-10-15",
          is_promotional: false,
          is_stale: false,
          notes: null,
          source: "user_contributed",
          source_attribution: "User-entered observation",
          edit_token: "tok_test_2",
          created_at: "2026-10-15T12:00:00Z",
          updated_at: "2026-10-15T12:00:00Z",
        },
      ],
    });

    render(
      <RecordPriceModal
        isOpen={true}
        onClose={handleClose}
        initialProduct={null}
        onSaved={handleSaved}
      />
    );

    // Switch to Shopping Trip mode
    const tripTab = screen.getByRole("button", { name: /Shopping Trip/i });
    fireEvent.click(tripTab);

    // Verify Private Receipt Assistant banner is displayed
    expect(screen.getByText(/Private Receipt Assistant/i)).toBeInTheDocument();
    expect(screen.getByText("Zero Cloud Uploads")).toBeInTheDocument();

    // Trigger receipt photo upload
    const file = new File(["dummy image bytes"], "receipt.jpg", { type: "image/jpeg" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // Store name and ZIP should auto-populate from receipt
      const storeInput = screen.getByLabelText(/Store Name/i) as HTMLInputElement;
      expect(storeInput.value).toBe("Meijer");
      const zipInput = screen.getByLabelText(/ZIP Code/i) as HTMLInputElement;
      expect(zipInput.value).toBe("48042");

      // Extracted items list
      expect(screen.getByText(/Items in this Shopping Trip \(2\)/i)).toBeInTheDocument();
      // Michigan deposit must NOT be present as an item
      expect(screen.queryByText(/MI DEP/i)).toBeNull();

      // Confidence pills
      const matchedPills = screen.getAllByText("✓ Matched");
      expect(matchedPills.length).toBe(2);
    });

    // Shopper corrects the eggs price from 2.69 to 2.50
    const priceInputs = screen.getAllByRole("spinbutton");
    // Find the eggs price input (the second price input in review list)
    const eggsPriceInput = priceInputs[priceInputs.length - 1];
    fireEvent.change(eggsPriceInput, { target: { value: "2.50" } });

    // Confirm and save the shopping trip
    const recordBtn = screen.getByRole("button", { name: /Record Entire Trip/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(api.createBatchPriceObservations).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: "Meijer",
          zip_code: "48042",
          items: [
            expect.objectContaining({ product_id: "prod-milk-gal", price_cents: 349 }),
            expect.objectContaining({ product_id: "prod-eggs-dozen", price_cents: 250 }),
          ],
        })
      );
      expect(handleSaved).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("renders regional comparison toggle and displays participating pilot ZIPs", () => {
    const handleSetRegionScope = vi.fn();
    const handleBack = vi.fn();

    const mockComparison: ComparisonResponse = {
      one_store_plan: {
        is_complete: true,
        stores: [
          {
            id: "store-meijer-48042",
            retailer_name: "Meijer",
            name: "Meijer #206",
            city: "Lenox",
            state: "MI",
            zip_code: "48042",
            sort_order: 1,
            is_unresolved_location: false,
          },
        ],
        items: [],
        total_cents: 650,
        missing_products: [],
      },
      best_plan: {
        is_complete: true,
        stores: [
          {
            id: "store-kroger-48051",
            retailer_name: "Kroger",
            name: "Kroger #456",
            city: "Chesterfield",
            state: "MI",
            zip_code: "48051",
            sort_order: 2,
            is_unresolved_location: false,
          },
        ],
        items: [],
        total_cents: 580,
        missing_products: [],
      },
      savings_cents: 70,
      additional_stops: 0,
      pricing_source: "user_contributed",
      pricing_source_label: "User-Entered Observations",
      is_demonstration: false,
      data_notice: "Prices are user observations for 48042 and nearby pilot stores.",
      zip_code: "48042",
      region_scope: "neighborhood",
      compared_zip_codes: ["48042", "48051", "48315"],
    };

    render(
      <ComparisonResults
        comparison={mockComparison}
        onBackToList={handleBack}
        onSetRegionScope={handleSetRegionScope}
      />
    );

    // Verify regional pilot ZIP notice
    expect(
      screen.getByText(/Regional comparison includes physical stores across ZIPs: 48042, 48051, 48315/i)
    ).toBeInTheDocument();

    // Verify "This ZIP" vs "Nearby Stores" toggle
    const thisZipBtn = screen.getByRole("button", { name: /This ZIP/i });
    const nearbyBtn = screen.getByRole("button", { name: /Nearby Stores/i });

    expect(thisZipBtn).toBeInTheDocument();
    expect(nearbyBtn).toHaveClass("active");

    // Clicking "This ZIP" triggers onSetRegionScope("exact")
    fireEvent.click(thisZipBtn);
    expect(handleSetRegionScope).toHaveBeenCalledWith("exact");
  });
});
