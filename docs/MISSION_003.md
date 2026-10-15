# Grocery Optimizer
## Mission 003 — Trusted Prices & Local Store Intelligence

**Predecessor:** `docs/MISSION_002.md` (Accepted & Merged, commit `6b9a0b0`)  
**Campaign ID:** `2026-09-27-continuous-improvement`  
**Specification Status:** AUTHORITATIVE SPECIFICATION  
**Execution Branch:** `agy/mission-003`  

---

## 1. Product State Inherited from Predecessor

Grocery Optimizer completed Mission 001 and Mission 002:
- **Mission 001** delivered the core shopping list engine, canonical catalog search, pure integer-cent optimizer (1-store and 2-store combinations), mock retailer seed data, and mobile-friendly React UI.
- **Mission 002** evaluated retailer API feasibility (Kroger developer terms prohibited database building; Open Prices lacked Southeast Michigan density with 0 cross-store overlapping products in a 100km radius of ZIP 48042). It established the **User-Contributed Pricing Foundation (Path B)**, adding `price_observations` persistence, dynamic offer aggregation, stale date tagging (>30 days), and multi-source separation (`demonstration` vs `user_contributed`).
- **Baseline Verification:** 38 backend tests (`pytest`), 14 frontend tests (`vitest`), clean lint (`ruff`, `eslint`), and clean typechecking (`mypy`, `tsc`).

### Inherited Open Findings
- `GO-002` (P3): Catalog search scans in-memory domain slice; acceptable for MVP, requires full-text index / `pg_trgm` for enterprise scale.
- `GO-004` (P3): Exhaustive store enumeration complexity grows with $O(N^2)$; acceptable for small store networks, requires candidate pruning for large retailer networks.
- `GO-005` (P4): Docker CLI not installed on host machine; local development operates natively via system PostgreSQL service.
- `GO-006` (P3): Open Prices ecosystem lacks sufficient geographic density in US suburban regions (0 overlapping products across stores in SE Michigan); addressed via Path B user observations.

### Mission 003 Target Findings
- `GO-007` (P0/P1 - Security/Integrity): Unprotected observation modification and cross-contributor overwriting. Existing PATCH/DELETE endpoints do not verify contributor ownership; POST duplicate matching overwrites records across different contributors.
- `GO-008` (P2 - Correctness/Architecture): Store identity lacks physical locality. Stores are matched globally on name alone, causing risk of conflating different physical stores across cities/ZIPs.
- `GO-009` (P2 - UX/Friction): High repetitive data-entry friction for recording multiple grocery items observed during a shopping trip.
- `GO-010` (P3 - UX/Trust): Price comparison does not support geographic filtering by consumer locality (e.g. ZIP 48042), and lack of receipt-assisted ingestion slows coverage growth.

---

## 2. Primary Objective & Consumer Value

Transform Grocery Optimizer's user-contributed pricing system into a trustworthy, geographically meaningful, easy-to-use foundation for real grocery shopping.

A normal consumer should be able to:
1. **Record an observed grocery price at a specific physical store** with verified brand and location (city, state, ZIP).
2. **Correct or delete their own recorded price** without requiring user registration, while ensuring another shopper cannot tamper with or delete those observations.
3. **Reuse familiar products and stores** without repetitive typing.
4. **See when a price was observed and how trustworthy it is**, with clear freshness criteria and sale labels.
5. **Compare prices only between relevant physical stores** in their shopping area (pilot ZIP 48042).
6. **Understand when there is insufficient reliable information** for a shopping recommendation rather than being misled.

---

## 3. Scope & Capabilities

### Phase 1: Security and Price Data Integrity
- **Finding A — Capability-Based Ownership**:
  - Securely generate unguessable, cryptographically strong edit tokens (`edit_token`) upon observation creation.
  - Store token securely client-side in browser `localStorage`.
  - Store token hash (`edit_token_hash`) server-side to prevent credential theft from database dumps.
  - Protect `PATCH /api/price-observations/{id}` and `DELETE /api/price-observations/{id}` requiring matching edit token.
  - Fix POST duplicate race: only update if matching edit token is supplied; otherwise record distinct observation.
  - Exclude edit tokens and hashes from public read endpoints (`GET /api/price-observations`, `GET /api/products/{id}/prices`).
  - Document browser-storage / loss-of-device limitations clearly for users.
- **Finding B — Data Quality & Conflict Resolution**:
  - Outlier detection and strict price sanity bounds ($0.01 to $500.00).
  - Multi-contributor resolution: when multiple shoppers record prices for the same store/product, select the freshest valid observation, handle conflicts transparently, and preserve audit trail.
  - Configurable staleness thresholds (default 30 days; configurable via settings/env).
- **Finding C — Public vs Private Data Semantics**:
  - Document that price observations are community-visible.
  - Ensure private notes or user tokens are never leaked to public feeds.
  - Clear consumer notice explaining public contribution and private edit capabilities.

### Phase 2: Real Physical Store Identity
- Enhance `StoreModel` and domain `Store` with location fields: `retailer_id`, `name`, `address`, `city`, `state`, `zip_code`.
- Differentiate retailer brand (e.g., "Meijer", "Kroger", "ALDI") from store location (e.g., "Shelby Township, MI 48316", "Rochester Hills, MI 48307").
- Prevent name-only global merging: store identity is composite `(retailer_id, zip_code, address_or_slug)`.
- Support pilot region: Macomb / Oakland County, MI (e.g., ZIP 48042).
- Migration of existing store data: preserve existing mock stores without disruption; flag unlocated historical user stores as unresolved.
- Easy store selection: remember previously used stores in localStorage; provide store search and location picker.

### Phase 3: Trustworthy Price Comparisons
- Integer-cent monetary integrity across all calculations.
- Display exact observation dates and stale warnings on comparison results and product price views.
- Support geographic filtering: comparison can be scoped to a specific ZIP code or region.
- Do not mix mock demonstration prices and real user observations.
- Clearly report unfulfillable baskets and missing product coverage.

### Phase 4: Reduce Price Entry Friction
- Shopping trip multi-item recording: select store once, then rapidly record prices for multiple items in a single trip workflow.
- Pre-fill and reuse recently selected stores and recently entered products.
- Mobile-friendly touch targets (>= 44px) and smooth keyboard navigation.
- Measure consumer workflow efficiency before vs. after.

### Phase 5: Receipt Scanning Feasibility
- Comprehensive evaluation of client-side (Tesseract.js/Wasm) vs server-side (Python Tesseract/EasyOCR) vs multimodal OCR.
- Camera/photo file input testing.
- Analysis of item text matching against canonical catalog, quantity extraction, discount handling, and privacy hazards (PII/payment data redaction).
- Deliver an evidence-based feasibility report and architecture recommendations for Mission 004.

### Phase 6: Open Prices Dataset Preservation
- Preserve existing Open Prices client, normalizer, and provider without code regressions.
- Retain data isolation: Open Prices, user-contributed observations, and demonstration mock data are never conflated.

---

## 4. Non-Goals
- Mandatory account creation, email verification, or password systems (capability-based tokens fulfill privacy-preserving ownership).
- External commercial OCR subscriptions or sending receipt images to third-party cloud APIs without user consent.
- Scraping retailer websites without authorization.
- Mixing synthetic mock prices with real user prices in any calculation.

---

## 5. Architectural Constraints
1. **Zero Data Pollution**: Demonstration data, user observations, and external datasets remain strictly segregated.
2. **Integer Cent Arithmetic**: All monetary values represented in integer cents.
3. **Capability-Based Authorization**: Edit tokens generated with `secrets.token_urlsafe(32)` or `uuid4`, hashed via SHA-256 for database storage.
4. **Physical Locality**: Stores require explicit locality (brand + city/state/ZIP) to be included in localized comparisons.
5. **Deterministic Testing**: All edge cases, security controls, and calculations verified with automated test suites.

---

## 6. Verification Requirements
- All 38 existing backend tests and 14 frontend tests pass without regression.
- New deterministic tests covering:
  - Unauthorized modification/deletion (HTTP 403/401).
  - Authorized modification/deletion with valid token (HTTP 200).
  - Cross-contributor overwrite prevention.
  - Physical store identity and location-aware deduplication.
  - Location-scoped price comparisons (ZIP 48042).
  - Trip / multi-item observation recording.
- Full Playwright browser verification on desktop (1280x800) and mobile (375x812) viewports.
- Lint and typechecks pass (`ruff`, `mypy`, `eslint`, `tsc`).

---

## 7. Definition of Done
1. Authoritative `docs/MISSION_003.md` established.
2. Finding `GO-007` reproduced and resolved with capability-based edit authorization.
3. Finding `GO-008` resolved with location-aware physical store identity and database migrations.
4. Finding `GO-009` resolved with reduced friction trip recording and recent store selection.
5. Geographic comparison filtering supported.
6. Receipt scanning feasibility documented in `docs/RECEIPT_SCANNING_FEASIBILITY.md`.
7. Full automated test suite passing and Playwright browser evidence captured.
8. Independent review completed and findings remediated.
9. Successor specification `docs/MISSION_004.md` generated.
10. Git PR created targeting `main` without merging.

---

## 8. Successor Contract
Mission 003 does not execute Mission 004. Upon completion and acceptance, Mission 003 generates `docs/MISSION_004.md` incorporating receipt scanning findings, advanced store normalization, and community data density growth, then concludes with the factory handoff trailer.
