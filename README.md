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

- **Frontend**: React 18, TypeScript, Vite, TanStack Query. Mobile-first, accessible (WCAG 2.1 AA), with >=44px touch targets and full keyboard support.
- **Backend API**: Python 3.11+, FastAPI, Pydantic v2. Clean REST contracts exposing monetary amounts strictly in integer cents.
- **Optimizer Engine**: Pure deterministic logic (`backend/app/optimizer/engine.py`). Independent of FastAPI, SQLAlchemy, or specific retailers.
- **Canonical Catalog & Search**: Deterministic search (`backend/app/catalog/search.py`) with normalized text, alias resolution, prefix/substring ranking, and strict canonical product equivalence.
- **Retailer Provider Abstraction**: Provider protocol (`backend/app/providers/base.py`) returning normalized `ProductOffer` objects.
- **Persistence**: PostgreSQL, SQLAlchemy 2.0, Alembic migrations.
- **Testing**: Deterministic backend unit/integration tests with `pytest`, frontend component/unit tests with `Vitest` and `jsdom`.

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

### Optimizer Complexity Note
Mission 001 implements exhaustive enumeration over single stores and unordered pairs of stores. For $N$ stores, this evaluates $N + \binom{N}{2} = O(N^2)$ candidate combinations. For the 3 mock stores in Mission 001, this executes in fractions of a millisecond. In future missions supporting dozens or hundreds of physical retailer stores, store candidate pruning or heuristic search should be considered.
