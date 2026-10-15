# Grocery Optimizer
## Mission 002 — Official Kroger API Integration

**Predecessor:** `docs/MISSION_001.md`  
**Campaign ID:** `2026-09-27-continuous-improvement`  
**Status:** SPECIFICATION READY; IMPLEMENTATION NOT STARTED

---

## 1. Inherited Product State

Mission 001 successfully delivered the complete initial consumer vertical slice:
- **Frontend**: Accessible, mobile-first React 18 / TypeScript / Vite UI supporting canonical catalog search, list creation, quantity controls, price comparison, per-store shopping instructions, and local list persistence.
- **Backend**: FastAPI modular monolith exposing REST endpoints with strict Pydantic schemas, integer-cent arithmetic, and zero database model leakage.
- **Optimizer**: Pure deterministic exhaustive optimizer (`backend/app/optimizer/engine.py`) calculating cheapest single-store and <=2-store plans, stable tie-breaking, and unfulfillable item diagnostics.
- **Persistence**: PostgreSQL, SQLAlchemy 2.0, Alembic migrations, and deterministic seed data.
- **Retailer Provider Abstraction**: `RetailerProvider` protocol mediating store and offer retrieval from the API layer (`backend/app/providers/base.py`).

### Inherited Findings & Debt from Mission 001
- `GO-001` (Architectural coupling to direct DB models) was **REMEDIATED** in Mission 001 via `RetailerProvider` dependency injection.
- `GO-002` (In-memory catalog scan): Needs database trigram index (`pg_trgm`) or indexed full-text search as catalog grows.
- `GO-004` (Exhaustive store enumeration complexity): Acceptable for small store sets; requires candidate store pruning when scaling to dozens of stores.
- `GO-005` (Docker CLI local availability): Local development supported natively via system PostgreSQL or Docker Compose.

---

## 2. Objective & Consumer Value

**Primary Objective**: Integrate real grocery store pricing and store availability by connecting the `RetailerProvider` boundary to the official Kroger Developer API.

**Consumer Value**: Shoppers can compare their grocery lists against real, live pricing at actual neighborhood Kroger stores instead of mock data, experiencing real-world monetary savings.

---

## 3. Scope of Mission 002

### In-Scope
1. **Kroger Provider Implementation (`backend/app/providers/kroger.py`)**:
   - Implement `RetailerProvider` protocol.
   - OAuth2 Client Credentials flow (`https://api.kroger.com/v1/connect/oauth2/token`) with token expiration caching.
   - Location lookup (`https://api.kroger.com/v1/locations`) to resolve store location and metadata.
   - Product search & price lookup (`https://api.kroger.com/v1/products`) using canonical product UPC or normalized search term.
   - Normalization of Kroger API responses into domain `ProductOffer` and `Store` models.
2. **Deterministic Mock Fallback**:
   - If Kroger credentials (`KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`) are absent, the application gracefully operates using `MockRetailerProvider`.
   - Automated tests run against mock responses or deterministic recorded VCR/cassette fixtures, requiring no live internet access in CI.
3. **Store Location Selection**:
   - Minimal consumer UI input for ZIP code to discover nearby physical stores (or default to configured local store).
4. **Resilience & Rate Limiting**:
   - Resilient retry with exponential backoff on HTTP 429 / 5xx.
   - Circuit-breaking on network timeouts.

### Out of Scope (Non-Goals)
- Scraping Walmart, Target, or any retailer without an official API.
- Checkout or cart modification on Kroger.com.
- Digital coupons or loyalty barcode scanning (deferred to future missions).
- AI or fuzzy cross-brand substitutions (deferred to Mission 003).

---

## 4. Architectural Constraints

- The pure optimizer (`backend/app/optimizer/engine.py`) must remain completely untouched by Kroger API specifics.
- Retailer-specific structures (e.g., Kroger UPC codes, customer loyalty tiers, fulfillment types) must be normalized at the provider boundary.
- All monetary pricing from Kroger (dollars and cents) must be immediately converted to integer cents before reaching the optimizer or frontend.
- Zero external secrets must ever be committed to git.

---

## 5. Verification & Acceptance Criteria

1. Backend unit tests cover Kroger OAuth token refresh and response normalization with deterministic fixtures.
2. Integration tests verify provider failover to `MockRetailerProvider` when credentials are omitted.
3. Live end-to-end comparison succeeds when valid Kroger credentials are provided.
4. All static checks (Ruff, Mypy, ESLint, TypeScript, Vitest) pass.
5. CI passes with zero required external credentials.

---

## 6. Successor Mission Contract

After completion and independent audit of Mission 002, the supervisor may synthesize `docs/MISSION_003.md` (Product Normalization & Cross-Retailer Matching).

### Execution Boundary
- Do not recursively call `howl orchestrate`.
- Do not recursively call `howl factory`.
- Return control to outer supervisory process.
