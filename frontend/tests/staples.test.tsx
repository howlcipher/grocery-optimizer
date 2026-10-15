import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StaplesDrawer } from "../src/components/StaplesDrawer";
import { PostTripStaplesModal } from "../src/components/PostTripStaplesModal";
import { StapleItem, Product } from "../src/types";

// Mock api.getPriceObservations
vi.mock("../src/api/client", () => ({
  api: {
    getPriceObservations: vi.fn().mockResolvedValue([]),
  },
}));

const mockProducts: Product[] = [
  {
    id: "prod-milk",
    name: "Whole Milk 1 Gallon",
    brand: "Prairie Farms",
    package_quantity: "1",
    package_unit: "gallon",
    aliases: ["milk"],
  },
  {
    id: "prod-eggs",
    name: "Large Grade A Eggs 12ct",
    brand: "Eggland's Best",
    package_quantity: "12",
    package_unit: "count",
    aliases: ["eggs"],
  },
];

describe("StaplesDrawer Component", () => {
  it("renders empty state when no staples are saved", () => {
    render(
      <StaplesDrawer
        isOpen={true}
        onClose={vi.fn()}
        staples={[]}
        catalogProducts={mockProducts}
        onToggleStaple={vi.fn()}
        onUpdateStapleQuantity={vi.fn()}
        onAddStapleToList={vi.fn()}
        onAddAllStaplesToList={vi.fn()}
      />
    );

    expect(screen.getByText(/No staples saved yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Star items from your grocery list/i)).toBeInTheDocument();
  });

  it("renders saved staples with product names and allows quantity modifications", () => {
    const handleUpdateQuantity = vi.fn();
    const handleAddToList = vi.fn();
    const handleToggleStaple = vi.fn();
    const handleAddAll = vi.fn();

    const mockStaples: StapleItem[] = [
      {
        product_id: "prod-milk",
        preferred_quantity: 2,
        created_at: "2026-10-15T10:00:00Z",
      },
    ];

    render(
      <StaplesDrawer
        isOpen={true}
        onClose={vi.fn()}
        staples={mockStaples}
        catalogProducts={mockProducts}
        onToggleStaple={handleToggleStaple}
        onUpdateStapleQuantity={handleUpdateQuantity}
        onAddStapleToList={handleAddToList}
        onAddAllStaplesToList={handleAddAll}
      />
    );

    expect(screen.getByText("Whole Milk 1 Gallon")).toBeInTheDocument();
    expect(screen.getByText("Prairie Farms • 1 gallon")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Increment quantity
    const plusButton = screen.getByLabelText("Increase preferred quantity");
    fireEvent.click(plusButton);
    expect(handleUpdateQuantity).toHaveBeenCalledWith("prod-milk", 3);

    // Decrement quantity
    const minusButton = screen.getByLabelText("Decrease preferred quantity");
    fireEvent.click(minusButton);
    expect(handleUpdateQuantity).toHaveBeenCalledWith("prod-milk", 1);

    // Add single to list
    const addBtn = screen.getByText("+ Add to List");
    fireEvent.click(addBtn);
    expect(handleAddToList).toHaveBeenCalledWith("prod-milk", 2);

    // Add all to list
    const addAllBtn = screen.getByText(/Add All Staples to List/i);
    fireEvent.click(addAllBtn);
    expect(handleAddAll).toHaveBeenCalled();

    // Remove staple
    const removeBtn = screen.getByLabelText("Remove Whole Milk 1 Gallon from staples");
    fireEvent.click(removeBtn);
    expect(handleToggleStaple).toHaveBeenCalledWith("prod-milk");
  });
});

describe("PostTripStaplesModal Component", () => {
  it("renders candidates and allows selecting and saving new staples", () => {
    const handleSave = vi.fn();
    const handleClose = vi.fn();

    const candidates = [
      {
        product_id: "prod-milk",
        product_name: "Whole Milk 1 Gallon",
        quantity: 1,
      },
      {
        product_id: "prod-eggs",
        product_name: "Large Grade A Eggs 12ct",
        quantity: 2,
      },
    ];

    render(
      <PostTripStaplesModal
        isOpen={true}
        onClose={handleClose}
        items={candidates}
        onSaveStaples={handleSave}
      />
    );

    expect(screen.getByText("Trip Recorded! Save to My Staples?")).toBeInTheDocument();
    expect(screen.getByText("Whole Milk 1 Gallon")).toBeInTheDocument();
    expect(screen.getByText("Large Grade A Eggs 12ct")).toBeInTheDocument();

    // Save selected staples
    const saveButton = screen.getByRole("button", { name: /Add Selected to Staples/i });
    fireEvent.click(saveButton);

    expect(handleSave).toHaveBeenCalledWith([
      { product_id: "prod-milk", quantity: 1 },
      { product_id: "prod-eggs", quantity: 2 },
    ]);
  });

  it("allows deselecting candidates before saving", () => {
    const handleSave = vi.fn();

    const candidates = [
      {
        product_id: "prod-milk",
        product_name: "Whole Milk 1 Gallon",
        quantity: 1,
      },
      {
        product_id: "prod-eggs",
        product_name: "Large Grade A Eggs 12ct",
        quantity: 2,
      },
    ];

    render(
      <PostTripStaplesModal
        isOpen={true}
        onClose={vi.fn()}
        items={candidates}
        onSaveStaples={handleSave}
      />
    );

    // Uncheck milk
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    const saveButton = screen.getByRole("button", { name: /Add Selected to Staples/i });
    fireEvent.click(saveButton);

    expect(handleSave).toHaveBeenCalledWith([
      { product_id: "prod-eggs", quantity: 2 },
    ]);
  });
});
