# Mission 006 Specification: Personal Grocery Price Hunter & Portable Linux Release

## 1. Context and Predecessor History
- **Campaign**: `2026-09-27-continuous-improvement`
- **Predecessor**: Mission 005 (`docs/MISSION_005.md`, completed and verified on branch `agy/mission-005`, commit `4c0f298`)
- **Status Inherited**:
  - Mission 001: Core deterministic integer-cent basket optimizer (1-store and 2-store permutations).
  - Mission 002: Real-world user-contributed observation model with strict demonstration data segregation.
  - Mission 003: Capability edit tokens (`GO-007`), physical store composite locality (`GO-008`), and multi-item shopping trip batch entry (`GO-009`).
  - Mission 004: Same-ZIP store isolation (`GO-010`), locality PATCH preservation (`GO-011`), public sliding-window rate limiting & atomic batch validation (`GO-012`), client-side WebAssembly OCR receipt assistant with Michigan bottle deposit filtering, and regional pilot comparisons (ZIPs 48042, 48051, 48315, 48316, 48307).
  - Mission 005: Resolved receipt data integrity defects (`GO-013`, `GO-014`, `GO-015`, `GO-016`), personal staples storage and drawer, one-tap weekly list population, list cloning (`📋 Clone`), client-side purchase history, post-trip staple learning modal, observed canonical price trends, and search benchmark scaling (`GO-002`).
  - Verification Baseline: 57 backend pytest tests, 37 frontend Vitest tests, clean static analysis (Ruff, ESLint, TypeScript, Mypy), clean production build, and full Playwright browser test coverage.

### Inherited Open Findings & Backlog
- `GO-002` (P3 - Performance): In-memory search is effective up to 10k items (tested in M005 benchmark); retained for large scale.
- `GO-004` (P3 - Algorithm): Exhaustive store enumeration complexity grows with $O(N^2)$; secondary for 2-retailer personal household focus, retained in backlog.
- `GO-005` (P4 - Environment): Docker CLI not installed on host machine; addressed by portable native Linux packaging without container dependencies.
- `GO-006` (P3 - Data Coverage): Open Prices ecosystem lacks suburban US geographic density; addressed through targeted price import and observation workflows.
- Backlog from previous Mission 006 draft: 7-day promotional freshness windows, nearby sale discovery feeds, fixed additional-stop penalties, haversine distance displays (retained as secondary enhancements).

---

## 2. Product Direction & Core Objective

**Audience & Deployment Scope**:
Grocery Optimizer is primarily a personal household application for two people.
Primary target operating systems:
- **Bazzite Linux** (immutable desktop / SteamOS-like environment)
- **Linux Mint** (traditional Debian/Ubuntu LTS desktop)
- Broader mainstream Linux distributions (Ubuntu, Fedora, Arch, Debian)

Mobile apps, public SaaS deployment, commercial distribution, and large-scale crowdsourcing are explicitly out of scope.

**Overriding Consumer Goal**:
**Eliminate the repetitive process of searching Kroger and Meijer separately to determine which store has the better grocery prices.**

The application must allow users to:
1. Build their household grocery list.
2. Acquire the best available prices for Kroger and Meijer through verified authorized channels or consumer-friendly import fallbacks.
3. Compare realistic shopping totals side-by-side with exact coverage indicators and item-by-item breakdown.
4. Download, install, launch, update, and back up the software cleanly on Linux without manual configuration of developer toolchains.

---

## 3. Scope of Work (Gates A through G)

### Gate A: Kroger and Meijer Price Acquisition
- Conduct a rigorous feasibility study of retailer price acquisition channels:
  1. Official retailer APIs (Kroger Developer Portal OAuth2 vs Meijer private endpoints).
  2. Authorized partner integrations (Instacart, Flipp, commercial aggregators).
  3. Public product feeds / open datasets.
  4. Consumer-supplied files (circular PDFs, screenshots, cart exports, pasted text).
  5. User-confirmed shelf and receipt observations.
- Comply strictly with retailer terms, bot protection, and access controls (no unauthorized scraping or credential bypass).
- Deliver an honest feasibility matrix documenting authorization, restrictions, store specificity, freshness, costs, and decisions.
- Implement the strongest demonstrably permitted pathway.

### Gate B: Practical Price Import Fallback
- Consumer-friendly import workflow when direct live APIs are blocked or credentials unconfigured:
  - Text paste parser: copy and paste product lines, cart text, or weekly-ad text directly.
  - CSV / delimited file import.
  - Receipt and document OCR: local client-side processing of photos/screenshots.
- Deterministic extraction: item names, package sizes, regular shelf prices, promotional prices, promo conditions.
- Canonical catalog matching with confidence levels and review staging.
- Targeted, list-first workflow: paste prices specifically for the current 12-item grocery list.
- Data integrity: distinguish regular shelf, weekly sale, loyalty, and customer-specific coupons.

### Gate C: Expand Beyond the Demonstration Catalog
- Expand canonical catalog beyond the initial 17 demo products to cover everyday household shopping categories (produce, dairy, bakery, meat, pantry, frozen, beverages, household).
- Save brand, package details, UPCs, and units (oz, fl oz, gal, lb, ct).
- Support store-brand items (Kroger brand, Meijer / True Goodness) distinctly from national brands.
- Support household-created custom products via API and UI.
- Maintain separate SKU identity while enabling equivalent-product price comparisons.
- Unit-price calculations ($/oz, $/lb, $/gal) where quantities are comparable.

### Gate D: The Actual Kroger vs Meijer Price Hunt
- Specialized two-retailer comparison interface:
  - Side-by-side table: Kroger price vs Meijer price per list item.
  - Store identity, observation date, sale badge, unit price, and missing-price indicator.
  - Basket summaries:
    - Cheapest complete Kroger-only basket (with item coverage count, e.g. 12/15).
    - Cheapest complete Meijer-only basket (with item coverage count, e.g. 10/15).
    - Lowest-cost 2-store split trip.
    - Gross savings from splitting.
    - Additional-stop count (0 or 1).
    - Configurable minimum savings threshold (e.g. $3.00) to justify a second stop.
- Truthful reporting: explicitly flag incomplete baskets; never substitute zero or invent prices.

### Gate E: Portable Linux Application
- Zero-dependency personal installation for Bazzite and Linux Mint:
  - Localhost FastAPI backend bundled with compiled static frontend.
  - Support SQLite persistence (`~/.local/share/grocery-optimizer/grocery_optimizer.db`) alongside PostgreSQL.
  - Standard XDG Linux directory hierarchy (`~/.local/share/grocery-optimizer`, `~/.config/grocery-optimizer`).
  - Standalone portable package (`grocery-optimizer-linux-x86_64.tar.gz`) with launcher script and desktop entry.
  - Native Debian package (`grocery-optimizer_0.6.0_amd64.deb`) for Linux Mint.
  - Clean startup, port fallback, and clean shutdown.

### Gate F: Household Data Portability & Backup
- Complete household data export to portable JSON format (`lists`, `staples`, `products`, `observations`, `purchase_history`, `preferences`).
- Redact raw private capability tokens in plain exports while supporting secure full backup.
- Single-click import/restore flow with schema validation and conflict resolution.
- Data survives application updates and system reboots.

### Gate G: Real-World Verification
- Full 15-scenario verification workflow (fresh install, list creation, catalog expansion, Kroger/Meijer price import, matching, comparison, restart persistence, backup/restore).
- Automated backend and frontend test suites.
- Cross-distribution verification evidence for Bazzite and Linux Mint.

---

## 4. Definition of Done
1. Kroger and Meijer price feasibility documented with honest decisions.
2. Working price import assistant (paste, CSV, image/receipt) implemented and verified.
3. Catalog expanded with household essentials, store brands, and custom product creation.
4. Kroger vs Meijer side-by-side comparison with basket totals, coverage indicators, and split savings.
5. SQLite database support implemented and active by default for local desktop use.
6. Standalone Linux portable package and Debian package generated.
7. Backup and restore export/import verified.
8. Zero test regressions (57 backend + 37 frontend preserved, plus new tests).
9. Updated documentation and factory handoff trailer.
