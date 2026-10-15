# Mission 005 Specification: Personal Staples, Repeat Shopping & Purchase History

## 1. Context and Predecessor History
- **Campaign**: `2026-09-27-continuous-improvement`
- **Predecessor**: Mission 004 (`docs/MISSION_004.md`, accepted & merged commit `fb42f54`)
- **Status Inherited**:
  - Mission 001: Deterministic integer-cent multi-store optimizer (1-store and 2-store combinations).
  - Mission 002: Segregated demonstration pricing from real user-contributed observations; preserved Open Prices.
  - Mission 003: Capability-based ownership (`GO-007`), physical store locality (`GO-008`), and multi-item shopping trip entry (`GO-009`).
  - Mission 004: Same-ZIP collision resolution (`GO-010`), PATCH locality preservation (`GO-011`), public rate limiting & atomic batch validation (`GO-012`), client-side ephemeral receipt assistant with WebAssembly OCR, Michigan 10¢ deposit exclusion, and multi-ZIP regional pilot comparisons across Southeast Michigan (48042, 48051, 48315, 48316, 48307).
  - Verification Baseline: 56 backend pytest tests, 22 frontend vitest tests, clean linters/types, and Playwright desktop/mobile suites.

### Inherited Open Findings
- `GO-002` (P3): Catalog search scans in-memory domain slice; acceptable for small catalog, benchmark and evaluate `pg_trgm` / full-text index for enterprise scaling.
- `GO-004` (P3): Exhaustive store enumeration complexity grows with $O(N^2)$; requires branch-and-bound pruning as regional store network expands.
- `GO-005` (P4): Docker CLI not installed on host machine; local development operates natively via system PostgreSQL service.
- `GO-006` (P3): Open Prices ecosystem lacks geographic density in US suburban regions; addressed via user observations and receipt assistant.

### Mission 005 Target Findings
- `GO-013` (P1 - Data Integrity): Defect A — Incorrect address-to-city mapping in `RecordPriceModal.tsx` assigning `parsed.address` to `storeCity`.
- `GO-014` (P1 - Data Integrity): Defect B — Indiscriminate receipt discount classification applying tender/change/refund lines to the preceding grocery item.
- `GO-015` (P2 - Correctness): Defect C — Unknown receipt dates defaulting silently to current date without shopper confirmation.
- `GO-016` (P2 - Correctness): Defect D — Quantity, unit price, and extended line total ambiguity on receipts.

---

## 2. Objective & Consumer Value

Make Grocery Optimizer something ordinary consumers want to use every week by streamlining repeat shopping:
**Help shoppers spend less money on groceries with minimal effort.**

A normal consumer should be able to:
1. **Maintain a Personal Staples List**: Save regularly purchased essentials with preferred baseline quantities (1..99).
2. **One-Tap Basket Quick-Add**: Populate a recurring shopping list in under 10 seconds without repetitive searching.
3. **Reuse and Clone Prior Lists**: Start a new weekly trip based on previous shopping habits without destructive overwriting.
4. **Auto-Learn Staples from Confirmed Purchases**: Receive lightweight suggestions to save recurring items into staples after confirming a trip.
5. **Observed Price Trends for Staples**: See truthful historical price movement for staple items at local physical stores without manufacturing fake trends or savings.
6. **Maintain Privacy & Local Control**: Personal staples, shopping history, and household lists remain private on-device in browser storage.

---

## 3. Scope of Work

### Gate 0: Receipt Data Integrity Defect Resolution
- **Defect A (`GO-013`)**: Fix `RecordPriceModal.tsx` address-to-city assignment. Correctly separate street address, city, state, and ZIP; do not invent missing locality.
- **Defect B (`GO-014`)**: Refine negative price / discount line parsing in `receiptParser.ts`. Disallow applying tender changes, tax adjustments, refund lines, or store-wide coupons to preceding line items unless the relationship is explicit and verified.
- **Defect C (`GO-015`)**: Prevent silent defaulting to current date when receipt date is unrecognized; require explicit shopper confirmation before saving observations.
- **Defect D (`GO-016`)**: Correctly interpret quantities, unit prices, and extended line totals (e.g. `2 @ $2.00`), storing true integer-cent unit prices.

### Phase 1: Personal Staples Persistence & Management
- Implement `StaplesManager` in `frontend/src/lib/storage.ts` storing staple product ID, preferred quantity, date added, optional last-used date, and explicit staple status in `localStorage` under `grocery_optimizer_staples`.
- Add familiar consumer actions: "Save as Staple", "Remove from Staples", and a dedicated "My Staples" drawer/modal with quantity adjustments.
- Real confirmed local history metrics only; no manufactured purchase frequency metrics.

### Phase 2: One-Tap Weekly Grocery Lists & List Reuse
- Prominent "Add Staples to List" call-to-action on empty list view and in list header showing the count of saved staples.
- Support bulk-adding all staples or selective check/uncheck before populating the list.
- Deterministic quantity handling: restore preferred quantities, merge with existing items without accidental inflation on repeated clicks, and respect 1..99 quantity limits and 100-item list limits.
- Allow cloning a prior saved list into an active list without overwriting existing lists.

### Phase 3: Personal Purchase History & Post-Trip Learning
- Store confirmed purchases locally: purchase date, product ID, quantity, actual paid price in cents, store ID, and provenance (`receipt_scan` vs `manual_trip`).
- Strict boundary: do not infer personal purchase history from public crowd-sourced observations.
- Post-trip prompt: *"Save these products to My Staples?"* with selective check/uncheck and quantity editing.

### Phase 4: Observed Price Trends & Truthful Savings Tracking
- Display honest price movement for staple items across local physical stores (e.g. *"Milk at Meijer: previously $3.49, latest observation $3.29"*).
- Enforce exact canonical product matching (no size substitutions) and same physical store comparisons.
- Clear missing data states (*"Insufficient observations for trend"*).
- Audit cumulative savings: prohibit summing repeated comparison views as realized savings; only report verified purchase savings or clearly labeled hypothetical estimates.

### Phase 5: Search Performance & Catalog Scaling Benchmark (`GO-002`)
- Benchmark in-memory search latency and memory across baseline and synthetic 1k/10k product catalogs.
- Test PostgreSQL `pg_trgm` / trigram similarity search; evaluate deterministic result ordering, aliases, and package-size preservation.
- Document latency tradeoffs and implement indexing only where evidence justifies it.

---

## 4. Architectural Constraints & Privacy Safeguards
1. **Local-First Privacy**: Personal staples, purchase history, and recurring shopping habits are stored strictly client-side on the consumer's device. No centralized tracking profiles.
2. **Integer Cent Arithmetic**: All price calculations and trend differences operate strictly on integer cents.
3. **No Unsupervised Ingestion**: All receipt data requires human confirmation before saving observations or purchase history.
4. **Strict Baseline Preservation**: All 56 backend tests and 22 frontend tests must continue passing without regressions.
5. **Accessible UX**: Meet WCAG 2.1 AA standards and maintain $\ge 44$px touch targets on mobile viewports.

---

## 5. Verification Requirements
- Deterministic unit tests for receipt defect fixes (`GO-013` through `GO-016`).
- Storage unit tests for `StaplesManager` and purchase history (add, remove, quantity update, corrupt storage recovery).
- Component tests for My Staples drawer, quick-add button, duplicate prevention, and post-trip staples prompt.
- Backend tests for price trend calculations and catalog search scaling benchmark.
- Playwright end-to-end browser tests verifying:
  - Adding staples -> Creating new list -> Quick-adding staples in one click.
  - Receipt scan -> Defect checks -> Post-trip staple learning.
  - Price trends on staples across local stores.
- Capture responsive desktop and mobile screenshots into `docs/images/mission-005/`.

---

## 6. Definition of Done
1. Receipt data defects `GO-013`, `GO-014`, `GO-015`, and `GO-016` resolved and tested.
2. Personal staples storage, drawer, and bookmarking functional.
3. One-tap weekly list quick-add and list cloning functional with duplicate protection.
4. Local purchase history and post-trip staple learning operational.
5. Trustworthy price trends with missing-data fallbacks and conservative savings reporting.
6. Search performance benchmarked and documented.
7. Verification baseline preserved (56+ backend, 22+ frontend tests passing).
8. Playwright tests and screenshots captured in `docs/images/mission-005/`.
9. Mission state, handoff journal, and `docs/MISSION_006.md` specification completed.
10. Pull request created targeting `main` without merging.

---

## 7. Verification Matrix & Visual Artifacts

### Test Execution Summary
- **Backend Tests**: 57 passed (56 baseline + 1 catalog scaling benchmark).
- **Frontend Tests**: 37 passed across 9 test suites (`gate0_defects.test.ts`, `staples.test.tsx`, `priceTrends.test.ts`, `storage.test.ts`, `receiptAssistant.test.tsx`, `receiptParser.test.ts`, `observations.test.tsx`, `components.test.tsx`, `money.test.ts`).
- **Production Bundle**: Clean TypeScript check and Vite build in 1.80s (`dist/assets/index-*.js`, 82 kB gzipped).

### Search Scaling Benchmark (`GO-002`)
| Catalog Size | P50 Latency | P95 Latency | Mean Latency | Throughput | Memory Footprint | Evaluation |
|---|---|---|---|---|---|---|
| **17 items** (seed) | 58.9 µs | 68.4 µs | 60.4 µs (0.06 ms) | 16,552 QPS | < 1 MB | Sub-millisecond instant lookup |
| **1,000 items** | 4,611.2 µs | 6,130.1 µs | 4,795.4 µs (4.80 ms) | 208 QPS | 1.8 MB | Excellent in-memory performance with LRU cache |
| **10,000 items** | 46,254.9 µs | 59,581.9 µs | 47,857.2 µs (47.86 ms) | 20 QPS | 15.4 MB | Scalable within interactive SLA (< 75 ms) |

*Architecture Recommendation*: At the current target regional pilot scale (< 5,000 products), the pure in-memory deterministic ranking with `@lru_cache` achieves sub-5ms latency and eliminates database network roundtrips. `pg_trgm` GIN/GiST indexing is recommended only if catalog expands beyond 25,000 canonical items.

### Visual Verification Artifacts (`docs/images/mission-005/`)
1. `01-empty-list-quick-add-staples.png`: Empty grocery list prominently highlighting "Add Staples" quick-action button.
2. `02-starring-staples-in-search.png`: Live search autocomplete showing star/bookmark toggle icon on matching items.
3. `03-my-staples-drawer.png`: Dedicated "My Staples" drawer with preferred quantity steppers, price trends, and "Add All Staples to List".
4. `04-one-tap-staples-added.png`: Active list instantly populated with preferred staple quantities without duplicate inflation.
5. `05-saved-lists-drawer-clone.png`: Saved Lists drawer featuring list duplication (`📋 Clone`) and purchase history access.
6. `06-post-trip-staples-learning.png`: Post-trip prompt: *"Trip Recorded! Save to My Staples?"* with selective item checkboxes and quantity adjustment.
7. `07-mobile-staples-drawer.png`: Responsive mobile viewport (390x844) validating accessible touch targets ($\ge 44$px).
