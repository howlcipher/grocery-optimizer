# Grocery Optimizer
## Mission 002 — Real-World Pricing Foundation & User-Contributed Architecture

**Predecessor:** `docs/MISSION_001.md` (Accepted & Released, commit `68898ba`)  
**Campaign ID:** `2026-09-27-continuous-improvement`  
**Feasibility Assessment Status:** **COMPLETED** (Audit completed Oct 15, 2026)  
**Implementation Pathway:** **PATHWAY B (User-Contributed Pricing Foundation)**  
**Specification Status:** IMPLEMENTED & VERIFIED  

---

## 1. Executive Summary & Feasibility Verdict

Following a thorough evaluation of Kroger API legal constraints, Open Prices (Open Food Facts) ecosystem availability, and empirical coverage in the Southeast Michigan pilot region:

### Verdicts:
1. **Kroger Developer API**: **BLOCKED PENDING PARTNER AUTHORIZATION**. Kroger developer terms (Section 5(e)) strictly prohibit cross-retailer competitive pricing, database building, and unauthorized public displays without an enterprise Partner Agreement. Raw Kroger prices are not cached or queried without authorization.
2. **Open Prices Ecosystem (Path A)**: **NO-GO FOR AUTOMATED BASKET COMPARISON**. Empirical coverage study across 100km radius of ZIP 48042 revealed **0 products with observations at $\ge 2$ nearby stores** under exact UPC matching. Automated complete-basket optimization cannot be defensibly calculated using Open Prices today without fabricating coverage.
3. **User-Contributed Pricing Foundation (Path B)**: **GO (IMPLEMENTED)**. Implemented a robust, mobile-friendly consumer workflow for recording observed grocery prices, comparing store offers per product, and running whole-basket comparisons with strict data provenance. Open Prices client and normalizer components are also preserved in the codebase for future dataset ingestion as community density grows.

---

## 2. Southeast Michigan Pilot Coverage Study Findings

Empirical coverage study executed on Oct 15, 2026 querying the Open Prices REST API (`https://prices.openfoodfacts.org/api/v1`) using reproducible tooling:

| Metric | Measured Value | Analysis & Implication |
| :--- | :--- | :--- |
| **Search Radius** | 100 km of ZIP 48042 (Macomb County, MI) | Covers Detroit Metro, Oakland, Macomb, Wayne, St. Clair counties, and Windsor, ON. |
| **Locations in Radius** | 11 total locations | 2 in Windsor, ON (CAD currency); 9 in Michigan. |
| **Stores with >1 price** | 4 stores | Whole Foods Rochester Hills (456), Fresh Thyme Rochester Hills (156), ALDI Rochester Hills (27), Meijer Rochester Hills (15). |
| **Distinct Products with Prices** | 619 products | Broad variety, but largely single-store boutique/specialty observations. |
| **Products observed at $\ge 2$ stores** | **0 (Zero)** | Under exact barcode/UPC matching, no product had prices recorded at multiple stores. |
| **15-20 Item Basket Coverage** | **0%** | Cannot fulfill a standard household grocery basket from real observations. |
| **Complete 1-Store Baskets** | **0 (Zero)** | No store had recorded prices covering a complete household list. |
| **Complete 2-Store Baskets** | **0 (Zero)** | No combination of stores covers a complete multi-item basket. |
| **Observation Age** | 0 to 365+ days | Several stores had observations >6 months old. |
| **Go/No-Go Gate Decision** | **NO-GO for Path A** | Proceeded to Path B (User-Contributed Pricing Foundation) to prevent misleading calculations. |

---

## 3. Implemented Architecture (Path B & Data Provenance)

```mermaid
flowchart TD
    ConsumerUI["React Consumer UI (Mobile & Desktop)"] --> API["FastAPI REST Endpoints (/api)"]
    
    subgraph REST API & Services
        API --> Catalog["Canonical Catalog Service"]
        API --> ObsService["Price Observation Endpoints (/api/price-observations)"]
        API --> CompareEndpoint["Basket Comparison (/api/lists/{id}/compare?source=...)"]
    end

    subgraph Data Sources & Isolation
        CompareEndpoint -->|source=demonstration| MockProv["MockRetailerProvider (Mission 001 Seed Data)"]
        CompareEndpoint -->|source=user_contributed| UserProv["UserContributedRetailerProvider"]
        OpenPricesClient["OpenPricesClient & Normalizer"] -.->|Future Dataset Ingestion| UserProv
    end

    subgraph Persistence Layer (PostgreSQL)
        UserProv --> ObsTable[(price_observations table)]
        ObsService --> ObsTable
    end

    MockProv --> PureOptimizer["Pure Optimizer Engine (backend/app/optimizer/engine.py)"]
    UserProv --> PureOptimizer
    PureOptimizer --> PlanResults["Optimal Shopping Plans with Provenance Metadata"]
```

### Architectural Principles:
1. **Zero Data Pollution / Non-Misleading Math**:
   - Synthetic demonstration prices and real user observations are **never mixed**. A price comparison is either 100% demonstration data or 100% user-entered observations.
   - Unknown prices are **never treated as zero**. Missing observations are clearly flagged as unfulfillable baskets with missing items identified.
2. **Strict Integer-Cent Arithmetic**:
   - All monetary calculations are performed in integer cents. Floating-point conversions occur only at the final presentation/input boundary.
3. **Data Provenance & Freshness**:
   - Every offer and comparison result is stamped with `PriceSource` (`DEMONSTRATION`, `USER_CONTRIBUTED`, `OPEN_PRICES`, `LIVE_RETAILER`).
   - Observations older than 30 days are explicitly flagged with `Stale (>30d)` badges in the UI.
4. **Resilient Validation**:
   - Price observation amounts are bounded to positive values ($0.01 to $500.00 / 1 to 50000 cents). Absurd prices throw HTTP 422.
   - Observation dates cannot be in the future and cannot be older than 365 days.
   - Store names are normalized and linked to canonical store records when matching.

---

## 4. Implemented Consumer Capabilities

1. **Record Store Price Modal (`RecordPriceModal.tsx`)**:
   - Accessible from header (+ Record Price) or directly from any list item (+ Record Price).
   - Pre-selects product when launched from list row, or provides autocomplete search across canonical catalog.
   - Quick-select store chips for common regional retailers (Meijer, Kroger, ALDI, Trader Joe's, Whole Foods Market, Costco).
   - Form controls for price ($X.XX), observation date, promotional sale toggle, and shopper notes.
   - Prominent consumer trust disclaimer: *"Prices are user-recorded shelf observations. They are not guaranteed or authorized live retailer prices."*
2. **Product Cross-Store Price Comparison Modal (`ProductPricesModal.tsx`)**:
   - Accessible via "🔍 Compare Stores" on any list item.
   - Displays all recorded store prices for that exact product, sorted by price.
   - Highlights the lowest-price store with a green `Lowest Price` badge.
   - Displays observation date, sale status, and stale warning flags.
   - Allows inline editing or adding new store observations.
3. **Interactive Comparison Source Switcher (`ComparisonResults.tsx`, `GroceryList.tsx`)**:
   - Shoppers can toggle between `🧪 Demo Data` and `👥 User Observations` both before comparing and directly on the results screen.
   - Provenance badges (`Demonstration Prices` vs `User-Entered Observations`) and descriptive data notices clarify where prices originated.
   - Unfulfillable baskets clearly list missing items without fabricating prices.

---

## 5. Verification Gates & Acceptance Checklist

- [x] **Gate 0 — Legal & Permitted Use Gate**: Conditional assessments established; Kroger API direct queries gated; synthetic data clearly labeled.
- [x] **Gate 1 — Empirical Coverage Study**: Executed in Southeast Michigan (ZIP 48042); reproducible evidence recorded; Go/No-Go gate adhered to.
- [x] **Gate 2 — Open Prices Client & Normalizer**: Implemented with USD currency enforcement, barcode matching, integer-cent conversion, and rate limit backoff.
- [x] **Gate 3 — User-Contributed Pricing Provider**: Implemented with PostgreSQL schema (`price_observations`), conflict resolution (latest date wins), and stale tagging.
- [x] **Gate 4 — Non-Misleading Results & Provenance**: Zero mixing of synthetic and real data; unfulfillable baskets truthfully reported.
- [x] **Gate 5 — Integer-Cent Precision**: Pure optimizer preserved without floating point drift.
- [x] **Gate 6 — Baseline Preservation**: All 24 backend tests and 10 frontend tests from Mission 001 pass without regressions. Full suite expanded to 38 backend and 14 frontend tests.
- [x] **Gate 7 — Browser Smoke Verification**: Full Playwright desktop and mobile test suite passed; WCAG >=44px touch targets verified; screenshots captured.
- [x] **Gate 8 — Independent Technical Review**: Formal code review conducted and recorded.
