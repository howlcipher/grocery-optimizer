import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordPriceModal } from "../src/components/RecordPriceModal";
import { ProductPricesModal } from "../src/components/ProductPricesModal";
import { ComparisonResults } from "../src/components/ComparisonResults";
import { api } from "../src/api/client";
import { saveObservationToken } from "../src/lib/storage";
import { ComparisonResponse, Product } from "../src/types";

vi.mock("../src/api/client", () => ({
  api: {
    searchProducts: vi.fn(),
    createPriceObservation: vi.fn(),
    updatePriceObservation: vi.fn(),
    createBatchPriceObservations: vi.fn(),
    deletePriceObservation: vi.fn(),
    getStores: vi.fn(),
    compareProductStorePrices: vi.fn(),
  },
}));

describe("RecordPriceModal component", () => {
  const sampleProduct: Product = {
    id: "prod-milk-gal",
    name: "Whole Milk",
    brand: "Dairy Pure",
    package_quantity: "1",
    package_unit: "gal",
    aliases: ["milk"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders with preselected product and saves a price observation with locality", async () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();
    vi.mocked(api.createPriceObservation).mockResolvedValueOnce({
      id: "obs-1",
      product_id: "prod-milk-gal",
      product_name: "Whole Milk",
      product_brand: "Dairy Pure",
      store_id: "store-meijer-48042",
      store_name: "Meijer #206",
      store_city: "Lenox",
      store_zip_code: "48042",
      price_cents: 349,
      formatted_price: "$3.49",
      observation_date: "2026-10-15",
      is_promotional: false,
      is_stale: false,
      notes: null,
      source: "user_contributed",
      source_attribution: "User-entered observation",
      edit_token: "tok_sample_edit_capability_12345",
      created_at: "2026-10-15T12:00:00Z",
      updated_at: "2026-10-15T12:00:00Z",
    });

    render(
      <RecordPriceModal
        isOpen={true}
        onClose={handleClose}
        initialProduct={sampleProduct}
        onSaved={handleSaved}
      />
    );

    expect(screen.getByText("Record Store Prices")).toBeInTheDocument();
    expect(screen.getByText("Whole Milk")).toBeInTheDocument();
    expect(screen.getByText(/Capability-Based Trust & Privacy/i)).toBeInTheDocument();

    // Select store via pilot chip (Meijer Lenox 48042)
    const meijerChip = screen.getByRole("button", { name: /Meijer \(Lenox 48042\)/i });
    fireEvent.click(meijerChip);

    // Enter price
    const priceInput = screen.getByLabelText(/Observed Price/i);
    fireEvent.change(priceInput, { target: { value: "3.49" } });

    // Submit form
    const submitBtn = screen.getByRole("button", { name: "Save Price Observation" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createPriceObservation).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: "prod-milk-gal",
          store_name: "Meijer #206",
          city: "Lenox",
          zip_code: "48042",
          price_cents: 349,
        })
      );
      expect(handleSaved).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("validates invalid price bounds before submitting", async () => {
    render(
      <RecordPriceModal
        isOpen={true}
        onClose={vi.fn()}
        initialProduct={sampleProduct}
        initialStoreName="ALDI"
      />
    );

    const priceInput = screen.getByLabelText(/Observed Price/i);
    // Enter invalid $0 price
    fireEvent.change(priceInput, { target: { value: "0" } });

    const submitBtn = screen.getByRole("button", { name: "Save Price Observation" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/between \$0\.01 and \$500\.00/i)).toBeInTheDocument();
      expect(api.createPriceObservation).not.toHaveBeenCalled();
    });
  });

  it("switches to Shopping Trip mode and submits batch observations", async () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();

    vi.mocked(api.searchProducts).mockResolvedValue([
      {
        id: "prod-bread",
        name: "Whole Wheat Bread",
        brand: "Nature's Own",
        package_quantity: "20",
        package_unit: "oz",
        aliases: ["bread"],
      },
    ]);

    vi.mocked(api.createBatchPriceObservations).mockResolvedValueOnce({
      created_count: 1,
      store: {
        id: "store-aldi-48051",
        name: "ALDI #45",
        retailer_name: "ALDI",
        city: "Chesterfield",
        state: "MI",
        zip_code: "48051",
        sort_order: 1,
        is_unresolved_location: false,
      },
      observations: [
        {
          id: "obs-batch-1",
          product_id: "prod-bread",
          product_name: "Whole Wheat Bread",
          product_brand: "Nature's Own",
          store_id: "store-aldi-48051",
          store_name: "ALDI",
          price_cents: 229,
          formatted_price: "$2.29",
          observation_date: "2026-10-15",
          is_promotional: false,
          is_stale: false,
          notes: null,
          source: "user_contributed",
          source_attribution: "User-entered observation",
          edit_token: "tok_batch_123",
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
    const tripModeBtn = screen.getByRole("button", { name: /Shopping Trip \(Multi-Item\)/i });
    fireEvent.click(tripModeBtn);

    expect(screen.getByText(/Items in this Shopping Trip \(0\)/i)).toBeInTheDocument();

    // Select ALDI pilot chip
    const aldiChip = screen.getByRole("button", { name: /ALDI \(Chesterfield 48051\)/i });
    fireEvent.click(aldiChip);

    // Search and select product
    const productSearchInput = screen.getByPlaceholderText(/Search product from receipt/i);
    fireEvent.change(productSearchInput, { target: { value: "Bread" } });

    await waitFor(() => {
      expect(screen.getByText("Whole Wheat Bread")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Whole Wheat Bread"));

    // Enter item price
    const tripPriceInput = screen.getByPlaceholderText("Price ($)");
    fireEvent.change(tripPriceInput, { target: { value: "2.29" } });

    // Add item to trip list
    const addItemBtn = screen.getByRole("button", { name: /\+ Add Item/i });
    fireEvent.click(addItemBtn);

    // Verify item appears in staged list
    expect(screen.getByText(/Items in this Shopping Trip \(1\)/i)).toBeInTheDocument();

    // Submit batch trip
    const submitTripBtn = screen.getByRole("button", { name: /Record Entire Trip/i });
    fireEvent.click(submitTripBtn);

    await waitFor(() => {
      expect(api.createBatchPriceObservations).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: "ALDI #47",
          city: "Chesterfield",
          zip_code: "48051",
          items: [
            expect.objectContaining({
              product_id: "prod-bread",
              price_cents: 229,
            }),
          ],
        })
      );
      expect(handleSaved).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });
});

describe("ProductPricesModal component", () => {
  const sampleProduct: Product = {
    id: "prod-eggs-dozen",
    name: "Large Eggs",
    brand: "Farm Fresh",
    package_quantity: "12",
    package_unit: "ct",
    aliases: [],
  };

  it("renders store price comparisons, shows locality, identifies user's entry, and flags stale", async () => {
    // Save ownership token for obs-1
    saveObservationToken("obs-1", "my-secret-token");

    vi.mocked(api.compareProductStorePrices).mockResolvedValueOnce({
      product: sampleProduct,
      observations: [
        {
          id: "obs-1",
          product_id: "prod-eggs-dozen",
          product_name: "Large Eggs",
          product_brand: "Farm Fresh",
          store_id: "s1",
          store_name: "ALDI #45",
          store_city: "Chesterfield",
          store_state: "MI",
          store_zip_code: "48051",
          is_unresolved_location: false,
          price_cents: 219,
          formatted_price: "$2.19",
          observation_date: "2026-10-14",
          is_promotional: false,
          is_stale: false,
          notes: null,
          source: "user_contributed",
          source_attribution: "User-entered observation",
          created_at: "2026-10-14T10:00:00Z",
          updated_at: "2026-10-14T10:00:00Z",
        },
        {
          id: "obs-2",
          product_id: "prod-eggs-dozen",
          product_name: "Large Eggs",
          product_brand: "Farm Fresh",
          store_id: "s2",
          store_name: "Costco #1128",
          store_city: "Shelby",
          store_state: "MI",
          store_zip_code: "48315",
          is_unresolved_location: false,
          price_cents: 289,
          formatted_price: "$2.89",
          observation_date: "2026-08-01",
          is_promotional: false,
          is_stale: true,
          notes: "Older shelf price",
          source: "user_contributed",
          source_attribution: "User-entered observation",
          created_at: "2026-08-01T10:00:00Z",
          updated_at: "2026-08-01T10:00:00Z",
        },
      ],
      cheapest_observation: null,
      store_count: 2,
      source: "user_contributed",
      disclaimer: "Consumer observed prices for testing",
    });

    render(
      <ProductPricesModal
        isOpen={true}
        onClose={vi.fn()}
        product={sampleProduct}
        onRecordPriceForProduct={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Prices observed across")).toBeInTheDocument();
      expect(screen.getByText("ALDI #45")).toBeInTheDocument();
      expect(screen.getByText("$2.19")).toBeInTheDocument();
      expect(screen.getByText("Lowest Price")).toBeInTheDocument();
      expect(screen.getByText("Your Entry")).toBeInTheDocument();
      expect(screen.getByText(/Chesterfield, MI 48051/i)).toBeInTheDocument();
      expect(screen.getByText("Costco #1128")).toBeInTheDocument();
      expect(screen.getByText("$2.89")).toBeInTheDocument();
      expect(screen.getByText(/Stale \(>30d\)/i)).toBeInTheDocument();
    });
  });
});

describe("ComparisonResults provenance and source switching", () => {
  const sampleComparison: ComparisonResponse = {
    one_store_plan: {
      is_complete: true,
      stores: [{
        id: "s1",
        retailer_name: "Fresh Basket",
        name: "Fresh Basket",
        city: "Lenox",
        state: "MI",
        zip_code: "48042",
        sort_order: 1,
      }],
      items: [],
      total_cents: 1000,
      missing_products: [],
    },
    best_plan: {
      is_complete: true,
      stores: [{
        id: "s1",
        retailer_name: "Fresh Basket",
        name: "Fresh Basket",
        city: "Lenox",
        state: "MI",
        zip_code: "48042",
        sort_order: 1,
      }],
      items: [],
      total_cents: 1000,
      missing_products: [],
    },
    savings_cents: 0,
    additional_stops: 0,
    pricing_source: "user_contributed",
    pricing_source_label: "User-Entered Observations",
    is_demonstration: false,
    data_notice: "Prices are user observations. Never mixed with synthetic data.",
  };

  it("renders user observation provenance badge, locality, and notice", () => {
    const handleSwitch = vi.fn();
    render(
      <ComparisonResults
        comparison={sampleComparison}
        onBackToList={vi.fn()}
        onSwitchSource={handleSwitch}
      />
    );

    expect(screen.getByText("User-Entered Observations")).toBeInTheDocument();
    expect(screen.getByText(/Never mixed with synthetic data/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Lenox, MI 48042/i).length).toBeGreaterThan(0);

    // Click Demo Data button to switch source
    const demoBtn = screen.getByRole("button", { name: "Demo Data" });
    fireEvent.click(demoBtn);
    expect(handleSwitch).toHaveBeenCalledWith("demonstration");
  });
});
