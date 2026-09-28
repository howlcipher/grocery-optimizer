# Grocery Optimizer
## Mission 001 — First Consumer Vertical Slice

Status: specification ready, implementation not started.

This document is the complete, standalone specification for Mission 001. An
implementation agent must be able to plan and deliver this mission from this
file alone, without any prior chat context. Read the entire document before
planning.

Where this document says "must", the requirement is mandatory. Where it says
"should" or "recommended", the implementer may choose a different approach if
it is simpler and still satisfies every mandatory requirement; record the
decision in the completion report.

---

## 1. Product Identity

Grocery Optimizer is a standalone consumer application.

It is NOT:

- a Howl subsystem
- a Howl plugin
- another Howl application
- part of HowlPlane

The Howl ecosystem is used to build, test, review, and maintain Grocery
Optimizer as an external product. No Howl code, Howl runtime, or HowlPlane
dependency belongs in this repository's application code.

The primary product question is:

> Where should I buy the items on my grocery list to spend the least money?

---

## 2. Mission 001 Goal

Build the first complete consumer-facing vertical slice.

A normal nontechnical user must be able to:

1. Build a grocery list.
2. Compare the list against several mock grocery stores.
3. See the cheapest complete one-store trip.
4. See the cheapest overall plan using no more than two stores.
5. See how much money the split-store plan saves.
6. See which items to buy at each store.
7. Save a list.
8. Return to that list later on the same device.

Mission 001 uses MOCK RETAILER DATA ONLY. No real retailer API integration
belongs in this mission.

---

## 3. Technology

| Area | Choice |
| --- | --- |
| Frontend | React, TypeScript, Vite, TanStack Query |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Backend tests | pytest |
| Frontend tests | Vitest (plus React Testing Library where useful) |
| Local dependencies | Docker Compose for PostgreSQL |
| CI | GitHub Actions |

Architecture:

- modular monolith
- REST API (JSON)
- clear frontend/backend boundary: the frontend talks to the backend only
  over HTTP

Prohibited:

- microservices
- Kubernetes
- Redis (it is not needed for any Mission 001 requirement; do not add it)
- message queues or background workers

### 3.1 Recommended repository layout

This layout is recommended, not mandatory. Keep it flat and obvious.

```
backend/
  pyproject.toml
  alembic.ini
  alembic/                 migrations
  app/
    main.py                FastAPI app factory and router wiring
    config.py              settings loaded from environment
    api/                   HTTP routes and Pydantic request/response schemas
    domain/                plain domain types (no FastAPI, no SQLAlchemy)
    catalog/               canonical catalog search (the "matching" concern)
    optimizer/             pure optimization logic (no FastAPI, no SQLAlchemy)
    providers/             retailer provider boundary and MockRetailerProvider
    persistence/           SQLAlchemy models and repositories
    seed/                  deterministic mock data and seeding command
  tests/
frontend/
  package.json
  vite.config.ts
  src/
    api/                   typed HTTP client and TanStack Query hooks
    components/
    pages/
    lib/                   presentation helpers (e.g. money formatting)
  src/**/*.test.tsx
docker-compose.yml         PostgreSQL for local development
.env.example
.github/workflows/ci.yml
docs/MISSION_001.md
README.md
```

---

## 4. Consumer Experience

Ease of use is a first-class requirement, equal in importance to correctness.

The shopper must never need to understand or see:

- UPCs
- SKUs
- retailer product IDs
- database IDs
- APIs
- matching scores
- optimizer terminology
- confidence scores

Use:

- simple grocery language ("Add item", "Compare prices", "Buy at Fresh Basket")
- clear prices formatted as currency (for example `$72.18`)
- large touch targets (at least 44 by 44 CSS pixels)
- mobile-first responsive design that also works on desktop
- obvious primary actions
- sensible defaults (new items default to quantity 1)
- minimal configuration (no settings screen is needed in Mission 001)

Avoid:

- enterprise dashboards
- dense tables
- configuration-heavy screens
- technical jargon
- unnecessary modals
- developer-oriented UX

### 4.1 Reference flow

List screen:

```
Grocery Optimizer

My List

Milk
Eggs
Cheerios
Chicken Breast
Coffee

[ Add Item ]

[ Compare Prices ]
```

Results screen:

```
BEST ONE-STORE TRIP

Fresh Basket
$72.18


CHEAPEST OVERALL

Value Foods + Fresh Basket
$65.94

Save $6.24

1 additional stop
```

Below the summary, clearly group the products the shopper should buy at each
store, for example:

```
Buy at Value Foods
  Whole Milk, 1 gallon      x1   $3.29
  Large Eggs, 12 count      x2   $5.98

Buy at Fresh Basket
  Cheerios Original, 18 oz  x1   $4.49
  ...
```

The results screen must also handle, in plain language:

- "No single store has everything on your list." (when no complete one-store
  trip exists, while still showing the two-store plan if one exists)
- "We couldn't find a complete plan. These items aren't available at any
  combination of up to two stores: ..." (when no plan exists)
- "One store is already your cheapest option." (when the best plan of up to
  two stores uses only one store, so there is nothing to save by splitting)

The exact wording may be improved, but the meaning must be preserved.

---

## 5. Architecture Boundaries

### 5.1 Canonical Product

A canonical `Product` represents what the shopper intends to purchase.

Examples:

- Cheerios Original — 18 oz
- Whole Milk — 1 gallon
- Large Eggs — 12 count

### 5.2 ProductOffer

A `ProductOffer` represents a particular store's offer for a canonical
product.

```
Product
    |
    +-- Offer at Store A
    +-- Offer at Store B
    +-- Offer at Store C
```

Retailer-specific API or data structures must never become the application's
core domain model. They are translated into `ProductOffer` at the provider
boundary.

### 5.3 Matching

Matching answers:

> Which product corresponds to what the shopper wants?

In Mission 001, matching is the deterministic catalog search described in
section 7. The shopper picks a canonical product explicitly from suggestions.

### 5.4 Optimization

Optimization answers:

> Given valid offers, where should those products be purchased?

### 5.5 Mandatory separation rules

- Matching and optimization must be separate modules.
- The optimizer must not import FastAPI.
- The optimizer must not import SQLAlchemy or run database queries.
- The optimizer must not depend on any specific retailer.
- The optimizer receives plain normalized input (requested items and offers)
  and returns a plain result.
- React must not contain authoritative pricing or optimizer business logic.
  The frontend only displays results computed by the backend. Formatting
  integer cents as a currency string is presentation and is allowed in the
  frontend.
- API schemas (Pydantic) must not be SQLAlchemy models. Do not expose
  database internals in responses.

---

## 6. Product Equivalence in Mission 001

Be deliberately conservative. Each canonical product is its own identity.

Do NOT automatically treat these as equivalent:

- different package sizes
- different brands
- different flavors
- national brand vs store brand
- vaguely similar grocery products

Concretely:

- Cheerios Original 18 oz and Cheerios Original 12 oz are different canonical
  products.
- Cheerios and Honey Nut Cheerios are different canonical products.
- Store-brand toasted oat cereal is not equivalent to Cheerios.

An offer belongs to exactly one canonical product. The optimizer only
considers offers for the exact canonical product the shopper selected.

Future missions will add unit pricing, package-size normalization,
substitutions, store-brand alternatives, cross-brand comparables, and
preference rules. Do not implement any of them now.

---

## 7. Product Search

Users search a deterministic mock canonical catalog.

Examples:

- `cheer` may suggest `Cheerios Original — 18 oz`.
- `milk` may suggest `Whole Milk — 1 gallon` and `2% Milk — 1 gallon`.

Required behavior:

- case-insensitive matching
- normalized text (trim, collapse whitespace, lowercase, ignore simple
  punctuation)
- optional aliases per product (for example `oj` for orange juice)
- prefix and substring ("contains") matching over product name, brand, and
  aliases
- deterministic result ordering; recommended order: exact match, then prefix
  match, then substring match, then product name ascending, then product ID
  ascending
- a sensible result limit (for example 10)
- an empty or whitespace-only query returns no results (or a documented
  default), never an error page

Prohibited in Mission 001:

- arbitrary fuzzy matching
- LLMs, embeddings, or AI classification
- silently converting free text into an unrelated product

The shopper adds an item by choosing a suggested canonical product. Free text
that matches nothing produces a friendly "No matching products" message; it
is never added to the list as an unknown item.

---

## 8. Retailer Provider Abstraction

Create a small retailer-provider boundary that can later support
`KrogerProvider`, `MeijerProvider`, `WalmartProvider`, and
`MockRetailerProvider`.

Mission 001 implements only `MockRetailerProvider`, which returns
deterministic data.

Guidance:

- Keep the interface minimal and driven by what Mission 001 actually needs
  (for example: list the provider's stores, and list normalized offers for a
  set of canonical products at a set of stores).
- Do not design around hypothetical real-retailer APIs (no auth hooks, rate
  limiters, pagination abstractions, or retry frameworks).
- Normalize retailer data into domain `ProductOffer` values inside the
  provider, before it reaches the rest of the application.

It is acceptable for the mock provider to read seeded offers from PostgreSQL
or from in-code seed definitions, as long as the rest of the application only
sees normalized domain data.

---

## 9. Core Domain Concepts

At minimum:

| Concept | Meaning |
| --- | --- |
| Retailer | A grocery brand (fictional in Mission 001), e.g. "Fresh Basket" |
| Store | A physical location of a retailer, with a stable display name and a stable ordering key |
| Product | A canonical product the shopper intends to buy |
| ProductOffer | One store's normalized offer for one canonical product |
| GroceryList | An anonymous saved list with a non-guessable identifier and an optional name |
| GroceryItem | A canonical product and quantity within a grocery list |
| ShoppingPlan | The result of optimizing a list for a maximum store count |
| ShoppingPlanItem | One requested item assigned to one store's offer, with quantity and subtotal |

Use domain-oriented names in code. Rules:

- A grocery list contains at most one `GroceryItem` per canonical product.
  Adding a product already on the list increases its quantity (subject to the
  quantity limit) instead of creating a duplicate line.
- Comparison results may be computed on demand and do not need to be
  persisted in Mission 001. If they are persisted, they must be clearly
  treated as a snapshot of a specific list state.

---

## 10. Product Offer Data

A normalized `ProductOffer` must be able to represent:

| Field | Notes |
| --- | --- |
| retailer | reference to Retailer |
| store | reference to Store |
| canonical product | reference to Product |
| retailer product identifier | the retailer's own ID; never shown to shoppers |
| UPC | optional; never shown to shoppers |
| product name | as the retailer lists it |
| brand | |
| package quantity | numeric, e.g. `18` |
| package unit | e.g. `oz`, `gal`, `ct`, `lb` |
| regular price | integer cents, required, greater than zero |
| promotional price | integer cents, optional |
| availability | boolean (available / unavailable) |

### 10.1 Money

- Money must never use binary floating point as the authoritative
  representation.
- Mission 001 uses integer cents everywhere in the backend: database columns,
  domain types, optimizer arithmetic, and API responses (for example
  `total_cents: 6594`).
- The frontend formats cents for display only.
- Savings are computed on the backend in integer cents.

---

## 11. Promotional Prices

Mission 001 supports only:

- a regular price
- an optional promotional (sale) price

Effective price rule:

- If the promotional price is present, greater than zero, and strictly less
  than the regular price, the effective price is the promotional price.
- Otherwise the effective price is the regular price.

Promotions have no date windows, eligibility rules, or limits in Mission 001.
The results screen should indicate when an item is on sale (in text, not by
color alone).

Do NOT implement coupons, loyalty programs, membership pricing,
buy-X-get-Y logic, or promotion eligibility systems.

---

## 12. Mock Data

Seed deterministic, realistic data. Seeding must be repeatable: running the
seed twice must not create duplicates or change results.

Minimum contents:

- at least 2 fictional retailer brands
- at least 3 stores in total
- roughly 12 to 20 canonical grocery products
- multiple offers for most products

Recommended fictional names (use these or similar clearly fictional names;
do not use real grocery company names):

- Retailer "Fresh Basket" with stores "Fresh Basket Northside" and
  "Fresh Basket Riverside"
- Retailer "Value Foods" with store "Value Foods Eastgate"

The seed data must include cases demonstrating:

- the same canonical product at different prices across stores
- sale (promotional) pricing
- an unavailable offer
- a store missing a product entirely (no offer)
- the same UPC across stores
- products available at only some stores
- deterministic price ties (identical effective prices at two or more stores,
  and at least one pair of store combinations with identical totals for some
  test basket)
- different package sizes of the same brand/product line, kept as distinct
  canonical products (for example Cheerios Original 12 oz and 18 oz)
- at least one product that is not available at any store (for example
  offered only as unavailable), so the unfulfillable path can be demonstrated

Seed data should be structured so tests can rely on it, but optimizer unit
tests must build their own small fixtures and must not depend on the database
seed.

---

## 13. Required User Workflow

The browser experience must support:

1. Open Grocery Optimizer.
2. Create a grocery list (a new empty list is ready on first visit).
3. Search the mock canonical catalog.
4. Select products from suggestions.
5. Add products to the list.
6. Change item quantity.
7. Remove items.
8. Press Compare Prices.
9. See the cheapest complete one-store trip.
10. See the cheapest complete shopping plan using at most two stores.
11. See savings.
12. See item assignments grouped by store.
13. Save the list (list changes persist to the backend; the shopper may name
    the list).
14. Return to saved lists from the same browser/device.

---

## 14. Optimizer

The optimizer is deterministic, pure business logic.

### 14.1 Inputs

- requested items: canonical product ID and quantity for each
- offers: normalized offers for those products (the optimizer ignores
  unavailable offers)
- store ordering: the stable deterministic ordering of stores
- maximum number of stores: 1 or 2 in Mission 001

### 14.2 Outputs (per maximum store count)

- whether a complete plan exists
- selected stores (only stores that actually receive at least one item)
- for each requested item: selected offer, store, quantity, unit effective
  price, and item subtotal
- total basket price in integer cents
- when no complete plan exists: the list of requested items that cannot be
  fulfilled by any allowed store combination

The comparison response combines both plans and adds:

- savings in cents = best one-store total minus best plan (up to two stores)
  total, only when both plans are complete
- when no complete one-store plan exists, savings are not reported as a
  number; the UI explains that no single store has everything
- the number of additional stops (stores in the best plan minus 1)

### 14.3 Algorithm

Use understandable exhaustive enumeration. Do not introduce a general
mathematical optimization framework (no linear programming or solver
libraries).

For each allowed combination of stores (every single store, and for
max stores 2 every unordered pair of distinct stores plus every single
store):

1. For each requested item, find the cheapest available offer among the
   combination's stores.
2. If any requested item has no available offer within the combination, the
   combination is incomplete and is discarded.
3. Otherwise compute subtotals (effective price times quantity) and the
   total.
4. Record the stores actually used.

Choose the best complete combination by the tie-breaking rules below.

With a handful of stores this is trivially fast. Document the complexity
(number of combinations grows with the square of the store count) as known
technical debt for future missions with many stores.

### 14.4 Tie breaking

For equal totals:

1. Prefer fewer stores used.
2. Then prefer the combination whose stores come first in the stable store
   ordering, comparing the sorted list of used stores element by element.

Within a combination, when an item has the same effective price at more than
one store, assign it to the store that comes first in the stable store
ordering.

Stable store ordering: each store has an explicit ordering key (recommended:
a unique `sort_order` integer, falling back to a unique store code). Document
the chosen key in code and in the README of the backend or in API docs. The
ordering must not depend on database insertion order, hash order, or
dictionary iteration order.

Tie behavior must be covered by tests.

### 14.5 Missing items

- If no single store can fulfill the complete basket but two stores can:
  clearly report that no complete one-store option exists, and still show the
  valid two-store plan.
- If no allowed combination can fulfill the basket: do not crash, do not
  silently omit required items, clearly tell the user no complete plan
  exists, and identify the unfulfilled grocery items by their shopper-facing
  names.
- Never report an incomplete basket as complete.
- An empty list cannot be compared; the UI disables Compare Prices and the
  API returns a clear validation error.

### 14.6 Quantities

- Quantity must correctly affect price. Example: eggs at $3.00 with quantity
  2 gives a subtotal of $6.00 (600 cents).
- Quantities are whole numbers.
- Reject zero, negative, and non-integer quantities.
- Upper limit: 99 per item. Reject larger values with a clear message.
- Recommended list size limit: 100 items per list.

---

## 15. Anonymous Saved Lists

Mission 001 must NOT introduce user accounts.

Required approach (or an equivalently simple design):

- Lists persist in PostgreSQL.
- Each list has a non-guessable identifier (for example a random UUIDv4 or a
  URL-safe token with at least 122 bits of randomness). Sequential integer
  IDs must not be exposed.
- Browser `localStorage` tracks the IDs of lists created or opened on that
  browser, with a name and last-updated time for display.
- The home screen shows "Your saved lists" from `localStorage` and lets the
  shopper reopen or start a new list.
- If a stored list ID no longer exists on the server, the UI removes it from
  the saved list gracefully instead of showing an error page.

Do not add usernames, passwords, OAuth, profiles, or account registration.

Document these limitations in the README and completion report:

- Clearing browser data loses access to saved lists.
- Lists do not sync across devices or browsers.
- Anyone who obtains a list's identifier can view and modify that list.
- There is no recovery mechanism for a lost list identifier.

---

## 16. API

Create a clean REST API with JSON request and response bodies. Exact routes
are an implementation decision. A recommended shape:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness check |
| GET | `/api/products?q=milk` | catalog search |
| POST | `/api/lists` | create a list (optional name) |
| GET | `/api/lists/{list_id}` | retrieve a list with its items |
| PATCH | `/api/lists/{list_id}` | modify list properties (e.g. name) |
| POST | `/api/lists/{list_id}/items` | add an item (product ID and quantity) |
| PATCH | `/api/lists/{list_id}/items/{item_id}` | update quantity |
| DELETE | `/api/lists/{list_id}/items/{item_id}` | remove an item |
| POST | `/api/lists/{list_id}/compare` | compare the current list and return both plans |

Requirements:

- Use Pydantic models for all request and response bodies.
- Validation errors return HTTP 422 (or 400) with a readable message the
  frontend can show.
- Unknown list or item returns HTTP 404 with a readable message.
- Unknown product ID when adding an item returns a clear client error.
- Money fields are integer cents with explicit names (for example
  `total_cents`, `savings_cents`).
- Do not expose SQLAlchemy models, internal integer primary keys, stack
  traces, or SQL errors in responses.
- Retailer product IDs and UPCs are not needed by the frontend and should
  not be returned by consumer endpoints.
- FastAPI's generated OpenAPI documentation should remain available for
  developers.
- CORS must allow the local Vite dev server origin; configure the allowed
  origin through the environment.

---

## 17. Accessibility

- Use semantic HTML (headings, lists, buttons, forms, landmarks).
- All functionality works with the keyboard alone, including search
  suggestion selection.
- All form controls have visible labels or accessible names.
- Validation messages are readable text, associated with their controls, and
  announced to assistive technology where practical.
- Focus states are clearly visible.
- Text and controls meet WCAG 2.1 AA contrast.
- Touch targets are at least 44 by 44 CSS pixels.
- Important information is never conveyed by color alone (for example sale
  prices and unavailable items carry text labels).

---

## 18. Local Development

A fresh checkout must have clear README instructions for:

- backend dependency installation
- frontend dependency installation
- starting PostgreSQL (Docker Compose)
- environment configuration (copy `.env.example` to `.env`)
- running Alembic migrations
- seeding deterministic mock data
- starting FastAPI
- starting React (Vite)
- running backend tests, frontend tests, type checking, lint, and the
  production build

Requirements:

- Provide `.env.example` with safe local defaults (for example a local
  PostgreSQL URL and the frontend origin). Use obviously local development
  values only.
- Do not commit secrets or a real `.env`. Add `.env` to `.gitignore`.
- Mission 001 must not require any real retailer credentials.
- Document the exact tool versions required (Python, Node.js, PostgreSQL).
- Every command written in the README must actually work on a fresh
  checkout. Do not document commands that do not exist.

---

## 19. Test Requirements

### 19.1 Backend (pytest)

Must cover at least:

- cheapest complete one-store plan
- cheapest complete two-store plan
- promotional prices (including a promo that is not lower than regular and
  is therefore ignored)
- quantities affecting subtotals and totals
- unavailable offers being ignored
- missing products (no offer at a store)
- incomplete one-store basket with a valid two-store plan
- completely unfulfillable basket, with the unfulfilled items identified
- maximum-store limit (a plan never uses more stores than allowed)
- deterministic tie breaking (fewer stores first, then stable store order,
  and per-item ties)
- safe money calculations (integer cents, no floating point drift)
- quantity validation (zero, negative, above the limit)
- list persistence (create, retrieve, add, update, remove, rename)
- catalog search (case-insensitive, prefix, contains, alias, no match,
  deterministic order, distinct package sizes)
- comparison API flow end to end through HTTP against a test database

Optimizer tests must call the optimizer directly with in-memory fixtures,
not only through HTTP.

Database-backed tests run against PostgreSQL (the same engine as
production), for example a dedicated test database or a service container in
CI. Do not substitute SQLite for PostgreSQL-dependent behavior.

### 19.2 Frontend (Vitest)

Cover the important consumer behavior without turning Mission 001 into a
large UI-testing project. Recommended:

- searching and adding an item
- changing quantity and removing an item
- rendering comparison results: one-store trip, cheapest overall, savings,
  items grouped by store
- rendering "no single store has everything" and "no complete plan" states
- saved list IDs are recorded in and read from `localStorage`

Mock the HTTP layer in frontend tests; do not require a running backend.

### 19.3 Static checks

- TypeScript type checking (`tsc --noEmit` or equivalent) must pass.
- Frontend production build must pass.
- Use a deterministic Python linter (recommended: ruff) and a JavaScript or
  TypeScript linter (recommended: ESLint). Python type checking (for example
  mypy) is recommended for the optimizer and domain modules.

### 19.4 CI

A GitHub Actions workflow must run on push and pull request and execute:

- backend lint and tests against a PostgreSQL service container, including
  migrations
- frontend install, lint, type check, tests, and production build

CI must not require secrets or network access to any retailer.

---

## 20. External Dependency Rule

Mission 001 must work entirely from local deterministic mock data. The
primary development, test, and demo flow must not require:

- Kroger
- Meijer
- Walmart
- retailer scraping
- internet search APIs
- LLM APIs

Package registries (PyPI, npm) and container images for PostgreSQL are
acceptable for installing dependencies.

---

## 21. Out of Scope for Mission 001

Do NOT implement:

- Kroger integration
- Meijer integration
- Walmart integration
- scraping
- GPS
- ZIP-based store discovery
- route planning
- travel-time optimization
- gas-cost optimization
- user accounts
- authentication
- OAuth
- payment
- retailer checkout
- retailer cart integration
- loyalty cards
- coupons
- loyalty pricing
- push notifications
- email notifications
- price alerts
- observed price history
- price-history graphs
- automatic package-size substitution
- store-brand substitution
- arbitrary cross-brand substitution
- AI matching
- embeddings
- recommendation engines
- Redis
- queues
- microservices
- Kubernetes
- native mobile applications

Do not create speculative infrastructure, placeholders, stub modules, or
feature flags for any of them.

---

## 22. Future Missions (do not implement)

This roadmap is context only. None of it is part of Mission 001.

| Mission | Focus |
| --- | --- |
| 002 | Official Kroger API integration |
| 003 | Stronger normalization and cross-retailer matching, potentially including RapidFuzz |
| 004 | Product/store preferences and controlled substitution rules (for example: always buy this coffee; prefer this store's milk; never substitute this item; store brand acceptable; pay up to $1 more for preferred brand) |
| 005 | Saved staples, recent purchases/lists, and quick-add behavior |
| 006 | Sale discovery and observed price history |
| 007 | Another retailer integration when a legitimate supported API or data-access path is available |
| Later | Unit-price comparison, package-size equivalence, extra-stop penalty, distance, route optimization, smarter recommendations |

---

## 23. Engineering Principles

Implementation agents must:

- prefer straightforward code
- avoid premature abstraction
- avoid microservices
- keep matching separate from optimization
- keep business rules out of React
- keep retailer-specific structures outside the core model
- use deterministic tooling for builds, tests, lint, and type checking
- never fabricate credentials, API keys, or test results
- never call real retailer endpoints in Mission 001
- never treat a TODO, stub, or placeholder as completed functionality
- avoid scope creep; anything outside this document is out of scope
- stop after Mission 001

---

## 24. Howl Execution Expectation

Future `howl orchestrate` runs for this mission must perform, in order:

1. **Planning.** Read this entire document. Produce a plan that maps every
   Definition of Done item (section 25) to concrete work and verification.
2. **Implementation.** Build the backend, frontend, migrations, seed data,
   tests, CI workflow, Docker Compose file, `.env.example`, and README
   instructions.
3. **Deterministic verification.** Run the actual commands (install,
   migrate, seed, lint, type check, tests, build) and record real output.
   Never report a check as passing without running it.
4. **Independent review/audit.** A reviewer independent of the implementer
   audits correctness (especially optimizer and money logic), scope
   compliance, architecture boundaries, accessibility, and consumer UX.
5. **Remediation.** Fix valid in-scope findings. Out-of-scope findings are
   recorded as technical debt or future-mission candidates, not
   implemented.
6. **Rerun affected verification.** After any remediation, rerun the
   affected checks, and run the full gate before final acceptance. Final
   reported results must correspond to the final working-tree state.
7. **Final acceptance.** Confirm every Definition of Done item with
   evidence.
8. **Completion report.** Produce the report defined in section 26.

Do not begin Mission 002 automatically.

---

## 25. Definition of Done

Mission 001 is complete only when a fresh checkout can demonstrate all of
the following:

1. PostgreSQL starts.
2. Backend dependencies install.
3. Frontend dependencies install.
4. Database migrations succeed.
5. Mock seed data loads.
6. FastAPI starts.
7. React starts.
8. User can search canonical mock products.
9. User can add products.
10. User can change quantities.
11. User can remove products.
12. User can compare prices.
13. Cheapest complete one-store trip is calculated correctly.
14. Cheapest complete plan using no more than two stores is calculated
    correctly.
15. Promotional pricing is respected.
16. Missing products are handled correctly.
17. Savings are clearly displayed.
18. Results are grouped by store.
19. User can save a list.
20. Same browser/device can reopen that list.
21. Backend tests pass.
22. Selected frontend tests pass.
23. Frontend type checking passes.
24. Frontend production build passes.
25. CI passes.
26. Independent review completes.
27. No unresolved defect invalidates the main workflow.

---

## 26. Completion Report

At the end of Mission 001, Howl must produce a final report containing:

- **Delivered:** what was built.
- **Consumer workflow:** the end-to-end shopper flow as actually
  implemented.
- **Architecture:** modules, boundaries, data model, and key decisions
  (including any "should" items that were decided differently, with
  reasons).
- **Verification commands and results:** the exact commands run and their
  real results.
- **Independent review findings:** all findings, with severity.
- **Findings that were fixed:** with references to the fixing changes.
- **Known limitations:** including the anonymous saved-list limitations in
  section 15.
- **Technical debt:** including the enumeration complexity note in section
  14.3.
- **Relevant commits/PRs.**
- **Recommended Mission 002:** a short recommendation consistent with
  section 22.

Do NOT execute Mission 002.
