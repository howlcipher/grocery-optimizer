import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComparisonResults } from "../src/components/ComparisonResults";
import { CreateProductModal } from "../src/components/CreateProductModal";
import { PriceImportModal } from "../src/components/PriceImportModal";
import { BackupRestoreModal } from "../src/components/BackupRestoreModal";
import { ComparisonResponse } from "../src/types";
import { api } from "../src/api/client";

vi.mock("../src/api/client", () => ({
  api: {
    createProduct: vi.fn(),
    parsePriceImport: vi.fn(),
    createBatchPriceObservations: vi.fn(),
    getStores: vi.fn().mockResolvedValue([
      { id: "store-kr", name: "Kroger #456", retailer_name: "Kroger", sort_order: 1 },
      { id: "store-mj", name: "Meijer #206", retailer_name: "Meijer", sort_order: 2 },
    ]),
    getProducts: vi.fn().mockResolvedValue([
      { id: "p1", name: "Whole Milk", brand: "Kroger", package_quantity: "1", package_unit: "gal", aliases: [] },
    ]),
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
  },
}));

describe("Mission 006 Frontend Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ComparisonResults Kroger vs Meijer Hunter", () => {
    const mockM006Comparison: ComparisonResponse = {
      one_store_plan: {
        is_complete: true,
        stores: [{ id: "s-kr", name: "Kroger #456", retailer_name: "Kroger", sort_order: 1 }],
        items: [
          {
            product_id: "p1",
            product_name: "Whole Milk",
            store_id: "s-kr",
            store_name: "Kroger #456",
            quantity: 1,
            unit_price_cents: 289,
            regular_price_cents: 289,
            is_on_sale: false,
            subtotal_cents: 289,
          },
        ],
        total_cents: 289,
        missing_products: [],
      },
      best_plan: {
        is_complete: true,
        stores: [{ id: "s-kr", name: "Kroger #456", retailer_name: "Kroger", sort_order: 1 }],
        items: [
          {
            product_id: "p1",
            product_name: "Whole Milk",
            store_id: "s-kr",
            store_name: "Kroger #456",
            quantity: 1,
            unit_price_cents: 289,
            regular_price_cents: 289,
            is_on_sale: false,
            subtotal_cents: 289,
          },
        ],
        total_cents: 289,
        missing_products: [],
      },
      savings_cents: 0,
      additional_stops: 0,
      pricing_source: "demonstration",
      pricing_source_label: "Demonstration Prices",
      is_demonstration: true,
      data_notice: "Sample prices",
      // Mission 006 fields
      kroger_coverage: "1 of 1 products have known Kroger prices",
      meijer_coverage: "1 of 1 products have known Meijer prices",
      is_coverage_complete: true,
      kroger_plan: {
        is_complete: true,
        stores: [{ id: "s-kr", name: "Kroger #456", retailer_name: "Kroger", sort_order: 1 }],
        items: [],
        total_cents: 289,
        missing_products: [],
      },
      meijer_plan: {
        is_complete: true,
        stores: [{ id: "s-mj", name: "Meijer #206", retailer_name: "Meijer", sort_order: 2 }],
        items: [],
        total_cents: 319,
        missing_products: [],
      },
      split_plan: {
        is_complete: true,
        stores: [{ id: "s-kr", name: "Kroger #456", retailer_name: "Kroger", sort_order: 1 }],
        items: [],
        total_cents: 289,
        missing_products: [],
      },
      split_gross_savings_cents: 30,
      extra_stop_justified: false,
      item_comparisons: [
        {
          product_id: "p1",
          product_name: "Whole Milk",
          brand: "Kroger",
          package_quantity: "1",
          package_unit: "gal",
          requested_quantity: 1,
          kroger_price_cents: 289,
          kroger_is_sale: false,
          meijer_price_cents: 319,
          meijer_is_sale: false,
          cheaper_retailer: "kroger",
          item_savings_cents: 30,
          unit_price_kroger_cents: 2,
          unit_price_meijer_cents: 2,
          unit_price_unit: "oz",
        },
      ],
    };

    it("renders Kroger vs Meijer Price Hunt section with coverage and side-by-side details", () => {
      render(<ComparisonResults comparison={mockM006Comparison} onBackToList={vi.fn()} />);

      expect(screen.getByText("🛒 Kroger vs Meijer Price Hunt")).toBeInTheDocument();
      expect(screen.getByText(/1 of 1 products have known Kroger prices/)).toBeInTheDocument();
      expect(screen.getByText(/1 of 1 products have known Meijer prices/)).toBeInTheDocument();
      expect(screen.getByText("All-Kroger Basket")).toBeInTheDocument();
      expect(screen.getByText("All-Meijer Basket")).toBeInTheDocument();
      expect(screen.getByText("2-Store Split Trip")).toBeInTheDocument();
      expect(screen.getByText("Item Price Comparison (Side-by-Side)")).toBeInTheDocument();
      expect(screen.getByText(/Kroger \(-\$0\.30\)/)).toBeInTheDocument();
    });

    it("renders incomplete coverage warning when coverage is partial", () => {
      const partialComp: ComparisonResponse = {
        ...mockM006Comparison,
        is_coverage_complete: false,
        kroger_coverage: "1 of 2 products have known Kroger prices",
        meijer_coverage: "0 of 2 products have known Meijer prices",
      };
      render(<ComparisonResults comparison={partialComp} onBackToList={vi.fn()} />);

      expect(screen.getByText(/Incomplete Basket Coverage/)).toBeInTheDocument();
    });
  });

  describe("CreateProductModal", () => {
    it("validates required name and calls api.createProduct on submission", async () => {
      const onCreated = vi.fn();
      const onClose = vi.fn();
      vi.mocked(api.createProduct).mockResolvedValueOnce({
        id: "prod-new-1",
        name: "Honeycrisp Apples",
        brand: "Farm Fresh",
        package_quantity: "3",
        package_unit: "lb",
        aliases: [],
      });

      render(<CreateProductModal isOpen={true} onClose={onClose} onProductCreated={onCreated} initialName="Honeycrisp" />);

      expect(screen.getByText("Add Custom Household Product")).toBeInTheDocument();
      const nameInput = screen.getByLabelText("Product Name *");
      fireEvent.change(nameInput, { target: { value: "Honeycrisp Apples" } });

      const saveBtn = screen.getByText("Save Product");
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(api.createProduct).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Honeycrisp Apples",
          })
        );
        expect(onCreated).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe("PriceImportModal", () => {
    it("parses text and displays staged candidates table", async () => {
      vi.mocked(api.parsePriceImport).mockResolvedValueOnce({
        candidates: [
          {
            raw_line: "Whole Milk 1 Gallon $2.89",
            extracted_name: "Whole Milk",
            price_cents: 289,
            is_promotional: false,
            match_confidence: "high",
            matched_product_id: "p1",
            matched_product_name: "Whole Milk",
          },
        ],
        matched_count: 1,
        unmatched_count: 0,
      });

      render(<PriceImportModal isOpen={true} onClose={vi.fn()} />);

      const textarea = screen.getByPlaceholderText(/Example lines/);
      fireEvent.change(textarea, { target: { value: "Whole Milk 1 Gallon $2.89" } });

      const extractBtn = screen.getByText("Extract & Match Prices →");
      fireEvent.click(extractBtn);

      await waitFor(() => {
        expect(api.parsePriceImport).toHaveBeenCalledWith("Whole Milk 1 Gallon $2.89", "Kroger");
        expect(screen.getByText("Staged Price Candidates (1)")).toBeInTheDocument();
        expect(screen.getByText("✓ Matched")).toBeInTheDocument();
      });
    });
  });

  describe("BackupRestoreModal", () => {
    it("handles export backup download", async () => {
      const mockBlob = new Blob(['{"version":"1.0"}'], { type: "application/json" });
      vi.mocked(api.exportBackup).mockResolvedValueOnce(mockBlob);

      // Mock URL.createObjectURL
      window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      window.URL.revokeObjectURL = vi.fn();

      render(<BackupRestoreModal isOpen={true} onClose={vi.fn()} />);

      const downloadBtn = screen.getByText("Download Backup (.json)");
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(api.exportBackup).toHaveBeenCalled();
        expect(screen.getByText("Backup exported successfully to your downloads folder.")).toBeInTheDocument();
      });
    });
  });
});
