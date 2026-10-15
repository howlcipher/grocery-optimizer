import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComparisonResults } from "../src/components/ComparisonResults";
import { GroceryList } from "../src/components/GroceryList";
import { ProductSearch } from "../src/components/ProductSearch";
import { api } from "../src/api/client";
import { ComparisonResponse, GroceryList as GroceryListType } from "../src/types";

describe("ComparisonResults component", () => {
  const mockComparison: ComparisonResponse = {
    one_store_plan: {
      is_complete: true,
      stores: [{ id: "s1", retailer_name: "Fresh Basket", name: "Fresh Basket Northside", sort_order: 10 }],
      items: [],
      total_cents: 7218,
      missing_products: [],
    },
    best_plan: {
      is_complete: true,
      stores: [
        { id: "s1", retailer_name: "Fresh Basket", name: "Fresh Basket Northside", sort_order: 10 },
        { id: "s3", retailer_name: "Value Foods", name: "Value Foods Eastgate", sort_order: 30 },
      ],
      items: [
        {
          product_id: "p1",
          product_name: "Whole Milk",
          store_id: "s3",
          store_name: "Value Foods Eastgate",
          quantity: 1,
          unit_price_cents: 329,
          regular_price_cents: 329,
          is_on_sale: false,
          subtotal_cents: 329,
        },
        {
          product_id: "p2",
          product_name: "Cheerios Original",
          store_id: "s1",
          store_name: "Fresh Basket Northside",
          quantity: 1,
          unit_price_cents: 449,
          regular_price_cents: 549,
          is_on_sale: true,
          subtotal_cents: 449,
        },
      ],
      total_cents: 6594,
      missing_products: [],
    },
    savings_cents: 624,
    additional_stops: 1,
  };

  it("renders one-store total, cheapest overall total, and savings badge", () => {
    const handleBack = vi.fn();
    render(<ComparisonResults comparison={mockComparison} onBackToList={handleBack} />);

    expect(screen.getByText("Best One-Store Trip")).toBeInTheDocument();
    expect(screen.getByText("$72.18")).toBeInTheDocument();

    expect(screen.getByText("Cheapest Overall")).toBeInTheDocument();
    expect(screen.getByText("$65.94")).toBeInTheDocument();
    expect(screen.getByText("Save $6.24")).toBeInTheDocument();
    expect(screen.getByText("1 additional stop")).toBeInTheDocument();

    // Store grouping headers
    expect(screen.getByText("Buy at Value Foods Eastgate")).toBeInTheDocument();
    expect(screen.getByText("Buy at Fresh Basket Northside")).toBeInTheDocument();

    // Items
    expect(screen.getByText("Whole Milk")).toBeInTheDocument();
    expect(screen.getByText("Cheerios Original")).toBeInTheDocument();
    expect(screen.getByText("Sale")).toBeInTheDocument();

    // Back button
    fireEvent.click(screen.getByLabelText("Back to editing grocery list"));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("renders message when no single store has everything", () => {
    const comparisonWithNoSingleStore: ComparisonResponse = {
      ...mockComparison,
      one_store_plan: {
        is_complete: false,
        stores: [],
        items: [],
        total_cents: 0,
        missing_products: [],
      },
      savings_cents: null,
    };

    render(
      <ComparisonResults
        comparison={comparisonWithNoSingleStore}
        onBackToList={vi.fn()}
      />
    );

    expect(
      screen.getByText("No single store has everything on your list.")
    ).toBeInTheDocument();
  });

  it("renders error alert when basket cannot be fulfilled", () => {
    const unfulfillable: ComparisonResponse = {
      one_store_plan: {
        is_complete: false,
        stores: [],
        items: [],
        total_cents: 0,
        missing_products: [],
      },
      best_plan: {
        is_complete: false,
        stores: [],
        items: [],
        total_cents: 0,
        missing_products: [
          {
            id: "p-df",
            name: "Dragonfruit",
            brand: "Exotic Farms",
            package_quantity: "1",
            package_unit: "ct",
            aliases: [],
          },
        ],
      },
      savings_cents: null,
      additional_stops: 0,
    };

    render(
      <ComparisonResults comparison={unfulfillable} onBackToList={vi.fn()} />
    );

    expect(
      screen.getByText("No Complete Shopping Plan Found")
    ).toBeInTheDocument();
    expect(screen.getByText("Dragonfruit")).toBeInTheDocument();
  });
});

describe("GroceryList component", () => {
  const mockList: GroceryListType = {
    id: "list-1",
    name: "My Weekend Groceries",
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    items: [
      {
        id: "item-1",
        product_id: "prod-milk",
        quantity: 2,
        product: {
          id: "prod-milk",
          name: "Whole Milk",
          brand: "Dairy Pure",
          package_quantity: "1",
          package_unit: "gal",
          aliases: [],
        },
        created_at: "2026-10-14T00:00:00Z",
        updated_at: "2026-10-14T00:00:00Z",
      },
    ],
  };

  it("renders list items and handles interactions", () => {
    const handleUpdateName = vi.fn();
    const handleUpdateQuantity = vi.fn();
    const handleRemoveItem = vi.fn();
    const handleCompare = vi.fn();

    render(
      <GroceryList
        list={mockList}
        onUpdateListName={handleUpdateName}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onComparePrices={handleCompare}
        isComparing={false}
      />
    );

    expect(screen.getByText("Whole Milk")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Increment
    fireEvent.click(screen.getByLabelText("Increase quantity of Whole Milk"));
    expect(handleUpdateQuantity).toHaveBeenCalledWith("item-1", 3);

    // Decrement
    fireEvent.click(screen.getByLabelText("Decrease quantity of Whole Milk"));
    expect(handleUpdateQuantity).toHaveBeenCalledWith("item-1", 1);

    // Remove
    fireEvent.click(screen.getByLabelText("Remove Whole Milk from list"));
    expect(handleRemoveItem).toHaveBeenCalledWith("item-1");

    // Compare prices
    fireEvent.click(screen.getByLabelText("Compare prices across stores"));
    expect(handleCompare).toHaveBeenCalledTimes(1);
  });
});

describe("ProductSearch component", () => {
  it("renders search input, queries suggestions, and selects item via click", async () => {
    const handleSelect = vi.fn();
    const mockProducts = [
      {
        id: "p1",
        name: "Whole Milk",
        brand: "Dairy Pure",
        package_quantity: "1",
        package_unit: "gal",
        aliases: [],
      },
    ];

    vi.spyOn(api, "searchProducts").mockResolvedValue(mockProducts);

    render(<ProductSearch onSelectProduct={handleSelect} />);

    const input = screen.getByPlaceholderText(/search milk, eggs/i);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "milk" } });

    // Wait for suggestions to appear
    const suggestion = await screen.findByText("Whole Milk");
    expect(suggestion).toBeInTheDocument();

    // Click to select
    fireEvent.click(suggestion);
    expect(handleSelect).toHaveBeenCalledWith(mockProducts[0]);
    expect((input as HTMLInputElement).value).toBe("");
  });
});

