# Mission 004 Specification: Interactive Receipt Assistant & Regional Store Intelligence

## 1. Context and Predecessor History
- **Campaign**: `2026-09-27-continuous-improvement`
- **Predecessor**: Mission 003 (`docs/MISSION_003.md`)
- **Status Inherited**:
  - Mission 001: Pure deterministic multi-store optimizer with exact integer-cent math.
  - Mission 002: Segregated demonstration pricing from real user-contributed observations; preserved Open Prices.
  - Mission 003: Resolved `GO-007` (capability-based edit tokens preventing unauthorized modification/deletion), resolved `GO-008` (physical store identity model with brand separation, address, city, state, ZIP code), and resolved `GO-009` (rapid multi-item shopping trip batch entry reducing user friction by >55%).
  - Feasibility Study: Completed `docs/RECEIPT_SCANNING_FEASIBILITY.md` detailing client-side Wasm OCR, regex line parsing, catalog fuzzy matching, and strict PII redaction guardrails.
  - Verification Baseline: 49 backend pytest tests, 15 frontend vitest tests, Playwright browser screenshots.

---

## 2. Objective & Consumer Value

Transform the manual shopping trip entry flow into an **interactive, receipt-assisted workflow** that allows shoppers to photograph a grocery paper receipt on their mobile phone or desktop, extract purchased items and prices entirely on-device, review/edit the extracted draft, and submit the batch in under 30 seconds—without exposing any payment or personal information.

Expand local store pilot intelligence beyond ZIP 48042 to encompass neighboring communities in Southeast Michigan (48051 Chesterfield, 48316 Shelby, 48315 Macomb/Utica, 48307 Rochester) with intelligent store distance awareness.

---

## 3. Scope of Work

### Phase 1: Client-Side Ephemeral Receipt Assistant
- Integrate lightweight in-browser OCR (Tesseract.js / WebAssembly) into `RecordPriceModal` Shopping Trip mode.
- Support direct mobile camera capture (`<input type="file" accept="image/*" capture="environment">`) and desktop image upload.
- Perform client-side canvas contrast enhancement and binarization prior to OCR.
- Zero-retention policy: Images are never uploaded to any backend or cloud service; all OCR processing occurs entirely within the client browser.

### Phase 2: Receipt Line-Item & Header Parsing
- Extract store brand, city, state, and ZIP code from receipt headers to auto-suggest store identity.
- Extract transaction date from receipt header.
- Parse item lines, handling multi-column formats, right-justified price columns, and sale discounts.
- Redact and discard all payment tender lines, card account fragments, authorization codes, and loyalty customer identifiers.

### Phase 3: Fuzzy Catalog Matching & Alias Resolution
- Implement client-side or backend-assisted fuzzy matching (Levenshtein / token-similarity) to bridge POS abbreviations (e.g. `DP W-MLK 1GL`, `KRG ORG EGGS 12CT`) to canonical catalog IDs.
- Present match confidence indicators to the consumer during review.
- Provide quick fallback to manual catalog autocomplete for unrecognized lines.

### Phase 4: Multi-ZIP Regional Comparison Radius
- Extend store selection and price comparison beyond a single exact ZIP code to support nearby radius filtering (e.g., within 5 or 10 miles of 48042).
- Maintain store locality integrity; do not silently merge stores across cities or ZIP boundaries.

---

## 4. Non-Goals
- Fully unsupervised automatic ingestion: OCR extractions must **never** create public observations without explicit consumer review and confirmation.
- Cloud-based third-party OCR APIs (AWS Textract, Google Cloud Vision, OpenAI Vision) that compromise consumer privacy.
- Barcode scanning from physical product packaging (scope is paper store receipts).
- Mixing synthetic mock data with real user observations.

---

## 5. Architectural Constraints
1. **Zero External Cloud Processing**: Receipt images must not leave the consumer's device.
2. **Human-in-the-Loop**: All OCR candidate lines populate the draft batch form (`POST /api/price-observations/batch`) for explicit user confirmation.
3. **Monetary Integrity**: All extracted prices parsed directly into integer cents.
4. **Capability-Based Ownership**: All batch observations continue to receive capability `edit_token`s stored locally in the consumer's browser.
5. **No Regressions**: All 49 backend tests and 15 frontend tests must continue to pass.

---

## 6. Verification Requirements
- Deterministic unit tests for receipt regex parsing, price extraction, discount handling, and PII redaction.
- Catalog fuzzy matching benchmark tests measuring accuracy against common grocery store abbreviations.
- Playwright end-to-end browser tests verifying receipt photo upload, OCR extraction, line confirmation, and batch persistence on both mobile and desktop viewports.
- Security and privacy audit verifying zero network leakage of receipt images.

---

## 7. Definition of Done
1. Ephemeral, in-browser receipt assistant functional in Shopping Trip mode.
2. POS abbreviation fuzzy matcher mapped to canonical catalog products.
3. Strict PII redaction verified with zero server image transmission.
4. Multi-ZIP regional radius comparisons operational.
5. Complete test coverage added with zero regressions across prior missions.
6. Independent security, privacy, and UX review completed.
7. Successor specification `docs/MISSION_005.md` generated.
8. Pull request created targeting `main` without merging.

---

## 8. Successor Contract
Mission 004 does not execute Mission 005. Upon acceptance, Mission 004 generates `docs/MISSION_005.md` (addressing saved staples, purchase history, and staple basket quick-add) and returns control to the master Factory orchestrator.
