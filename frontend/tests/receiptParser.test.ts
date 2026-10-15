import { describe, it, expect } from "vitest";
import { parseReceiptText, matchCanonicalProduct } from "../src/lib/receiptParser";
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
    id: "prod-milk-2pct",
    name: "2% Reduced Fat Milk",
    brand: "Dairy Pure",
    package_quantity: "1",
    package_unit: "gal",
    aliases: ["2% milk", "reduced fat milk"],
  },
  {
    id: "prod-eggs-dozen",
    name: "Grade A Large White Eggs",
    brand: "Eggland's Best",
    package_quantity: "12",
    package_unit: "ct",
    aliases: ["eggs", "dozen eggs", "large eggs"],
  },
  {
    id: "prod-cheerios-12",
    name: "Cheerios Original Cereal",
    brand: "General Mills",
    package_quantity: "12",
    package_unit: "oz",
    aliases: ["cheerios", "cereal"],
  },
  {
    id: "prod-cheerios-18",
    name: "Cheerios Original Cereal",
    brand: "General Mills",
    package_quantity: "18",
    package_unit: "oz",
    aliases: ["cheerios", "cereal", "family size cheerios"],
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

describe("receiptParser", () => {
  it("extracts store header, pilot ZIP, and transaction date", () => {
    const rawReceipt = `
MEIJER #123
36865 26 MILE RD
LENOX, MI 48042
10/12/2026 14:32

WHOLE MILK GAL 3.29 F
GRADE A LARGE EGGS 2.49 F

SUBTOTAL 5.78
TAX 0.00
TOTAL 5.78
VISA **** 1234
AUTH 048291
THANK YOU FOR SHOPPING MEIJER
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    expect(result.storeName).toBe("Meijer");
    expect(result.zipCode).toBe("48042");
    expect(result.date).toBe("2026-10-12");
    expect(result.items.length).toBe(2);

    expect(result.items[0].rawText).toContain("WHOLE MILK GAL");
    expect(result.items[0].priceCents).toBe(329);
    expect(result.items[0].matchedProductId).toBe("prod-milk-gal");
    expect(result.items[0].matchConfidence).toBe("high");

    expect(result.items[1].rawText).toContain("GRADE A LARGE EGGS");
    expect(result.items[1].priceCents).toBe(249);
    expect(result.items[1].matchedProductId).toBe("prod-eggs-dozen");
    expect(result.items[1].matchConfidence).toBe("high");
  });

  it("strictly filters Michigan bottle deposits and never creates product items for them", () => {
    const rawReceiptWithDeposits = `
KROGER STORE #456
50555 GRATIOT AVE
CHESTERFIELD MI 48051

WHOLE MILK 3.49
MI DEP .10
10C DEP
MI BOTTLE DEP .10
WHITE BREAD 2.19
MICH DEP .10

SUBTOTAL 5.98
TOTAL 5.98
    `.trim();

    const result = parseReceiptText(rawReceiptWithDeposits, mockProducts);

    // Only milk and bread should be extracted as grocery items
    expect(result.items.length).toBe(2);
    expect(result.items[0].matchedProductId).toBe("prod-milk-gal");
    expect(result.items[1].matchedProductId).toBe("prod-bread-white");

    // Deposit lines must be recorded in ignoredLines
    const depositIgnored = result.ignoredLines.filter((l) => l.includes("[Deposit Excluded]"));
    expect(depositIgnored.length).toBe(4);
  });

  it("filters transaction noise, subtotals, taxes, and card PII", () => {
    const rawReceipt = `
ALDI
10/14/2026

WHITE BREAD 1.89
SUBTOTAL 1.89
SALES TAX 0.11
TOTAL DUE 2.00
CASH TENDER 5.00
CHANGE DUE 3.00
CARD # ************4321
AID A0000000041010
AUTH 98765
CUSTOMER COPY
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    expect(result.items.length).toBe(1);
    expect(result.items[0].rawText).toBe("WHITE BREAD");
    expect(result.items[0].priceCents).toBe(189);

    // Noise lines should be ignored
    expect(result.ignoredLines.some((l) => l.includes("SUBTOTAL"))).toBe(true);
    expect(result.ignoredLines.some((l) => l.includes("CARD #"))).toBe(true);
    expect(result.ignoredLines.some((l) => l.includes("AID"))).toBe(true);
  });

  it("applies promotional discount lines to preceding item", () => {
    const rawReceipt = `
WHOLE MILK 3.99
SAVINGS -0.50
WHITE BREAD 2.49
    `.trim();

    const result = parseReceiptText(rawReceipt, mockProducts);

    expect(result.items.length).toBe(2);
    // Milk should be adjusted: 399 - 50 = 349 cents and flagged promotional
    expect(result.items[0].priceCents).toBe(349);
    expect(result.items[0].isPromotional).toBe(true);

    // Bread remains regular price
    expect(result.items[1].priceCents).toBe(249);
    expect(result.items[1].isPromotional).toBe(false);
  });

  it("handles package size ambiguity without hallucinating (Gate 5)", () => {
    // Receipt text only says CHEERIOS CEREAL without specifying 12oz vs 18oz
    const ambiguousMatch = matchCanonicalProduct("CHEERIOS CEREAL", mockProducts);
    expect(ambiguousMatch.matchConfidence).toBe("medium");
    expect(ambiguousMatch.candidateProducts.length).toBe(2);
    expect(ambiguousMatch.candidateProducts.map((p) => p.id)).toContain("prod-cheerios-12");
    expect(ambiguousMatch.candidateProducts.map((p) => p.id)).toContain("prod-cheerios-18");

    // Explicit size in receipt text allows high confidence match
    const explicit18Match = matchCanonicalProduct("CHEERIOS 18 OZ", mockProducts);
    expect(explicit18Match.matchConfidence).toBe("high");
    expect(explicit18Match.matchedProductId).toBe("prod-cheerios-18");

    const explicit12Match = matchCanonicalProduct("CHEERIOS 12 OZ", mockProducts);
    expect(explicit12Match.matchConfidence).toBe("high");
    expect(explicit12Match.matchedProductId).toBe("prod-cheerios-12");

    // Unmatched for unknown product
    const unknownMatch = matchCanonicalProduct("FANCY ORGANIC AVOCADO OIL 500ML", mockProducts);
    expect(unknownMatch.matchConfidence).toBe("unmatched");
    expect(unknownMatch.matchedProductId).toBeNull();
  });
});
