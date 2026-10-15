# Grocery Optimizer

Grocery Optimizer is a consumer application that answers one essential question:

> **Where should I buy the items on my grocery list to spend the least money?**

A shopper builds a grocery list, compares it across stores, and immediately sees:
- The cheapest complete single-store shopping trip.
- The cheapest complete shopping plan using up to two stores.
- The exact dollar savings and additional stop count when splitting the trip.
- Which items to purchase at each store, including sale callouts.

---

## Architecture Overview

Grocery Optimizer is designed as a clean, modular monolith with strict separation between business logic, persistence, and presentation:

- **Frontend**: React 18, TypeScript, Vite, TanStack Query. Mobile-first, accessible (WCAG 2.1 AA), with >=44px touch targets and full keyboard support. Includes Rapid Shopping Trip multi-item batch entry and regional pilot store chips.
- **Backend API**: Python 3.11+, FastAPI, Pydantic v2. Clean REST contracts exposing monetary amounts strictly in integer cents. Capability-based authorization via `X-Edit-Token` headers for privacy-preserving observation ownership without accounts.
- **Optimizer Engine**: Pure deterministic logic (`backend/app/optimizer/engine.py`). Independent of FastAPI, SQLAlchemy, or specific retailers. Evaluates complete one-store and two-store combinations with locality/ZIP filtering.
- **Canonical Catalog & Search**: Deterministic search (`backend/app/catalog/search.py`) with normalized text, alias resolution, prefix/substring ranking, and strict canonical product equivalence.
- **Retailer Provider Abstraction**: Provider protocol (`backend/app/providers/base.py`) returning normalized `ProductOffer` objects. Distinct providers for synthetic demonstration data (`DemonstrationProvider`) and real crowd-sourced observations (`UserContributedProvider`).
- **Physical Store Identity**: Location-aware store model distinguishing retailer brand, physical street address, city, state, and ZIP code (initial pilot: ZIP 48042, Macomb County, MI).
- **Persistence**: PostgreSQL, SQLAlchemy 2.0, Alembic migrations.
- **Testing**: Deterministic backend unit/integration tests with `pytest` (49 tests), frontend component/unit tests with `Vitest` and `jsdom` (15 tests), and real headless Chromium browser workflows via `Playwright`.

---

## Getting Started

### Prerequisites

- **Python**: 3.11 or newer (managed with `uv` or `python3 -m venv`)
- **Node.js**: v20 or newer
- **PostgreSQL**: 16+ (via Docker Compose or local PostgreSQL service)

---

### 1. Database Setup

You can run PostgreSQL via Docker Compose:

```bash
docker compose up -d
```

Or connect to an existing local PostgreSQL instance.

---

### 2. Backend Setup & Configuration

1. Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```

2. Set up the Python virtual environment and install dependencies:
   ```bash
   cd backend
   uv venv
   source .venv/bin/activate
   uv pip install -e ".[dev]"
   ```
   *(Alternatively, using standard pip: `python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`).*

3. Run Alembic database migrations:
   ```bash
   alembic upgrade head
   ```

4. Seed deterministic mock catalog and retailer offers:
   ```bash
   python -m app.seed.seeder
   ```

5. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

   The backend will be available at `http://127.0.0.1:8000`. Interactive OpenAPI documentation is accessible at `http://127.0.0.1:8000/docs`.

---

### 3. Frontend Setup

1. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```

   The consumer application will be available at `http://localhost:5173`. Vite proxies `/api` requests directly to `http://127.0.0.1:8000`.

---

## Verification & Testing

### Backend Verification

From the repository root or `backend/` directory:

```bash
# Run pytest test suite (optimizer, catalog search, persistence, and REST API integration)
backend/.venv/bin/pytest backend/tests

# Run Ruff linter
backend/.venv/bin/ruff check backend/app backend/tests

# Run Mypy type check on core modules (domain, optimizer, catalog)
backend/.venv/bin/mypy --config-file backend/pyproject.toml backend/app/domain backend/app/optimizer backend/app/catalog
```

### Frontend Verification

From the `frontend/` directory:

```bash
# Run Vitest test suite
npm test

# Run ESLint
npm run lint

# Run TypeScript type check
npm run typecheck

# Run Production Build
npm run build
```

---

## Technical Details & Design Decisions

### Monetary Representation
All monetary values are represented as integer cents (`total_cents`, `savings_cents`, `unit_price_cents`, `subtotal_cents`) across domain models, database columns, optimizer calculations, and REST APIs. Floating-point arithmetic is prohibited to prevent precision drift. The frontend formats cents into standard currency strings solely for display.

### Stable Tie-Breaking
When multiple shopping plans produce identical total costs:
1. Plans utilizing fewer stores are preferred (e.g., a 1-store trip is preferred over a 2-store split of equal cost).
2. Combinations are compared lexicographically by their stores' stable ordering keys (`sort_order` ascending, then store `id` ascending).
3. Within a combination, if an item has identical effective prices at multiple stores, it is assigned to the store with the lower `sort_order`.

### Anonymous Saved Lists
Shopper grocery lists are anonymous and persisted in PostgreSQL using random UUIDv4 identifiers. Browsers retain created list references in `localStorage`.
- **Known limitations**:
  - Clearing browser storage removes local references to saved lists.
  - Lists do not synchronize automatically across different devices or browsers.
  - Anyone possessing a list's UUID can view or edit the list.
  - No recovery mechanism exists if a list ID is lost.
  - If a saved list ID is deleted or missing from the backend, the UI removes it gracefully without crashing.

### Capability-Based Observation Ownership (Mission 003 / GO-007)
To safeguard user contributions without introducing high-friction, privacy-invasive user registration (no passwords, emails, or phone numbers), Grocery Optimizer employs **capability-based authorization**:
- When a price observation is created, the backend securely generates a high-entropy secret token (`secrets.token_urlsafe(32)`).
- The server stores only the SHA-256 digest (`edit_token_hash`). Raw tokens are never persisted in the database and are strictly redacted from public GET endpoints.
- The raw token is returned once to the submitting client upon creation and saved in the browser's `localStorage` (`grocery_optimizer_observation_tokens`).
- Modification (`PATCH /api/price-observations/{id}`) and deletion (`DELETE /api/price-observations/{id}`) require the client to supply the capability token in the `X-Edit-Token` HTTP header. Invalid or missing tokens receive `403 Forbidden`.
- **Duplicate submission races**: Duplicate submissions from different contributors create separate observations rather than overwriting someone else's record.
- **Known limitations**:
  - Clearing browser storage or switching devices removes the local edit capability; the observations remain public but can no longer be edited or deleted by that client.
  - Incognito/private browsing sessions do not retain capability tokens across sessions.

### Physical Store Identity & Locality (Mission 003 / GO-008)
Physical stores are identified by their composite location: retailer brand, physical street address, city, state, and ZIP code:
- Stores sharing a brand name across different ZIP codes (e.g., *Meijer #206* in Lenox `48042` vs *Meijer #54* in Shelby `48316`) are strictly separated into distinct physical store records.
- Stores without verified location attributes are explicitly flagged `is_unresolved_location=True` and excluded from localized shopping comparisons.
- Regional testing pilot centers on **ZIP 48042** (Lenox Township / New Haven, Macomb County, MI).

### Conflict Resolution & Staleness
When multiple shoppers record prices for the same product at the same physical store:
- Observations from the same date preserve temporary sale/promotional pricing distinctly from regular pricing.
- Multiple regular observations on the same date resolve to a robust **median consensus price** rather than blindly favoring the newest entry.
- Observations older than 30 days are automatically tagged `is_stale=True` with visual callouts in the UI.

### Rapid Shopping Trip Batch Entry (Mission 003 / GO-009)
Shoppers recording prices after an in-store trip or from a paper receipt can utilize **Shopping Trip Mode** (`POST /api/price-observations/batch`):
- Store identity, locality, and date are entered once.
- Products and shelf prices are added rapidly in sequence.
- Reduces contributor actions from ~30 manual clicks to ~13 actions for 5 items (>55% friction reduction).

### Optimizer Complexity Note
Mission 001 implements exhaustive enumeration over single stores and unordered pairs of stores. For $N$ stores, this evaluates $N + \binom{N}{2} = O(N^2)$ candidate combinations. With location-based filtering (e.g. `zip_code=48042`), the candidate set $N$ is naturally bounded to local stores, keeping optimization latency under 5 milliseconds.

