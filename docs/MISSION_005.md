# Mission 005 Specification: Saved Staples, Purchase History & Basket Quick-Add

## 1. Context and Predecessor History
- **Campaign**: `2026-09-27-continuous-improvement`
- **Predecessor**: Mission 004 (`docs/MISSION_004.md`, accepted & verified on branch `agy/mission-004`)
- **Status Inherited**:
  - Mission 001: Deterministic integer-cent multi-store optimizer (1-store and 2-store combinations).
  - Mission 002: Segregated demonstration pricing from real user-contributed observations; preserved Open Prices.
  - Mission 003: Capability-based ownership (`GO-007`), physical store locality (`GO-008`), and multi-item shopping trip entry (`GO-009`).
  - Mission 004: Same-ZIP collision resolution (`GO-010`), PATCH locality preservation (`GO-011`), public rate limiting & atomic batch validation (`GO-012`), client-side ephemeral receipt assistant with WebAssembly OCR, Michigan 10¢ deposit exclusion, and multi-ZIP regional pilot comparisons across Southeast Michigan (48042, 48051, 48315, 48316, 48307).
  - Verification Baseline: 56 backend pytest tests, 22 frontend vitest tests, clean linters/types, and Playwright desktop/mobile suites.

### Inherited Open Findings
- `GO-002` (P3): Catalog search scans in-memory domain slice; acceptable for MVP, requires `pg_trgm` / full-text index for enterprise catalog sizes.
- `GO-004` (P3): Exhaustive store enumeration complexity grows with $O(N^2)$; requires branch-and-bound pruning as regional store network expands.
- `GO-005` (P4): Docker CLI not installed on host machine; local development operates natively via system PostgreSQL service.
- `GO-006` (P3): Open Prices ecosystem lacks geographic density in US suburban regions; addressed via user observations and receipt assistant.

---

## 2. Objective & Consumer Value

Empower regular grocery shoppers to build and optimize their recurring weekly shopping baskets in under 10 seconds through **Personal Staples**, **Purchase History**, and **One-Tap Basket Quick-Add**.

A normal consumer should be able to:
1. **Maintain a Personal Staples List**: Star or tag frequently purchased household essentials (milk, eggs, bread, coffee, fruit) with preferred baseline quantities.
2. **One-Tap Basket Quick-Add**: Populate a new shopping list instantly from saved staples without searching item-by-item.
3. **Auto-Learn Staples from Past Receipts**: After confirming a shopping trip or receipt scan, seamlessly prompt to save new recurring items into personal staples.
4. **Local Household Price Trend Awareness**: View historical price movement for their staple items across nearby physical stores (highlighting price drops or increases).
5. **Preserve Complete Privacy**: Personal staples, shopping frequency, and household lists must remain private to the user's browser/device unless explicitly shared.

---

## 3. Scope of Work

### Phase 1: Client-Side Staples Persistence & Management
- Implement `StaplesManager` in `frontend/src/lib/storage.ts` storing staple product IDs, preferred quantities, and purchase frequency in `localStorage` under `grocery_optimizer_staples`.
- Add quick star / bookmark action on catalog search results, list items, and receipt staging rows to toggle staple status.
- Provide a dedicated "My Staples" management drawer or tab where users can view, adjust default quantities, or remove staples.

### Phase 2: One-Tap Basket Quick-Add
- On empty list view or in the list header, present a prominent "Add Staples to List" call-to-action displaying the count of saved staples.
- Support bulk-adding all staples or selectively unchecking items before populating the current grocery list.
- Automatically merge quantities if a staple product is already present on the list.

### Phase 3: Post-Trip Staples Learning
- Upon completing a batch observation or receipt scan submission, offer a discrete prompt: *"Add X items from this trip to your weekly staples?"*
- Pre-select items not already in the user's staples collection.
- Single-click confirmation to save without modal interruption.

### Phase 4: Local Price Trends & Savings Tracking
- Aggregate user-observed price history over time for staple products within the user's preferred pilot ZIP code.
- Display gentle directional trend pills in the staples list (e.g., `↓ $0.20 lower than last month at Meijer`, `↑ $0.15 higher at Kroger`).
- Compute cumulative estimated household savings across all optimized shopping trips.

### Phase 5: Catalog Search Index Optimization (`GO-002`)
- Migrate backend catalog search in `backend/app/catalog/search.py` and `ProductModel` to utilize PostgreSQL trigram similarity (`pg_trgm`) or GIN full-text indexes.
- Benchmark search response latency under 10ms for catalogs scaling to 10,000+ products.

---

## 4. Architectural Constraints & Privacy Safeguards
1. **Zero Tracking / Zero Household Profiling**: Personal staples and recurring purchase patterns are stored strictly client-side on the consumer's device. No centralized profile or user tracking database is created.
2. **Integer Cent Arithmetic**: All trend calculations and historical differences operate exclusively on integer cents.
3. **Strict Non-Regressive Baseline**: All 56 backend tests and 22 frontend tests from Mission 004 must continue passing.
4. **Accessible UX**: All new staple quick-add actions and drawers must fulfill WCAG 2.1 AA standards and >=44px mobile touch targets.

---

## 5. Verification Requirements
- Deterministic unit tests for `StaplesManager` storage, bulk merging, and deduplication.
- Frontend component tests for Staples quick-add button, staple toggle buttons, and empty-state recommendations.
- Backend tests for database search performance and staple price history aggregation endpoints.
- End-to-end Playwright tests verifying the end-to-end workflow: receipt scan -> auto-learn staples -> create new list -> one-tap staple basket add -> price comparison.
- Capture responsive desktop and mobile screenshots into `docs/images/mission-005/`.

---

## 6. Definition of Done
1. Personal staples storage and UI controls fully functional.
2. One-tap basket quick-add populates shopping lists deterministically.
3. Post-receipt learning prompt seamlessly saves new staple candidates.
4. Local staple price trend indicators operational.
5. Search indexing optimized with zero backend test regressions.
6. Documentation, handoff journal, and successor mission specification updated.
7. Pull request created targeting `main` without merging.
