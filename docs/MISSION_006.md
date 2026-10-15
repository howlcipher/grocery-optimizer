# Mission 006 Specification: Local Sale Discovery, Promotion Freshness & Multi-Store Trip Economics

## 1. Context and Predecessor History
- **Campaign**: `2026-09-27-continuous-improvement`
- **Predecessor**: Mission 005 (`docs/MISSION_005.md`, completed and verified on branch `agy/mission-005`)
- **Status Inherited**:
  - Mission 001: Core deterministic integer-cent basket optimizer (1-store and 2-store permutations).
  - Mission 002: Real-world user-contributed observation model with strict demonstration data segregation.
  - Mission 003: Capability edit tokens (`GO-007`), physical store composite locality (`GO-008`), and multi-item shopping trip batch entry (`GO-009`).
  - Mission 004: Same-ZIP store isolation (`GO-010`), locality PATCH preservation (`GO-011`), public sliding-window rate limiting & atomic batch validation (`GO-012`), client-side WebAssembly OCR receipt assistant with Michigan bottle deposit filtering, and regional pilot comparisons (ZIPs 48042, 48051, 48315, 48316, 48307).
  - Mission 005: Resolved receipt data integrity defects (`GO-013`, `GO-014`, `GO-015`, `GO-016`), personal staples storage and drawer, one-tap weekly list population, list cloning (`📋 Clone`), client-side purchase history, post-trip staple learning modal, observed canonical price trends, and search benchmark scaling (`GO-002`).
  - Verification Baseline: 57 backend pytest tests, 37 frontend Vitest tests, clean static analysis (Ruff, ESLint, TypeScript, Mypy), clean production build, and full Playwright browser test coverage.

### Inherited Open Findings
- `GO-004` (P3 - Algorithm): Exhaustive store enumeration complexity grows with $O(N^2)$; acceptable for small store sets, requires branch-and-bound candidate pruning as regional store network expands.
- `GO-005` (P4 - Environment): Docker CLI not installed on host machine; local development operates natively via system PostgreSQL service.
- `GO-006` (P3 - Data Coverage): Open Prices ecosystem lacks geographic density in suburban US markets (0 overlapping products across stores in SE Michigan); addressed via user observations and receipt assistant.

---

## 2. Objective & Consumer Value

**Help consumers maximize real-world savings by highlighting legitimate local sales and preventing trips where travel costs exceed grocery savings.**

While Missions 001–005 established trusted price recording, receipt scanning, regional comparisons, and recurring basket tools, two major consumer pain points remain in day-to-day shopping:

1. **Sale Discovery & Ephemeral Promotion Freshness**:
   Shoppers want to discover what is currently on sale at nearby physical stores before planning their weekly basket. However, grocery circulars change weekly (Wednesday–Tuesday or Sunday–Saturday). Promotional prices recorded 14 days ago are almost certainly expired, leading to consumer disappointment if displayed as active discounts.

2. **Real-World Trip Economics (The "Second Stop Trap")**:
   The current optimizer suggests a two-store split trip whenever the shelf-price total is even 1¢ cheaper than a single store. In reality, driving to a second store incurs fuel expense, vehicle depreciation, and lost personal time. Recommending an extra stop to save $0.45 when the driving distance is 6 miles costs the shopper money.

---

## 3. Scope of Work

### Phase 1: Local Deals & Promotional Discovery Feed
- **Dedicated "Deals Nearby" View**:
  - Surface active price observations tagged `is_sale=True` within the shopper's active ZIP or regional pilot radius.
  - Sort by relative discount percentage or absolute dollar savings compared to the retailer's regular price or regional median price.
- **Strict Promotional Freshness Window**:
  - Regular price observations remain valid up to 30 days (`is_stale = age > 30 days`).
  - Promotional observations (`is_sale=True`) expire into a stale promotional state after **7 days**, reflecting US retail grocery circular cadences.
  - Expired sales must never be presented as active deals in the discovery feed.
- **One-Tap Deal Addition**:
  - Shoppers can add discovered sale items directly to their active grocery list with one tap.

### Phase 2: Trip Economics & Configurable Extra-Stop Penalty
- **Extra-Stop Friction & Cost Model**:
  - Introduce an explicit `extra_stop_penalty_cents` (default: $3.00, representing modest driving cost and 15 minutes of shopping time).
  - Allow shoppers to customize their threshold in settings or directly on the comparison results screen ($0.00 to $10.00).
- **Net Savings Calculation**:
  - $\text{Gross Savings} = \text{Best 1-Store Total} - \text{Cheapest 2-Store Total}$
  - $\text{Net Savings} = \text{Gross Savings} - \text{Extra-Stop Penalty}$
  - A two-store split trip is only recommended as "Cheapest Trip" if $\text{Net Savings} > 0$.
  - When $\text{Net Savings} \le 0$, the UI clearly advises: *"Best 1-Store trip at [Store A] recommended. Splitting saves only $X.XX, which does not justify an extra stop."*
- **Store Distance Awareness**:
  - When store coordinates (`latitude`, `longitude`) are populated, compute haversine driving/crow-flies distance between Store A and Store B.
  - Display inter-store distance (e.g. `+ 2.8 miles between stores`) on split-trip cards.

### Phase 3: Optimizer Candidate Pruning (`GO-004`)
- Refactor `backend/app/optimizer/engine.py` to prune store pairs whose combined product catalog coverage is strictly inferior to individual stores or dominated candidate pairs.
- Ensure comparison latency remains $<50$ ms even with 20+ candidate stores in expanded regional pilot zones.

---

## 4. Non-Goals
- Do not build automated web scrapers for supermarket circulars or PDFs that violate retailer terms of service or copyright.
- Do not require user registration or centralized tracking; store travel penalty preferences locally in `localStorage`.
- Do not fabricate vehicle MPG or complex turn-by-turn routing algorithms; use transparent fixed cost models and haversine distances.

---

## 5. Architectural Constraints
- **Local-First Privacy**: Travel penalty settings and location preferences persist client-side.
- **Deterministic Integer-Cent Math**: All penalty subtractions, gross savings, and net savings operate strictly on integer cents.
- **Truthful Labeling**: Always distinguish gross shelf savings from net travel-adjusted savings.
- **Zero Regression**: Preserve all 57 backend tests and 37 frontend tests.

---

## 6. Deterministic Verification Requirements
1. **Promotional Lifecycle Tests**:
   - Backend tests verifying that `is_sale=True` observations older than 7 days are excluded from active promotional feeds.
   - Frontend tests verifying expired sale badges and warning states.
2. **Optimizer Net Savings Tests**:
   - Engine tests verifying two-store plans are rejected or de-prioritized when gross savings < extra stop penalty.
   - Exact boundary tests (gross savings = penalty, gross savings = penalty + 1 cent).
3. **Distance & Locality Tests**:
   - Unit tests verifying haversine distance calculation between known store coordinates.
   - Coordinate fallback handling when one or both stores lack lat/long.
4. **End-to-End Playwright Tests**:
   - Browsing deals nearby -> adding deal to list -> comparing basket with extra stop penalty applied.
   - Capturing desktop and mobile screenshots into `docs/images/mission-006/`.

---

## 7. Definition of Done
1. Local sale discovery feed implemented with 7-day promotional expiration rules.
2. Configurable extra-stop penalty model integrated into comparison results and optimizer engine.
3. Inter-store distance displayed when coordinates exist.
4. Optimizer candidate pruning implemented addressing `GO-004`.
5. All new and existing unit, integration, and E2E tests passing.
6. Documentation updated (`MISSION_FRAMEWORK.md`, `AGY_HANDOFF.md`, `.product/mission_state.json`).
7. Pull request created targeting `main` without merging.

---

## 8. Successor Contract
Upon completion, review, and acceptance of Mission 006, the product team may authorize Mission 007 focusing on Package Size Equivalence, Unit Pricing Normalization ($/oz, $/lb), or Authorized Partner Retailer Ingestion where a legitimate API path exists.
