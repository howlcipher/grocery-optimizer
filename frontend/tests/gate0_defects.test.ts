import { describe, it, expect } from "vitest";
import { parseReceiptText } from "../src/lib/receiptParser";
import { Product } from "../src/types";

const mockProducts: Product[] = [
  {
    id: "prod-milk-gal",
    name: "Whole Milk",
    brand: "Dairy Pure",
    package_quantity: "1",
    package_unit: "gal",
    aliases: ["whole milk", "milk"],
  },
  {
    id: "prod-bread-white",
    name: "Classic White Sandwich Bread",
    brand: "Wonder",
    package_quantity: "20",
    package_unit: "oz",
    aliases: ["bread", "white bread"],
  },
];

describe("Gate 0: Receipt Data Integrity Defects (GO-013 through GO-016)", () => {
  it("Defect A (GO-013): parses street address, city, state, and zip separately without mapping address to city", () => {
    const rawReceipt = `
MEIJER #206
36865 26 MILE ROAD
LENOX, MI 48042
10/14/2026

WHOLE MILK 3.49
TOTAL 3.49
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    expect(result.address).toBe("36865 26 MILE ROAD");
    expect(result.city).toBe("Lenox");
    expect(result.state).toBe("MI");
    expect(result.zipCode).toBe("48042");
  });

  it("Defect B (GO-014): does not apply refunds, change due, total savings, or tender adjustments as item discounts", () => {
    const rawReceipt = `
WHOLE MILK 3.49
WHITE BREAD 2.49
SUBTOTAL 5.98
TOTAL SAVINGS -2.00
TAX ADJUSTMENT -0.15
STORE COUPON -5.00
CHANGE DUE -10.00
REFUND -4.50
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    expect(result.items.length).toBe(2);
    // Milk should be 349
    expect(result.items[0].priceCents).toBe(349);
    // Bread must remain 249, NOT reduced by total savings, change due, or refunds!
    expect(result.items[1].priceCents).toBe(249);
    expect(result.items[1].isPromotional).toBe(false);
  });

  it("Defect C (GO-015): leaves date as null when receipt date is unrecognized instead of defaulting to today", () => {
    const rawReceipt = `
MEIJER #206
36865 26 MILE ROAD
LENOX, MI 48042

WHOLE MILK 3.49
TOTAL 3.49
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    // Must be null, not today's date
    expect(result.date).toBeNull();
    expect(result.hasRecognizedDate).toBe(false);
  });

  it("Defect D (GO-016): correctly extracts unit price and quantity when receipt has 2 @ 1.99 = 3.98", () => {
    const rawReceipt = `
10/14/2026
2 @ 1.99 WHOLE MILK 3.98
TOTAL 3.98
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    expect(result.items.length).toBe(1);
    expect(result.items[0].quantity).toBe(2);
    // Unit shelf price should be 199, not 398!
    expect(result.items[0].priceCents).toBe(199);
  });
});
