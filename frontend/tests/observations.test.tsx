import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecordPriceModal } from "../src/components/RecordPriceModal";
import { ProductPricesModal } from "../src/components/ProductPricesModal";
import { ComparisonResults } from "../src/components/ComparisonResults";
import { api } from "../src/api/client";
import { ComparisonResponse, Product } from "../src/types";

vi.mock("../src/api/client", () => ({
  api: {
    searchProducts: vi.fn(),
    createPriceObservation: vi.fn(),
    updatePriceObservation: vi.fn(),
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
  });

  it("renders with preselected product and saves a price observation", async () => {
    const handleClose = vi.fn();
    const handleSaved = vi.fn();
    vi.mocked(api.createPriceObservation).mockResolvedValueOnce({
      id: "obs-1",
      product_id: "prod-milk-gal",
      product_name: "Whole Milk",
      product_brand: "Dairy Pure",
      store_id: "store-meijer",
      store_name: "Meijer",
      price_cents: 349,
      formatted_price: "$3.49",
      observation_date: "2026-10-15",
      is_promotional: false,
      is_stale: false,
      notes: null,
      source: "user_contributed",
      source_attribution: "User-entered observation",
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

    expect(screen.getByText("Record Store Shelf Price")).toBeInTheDocument();
    expect(screen.getByText("Whole Milk")).toBeInTheDocument();
    expect(screen.getByText(/Price Attribution & Consumer Disclaimer/i)).toBeInTheDocument();

    // Select store via chip
    const meijerChip = screen.getByRole("button", { name: "Meijer" });
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
          store_name: "Meijer",
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

  it("renders store price comparisons, highlights lowest price, and flags stale entries", async () => {
    vi.mocked(api.compareProductStorePrices).mockResolvedValueOnce({
      product: sampleProduct,
      observations: [
        {
          id: "obs-1",
          product_id: "prod-eggs-dozen",
          product_name: "Large Eggs",
          product_brand: "Farm Fresh",
          store_id: "s1",
          store_name: "ALDI",
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
          store_name: "Costco",
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
      expect(screen.getByText("ALDI")).toBeInTheDocument();
      expect(screen.getByText("$2.19")).toBeInTheDocument();
      expect(screen.getByText("Lowest Price")).toBeInTheDocument();
      expect(screen.getByText("Costco")).toBeInTheDocument();
      expect(screen.getByText("$2.89")).toBeInTheDocument();
      expect(screen.getByText(/Stale \(>30d\)/i)).toBeInTheDocument();
    });
  });
});

describe("ComparisonResults provenance and source switching", () => {
  const sampleComparison: ComparisonResponse = {
    one_store_plan: {
      is_complete: true,
      stores: [{ id: "s1", retailer_name: "Fresh Basket", name: "Fresh Basket", sort_order: 1 }],
      items: [],
      total_cents: 1000,
      missing_products: [],
    },
    best_plan: {
      is_complete: true,
      stores: [{ id: "s1", retailer_name: "Fresh Basket", name: "Fresh Basket", sort_order: 1 }],
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

  it("renders user observation provenance badge and notice", () => {
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

    // Click Demo Data button to switch source
    const demoBtn = screen.getByRole("button", { name: "Demo Data" });
    fireEvent.click(demoBtn);
    expect(handleSwitch).toHaveBeenCalledWith("demonstration");
  });
});
