import { ParsedReceipt, ParsedReceiptItem, Product } from "../types";

// Michigan bottle deposit patterns (10¢ container recycling deposit)
const MI_DEPOSIT_REGEX = /(\bMI\b|\bMICH\b|\b10C\b)?\s*(\bDEP\b|\bDEPOSIT\b|\bBOTTLE\s*DEP\b)/i;

// Noise / transaction metadata keywords that never represent grocery products
const TRANSACTION_NOISE_REGEX =
  /\b(SUBTOTAL|SUB\s*TOTAL|TOTAL\s*DUE|BALANCE\s*DUE|AMOUNT\s*DUE|\bTOTAL\b|SALES\s*TAX|\bTAX\b|CASH|TENDER|CHANGE\s*DUE|\bCHANGE\b|DEBIT|CREDIT|VISA|MASTERCARD|\bMC\b|AMEX|DISCOVER|APPLE\s*PAY|GOOGLE\s*PAY|ACCOUNT|CARD\s*#|EXP\s*DATE|AUTH\s*CODE|\bAUTH\b|APPROVED|\bAID\b|\bATC\b|REFUND|RECEIPT|THANK\s*YOU|STORE\s*#|REGISTER\s*#|LANE\s*#|CASHIER|SURVEY|REWARD|POINTS|MEMBER|COUPON|SAVED\s*TODAY)\b/i;

// Known pilot grocery retailer headers
const RETAILER_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "Meijer", regex: /\bMEIJER\b/i },
  { name: "Kroger", regex: /\bKROGER\b/i },
  { name: "ALDI", regex: /\bALDI\b/i },
  { name: "Trader Joe's", regex: /\bTRADER\s*JOE'?S\b/i },
  { name: "Whole Foods Market", regex: /\bWHOLE\s*FOODS\b/i },
  { name: "Target", regex: /\bTARGET\b/i },
  { name: "Walmart", regex: /\bWALMART\b|\bWAL-MART\b/i },
  { name: "Busch's Fresh Food Market", regex: /\bBUSCH'?S\b/i },
];

/**
 * Clean and normalize a string for token matching.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract tokens of length >= 3, skipping common noise words.
 */
function extractTokens(text: string): Set<string> {
  const STOP_WORDS = new Set([
    "the", "and", "for", "with", "fresh", "choice", "grade", "pure",
    "select", "best", "great", "value", "brand", "item", "each", "food",
  ]);
  const tokens = normalizeText(text).split(" ");
  return new Set(tokens.filter((t) => t.length >= 3 && !STOP_WORDS.has(t)));
}

/**
 * Match an extracted item description against canonical products conservatively.
 * Never hallucinate package sizes or force false positives.
 */
export function matchCanonicalProduct(
  rawText: string,
  canonicalProducts: Product[]
): {
  matchedProductId: string | null;
  matchedProductName: string | null;
  matchConfidence: "high" | "medium" | "unmatched";
  candidateProducts: Product[];
} {
  const normRaw = normalizeText(rawText);
  if (!normRaw || canonicalProducts.length === 0) {
    return {
      matchedProductId: null,
      matchedProductName: null,
      matchConfidence: "unmatched",
      candidateProducts: [],
    };
  }

  // 1. Direct Alias / Name Matching
  const exactOrAliasMatches = canonicalProducts.filter((p) => {
    const normName = normalizeText(p.name);
    if (normRaw === normName || normRaw.includes(normName)) {
      return true;
    }
    return (p.aliases || []).some((alias) => {
      const normAlias = normalizeText(alias);
      return normAlias.length >= 3 && (normRaw === normAlias || normRaw.includes(normAlias));
    });
  });

  if (exactOrAliasMatches.length > 0) {
    if (exactOrAliasMatches.length === 1) {
      const p = exactOrAliasMatches[0];
      return {
        matchedProductId: p.id,
        matchedProductName: `${p.name} (${p.package_quantity} ${p.package_unit})`,
        matchConfidence: "high",
        candidateProducts: [p],
      };
    }

    // Multiple products matched (e.g. Cheerios 12oz and 18oz)
    // Disambiguate by explicit package size or sub-variety in rawText
    const matchedBySize = exactOrAliasMatches.filter((p) => {
      const sizeNorm = normalizeText(`${p.package_quantity} ${p.package_unit}`);
      const qtyNorm = normalizeText(p.package_quantity);
      return (
        normRaw.includes(sizeNorm) ||
        normRaw.includes(` ${qtyNorm} `) ||
        normRaw.includes(`${qtyNorm}oz`) ||
        normRaw.includes(`${qtyNorm} oz`) ||
        normRaw.includes(`${qtyNorm}ct`) ||
        normRaw.includes(`${qtyNorm} ct`) ||
        normRaw.includes(`${qtyNorm}lb`) ||
        normRaw.includes(`${qtyNorm}gal`)
      );
    });

    if (matchedBySize.length === 1) {
      const p = matchedBySize[0];
      return {
        matchedProductId: p.id,
        matchedProductName: `${p.name} (${p.package_quantity} ${p.package_unit})`,
        matchConfidence: "high",
        candidateProducts: matchedBySize,
      };
    }

    // Ambiguous size or variety: require shopper confirmation (Gate 5)
    const first = exactOrAliasMatches[0];
    return {
      matchedProductId: first.id,
      matchedProductName: `${first.name} (${first.package_quantity} ${first.package_unit})`,
      matchConfidence: "medium",
      candidateProducts: exactOrAliasMatches,
    };
  }

  // 2. Token-Based Conservative Scoring
  const rawTokens = extractTokens(rawText);
  if (rawTokens.size === 0) {
    return {
      matchedProductId: null,
      matchedProductName: null,
      matchConfidence: "unmatched",
      candidateProducts: [],
    };
  }

  const scoredCandidates: { product: Product; score: number }[] = [];

  for (const product of canonicalProducts) {
    const prodTokens = extractTokens(product.name);
    for (const alias of product.aliases || []) {
      for (const t of extractTokens(alias)) {
        prodTokens.add(t);
      }
    }

    let overlap = 0;
    for (const token of rawTokens) {
      if (prodTokens.has(token)) {
        overlap++;
      }
    }

    if (overlap > 0) {
      // Check for size mismatch penalty
      const rawHasOtherSize =
        /\b(\d+(\.\d+)?)\s*(oz|lb|gal|ct|fl\s*oz)\b/i.test(rawText) &&
        !normRaw.includes(product.package_quantity);

      if (rawHasOtherSize) {
        continue; // Size mismatch -> eliminate candidate
      }

      const score = overlap / Math.max(rawTokens.size, prodTokens.size);
      if (overlap >= 2 || (overlap === 1 && prodTokens.size === 1)) {
        scoredCandidates.push({ product, score });
      }
    }
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  if (scoredCandidates.length > 0) {
    const top = scoredCandidates[0];
    if (top.score >= 0.5) {
      return {
        matchedProductId: top.product.id,
        matchedProductName: top.product.name,
        matchConfidence: "high",
        candidateProducts: scoredCandidates.map((c) => c.product),
      };
    } else if (top.score >= 0.25) {
      return {
        matchedProductId: top.product.id,
        matchedProductName: top.product.name,
        matchConfidence: "medium",
        candidateProducts: scoredCandidates.map((c) => c.product),
      };
    }
  }

  return {
    matchedProductId: null,
    matchedProductName: null,
    matchConfidence: "unmatched",
    candidateProducts: [],
  };
}

/**
 * Deterministically parse raw OCR receipt text into structured receipt draft.
 */
export function parseReceiptText(text: string, canonicalProducts: Product[]): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let storeName: string | null = null;
  let receiptDate: string | null = null;
  let address: string | null = null;
  let zipCode: string | null = null;
  const items: ParsedReceiptItem[] = [];
  const ignoredLines: string[] = [];

  // Price extraction regex matching prices like $3.99, 3.99, 12.50 F, 4.29B
  const PRICE_REGEX = /\$?([0-9]+\.[0-9]{2})(?:\s*[A-Z])?$/;
  // Discount lines e.g. -1.00 or SAVINGS -0.50
  const DISCOUNT_REGEX = /-\$?([0-9]+\.[0-9]{2})$/;
  // Date patterns: MM/DD/YYYY, YYYY-MM-DD, MM-DD-YY
  const DATE_REGEX = /\b(202\d|19\d\d)[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b|\b(0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])[-/](202\d|2\d)\b/;
  // ZIP code pattern
  const ZIP_REGEX = /\b(48\d{3})(?:-\d{4})?\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for store header if not found yet (usually top 10 lines)
    if (!storeName && i < 12) {
      for (const retailer of RETAILER_PATTERNS) {
        if (retailer.regex.test(line)) {
          storeName = retailer.name;
          break;
        }
      }
    }

    // Check for ZIP code (especially pilot Michigan ZIPs starting with 48xxx)
    if (!zipCode) {
      const zipMatch = line.match(ZIP_REGEX);
      if (zipMatch) {
        zipCode = zipMatch[1];
      }
    }

    // Check for street address (e.g. 123 Main St, 36865 26 Mile Rd)
    if (!address && i < 15 && /\b\d+\s+([A-Za-z0-9.]+\s+)+(Rd|Road|St|Street|Ave|Avenue|Blvd|Hwy|Pkwy|Mile)\b/i.test(line)) {
      address = line;
    }

    // Check for receipt date
    if (!receiptDate) {
      const dateMatch = line.match(DATE_REGEX);
      if (dateMatch) {
        if (dateMatch[1] && dateMatch[2] && dateMatch[3]) {
          // YYYY-MM-DD
          receiptDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        } else if (dateMatch[4] && dateMatch[5] && dateMatch[6]) {
          // MM/DD/YY or MM/DD/YYYY
          const year = dateMatch[6].length === 2 ? `20${dateMatch[6]}` : dateMatch[6];
          receiptDate = `${year}-${dateMatch[4].padStart(2, "0")}-${dateMatch[5].padStart(2, "0")}`;
        }
      }
    }

    // Michigan bottle deposit check: MUST BE EXCLUDED
    if (MI_DEPOSIT_REGEX.test(line)) {
      ignoredLines.push(`[Deposit Excluded] ${line}`);
      continue;
    }

    // Check if line is a discount modifying the previous product
    const discountMatch = line.match(DISCOUNT_REGEX);
    if (discountMatch && items.length > 0) {
      const discountCents = Math.round(parseFloat(discountMatch[1]) * 100);
      const prevItem = items[items.length - 1];
      prevItem.isPromotional = true;
      if (prevItem.priceCents > discountCents) {
        prevItem.priceCents -= discountCents;
      }
      ignoredLines.push(`[Promotional Discount Applied] ${line}`);
      continue;
    }

    // Exclude noise / totals / tender lines
    if (TRANSACTION_NOISE_REGEX.test(line)) {
      ignoredLines.push(`[Transaction Metadata Excluded] ${line}`);
      continue;
    }

    // Check for product line with price
    const priceMatch = line.match(PRICE_REGEX);
    if (priceMatch) {
      const priceStr = priceMatch[1];
      const priceCents = Math.round(parseFloat(priceStr) * 100);

      // Clean item description by removing the price and trailing tax codes
      const itemDesc = line.replace(PRICE_REGEX, "").trim();

      // Skip lines that have no description or are pure digits
      if (!itemDesc || /^\d+$/.test(itemDesc) || priceCents <= 0 || priceCents > 50000) {
        ignoredLines.push(line);
        continue;
      }

      // Check for quantity multiplier on previous line or in desc (e.g. 2 @ 1.99)
      let quantity = 1;
      const qtyMatch = itemDesc.match(/^(\d+)\s*[@x]\s*/i);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
      }

      const matchResult = matchCanonicalProduct(itemDesc, canonicalProducts);

      items.push({
        rawText: itemDesc,
        matchedProductId: matchResult.matchedProductId,
        matchedProductName: matchResult.matchedProductName,
        matchConfidence: matchResult.matchConfidence,
        candidateProducts: matchResult.candidateProducts,
        priceCents,
        quantity,
        isPromotional: /SALE|PROMO|SAVINGS|SPEC/i.test(line),
      });
    } else {
      ignoredLines.push(line);
    }
  }

  // Fallback date to today if none found
  if (!receiptDate) {
    receiptDate = new Date().toISOString().split("T")[0];
  }

  return {
    storeName,
    date: receiptDate,
    address,
    zipCode,
    items,
    rawText: text,
    ignoredLines,
  };
}
