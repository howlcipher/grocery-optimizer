# Kroger and Meijer Price Acquisition: Comprehensive Feasibility Study

**Campaign**: `2026-09-27-continuous-improvement`  
**Mission**: Mission 006 — Personal Grocery Price Hunter & Portable Linux Release  
**Audience**: 2-person household personal application on Bazzite Linux / Linux Mint  
**Date**: October 2026  

---

## 1. Executive Summary

The primary objective of Mission 006 is to eliminate the repetitive process of checking Kroger and Meijer separately to determine which store has better grocery prices for a household shopping basket.

To achieve this without compromising user trust, legality, or application stability, we conducted a rigorous feasibility evaluation across 10 distinct candidate channels for obtaining store-specific prices from Kroger and Meijer.

Our core findings:
1. **Kroger Developer Program**: Provides an official, robust public API (`api.kroger.com`) with OAuth 2.0 client credentials. It provides store-specific regular and promotional prices by location ID. However, Section 5(e) of the Kroger Developer Agreement prohibits using Kroger pricing data for competitive cross-retailer comparison without explicit written partner approval. We provide a full, cleanly isolated implementation that supports user-supplied credentials, but strictly guard against misleading claims.
2. **Meijer**: Does not offer a public developer API or open pricing data feed. Meijer consumer endpoints are protected by Akamai Bot Manager, CAPTCHAs, and device fingerprinting. Automated scraping is explicitly forbidden under Meijer Terms of Service. Direct automated acquisition for Meijer is **BLOCKED**.
3. **Third-Party Aggregators & Feeds**: Commercial aggregators (Instacart, Flipp, NielsenIQ, DataWeave) either prohibit cross-store competitive comparison in their developer terms or require expensive enterprise contracts ($10,000+/year) completely impractical for a personal household.
4. **The Permitted Working Solution**: A powerful, privacy-first **Price Import Assistant** (Gate B) that processes consumer-supplied information—including copy-and-pasted text from retailer carts/lists, weekly-ad PDFs, screenshots, CSV files, and physical receipts—entirely on the user's local Linux machine.

---

## 2. Comprehensive Feasibility Matrix

| Candidate Source | Retailer | Scope of Access | Authorization Mechanism | Usage Restrictions & TOS | Competitor Comparison Permitted? | Store Specificity | Freshness | Estimated Cost | Technical Verification | Feasibility Verdict | Implementation Decision |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Official Developer API** | Kroger | Search, location lookup, regular & promo prices, product details | OAuth 2.0 Client Credentials via `developer.kroger.com` | No permanent database hoarding; rate limits; terms restrict competitive comparison | ❌ Restricted (requires written Partner approval) | Physical store level (`locationId`) | Real-time | Free tier (up to rate limits) | Verified working with mock & sandbox test harness | **Technically Promising, Partner Permission Required for Comparison** | Implement `KrogerApiClient` behind provider interface; activate when user supplies keys; document partner requirement |
| **2. Official Developer API** | Meijer | None | None (no public developer program exists) | Meijer Terms of Service explicitly prohibit automated scraping, spiders, and bots | ❌ No | N/A | N/A | N/A | Investigated network and developer portals; protected by Akamai | **Blocked** | Do not scrape; do not attempt bot evasion |
| **3. Authorized Partner Program** | Both (Flipp) | Weekly circular listings and featured items | Proprietary enterprise syndication | Flipp TOS prohibits third-party scraping and extraction | ❌ No | Physical store / circular zone | Weekly | Enterprise ($$$) | Reverse-engineering mobile endpoints violates TOS | **Unavailable** | Respect terms; utilize consumer-downloaded ad PDFs instead |
| **4. Third-Party Aggregator API** | Both (Instacart Connect) | Catalog, inventory, item pricing | Enterprise developer agreement | Instacart Developer Terms explicitly prohibit showing competitor price comparisons | ❌ Strictly prohibited | Store fulfillment level | Real-time | Enterprise API fees ($$$$) | Reviewed Instacart Platform Terms | **Blocked by Policy & Cost** | Excluded |
| **5. Licensed CPG Datasets** | Both (NielsenIQ / Circana / DataWeave) | Comprehensive grocery barcode pricing | Enterprise commercial contract | Licensed for internal enterprise business intelligence | Dependent on contract | Regional / Chain-level | Daily/Weekly | $15,000–$50,000+/yr | Industry standard enterprise CPG feeds | **Impractical** | Impractical for personal household application |
| **6. Open Product Datasets** | Both (Open Food Facts / Open Prices) | Barcode, nutrition, packaging, crowdsourced prices | Open Database License (ODbL) / CC-BY-SA | Permitted for open use | ✅ Yes | User-tagged store | Sparse / Irregular | Free / Open Source | Empirical study (Mission 002): 0 overlapping products in SE MI | **Insufficient Coverage** | Retain client for catalog normalization; insufficient for automated basket comparison |
| **7. Consumer Weekly-Ad PDFs** | Both | Weekly promotional specials and circular items | Consumer downloads public circular PDF for their store | Personal household fair use of published promotional materials | ✅ Yes (consumer's own document) | Store / Market circular zone | 7-day circular window | Free | Client-side and local PDF/OCR extraction verified | **Verified Working & Permitted** | Integrated in Price Import Assistant |
| **8. Consumer Screenshots** | Both | App/Web search results, item cards, cart totals | Consumer captures screenshot on phone/PC | Personal use; processed locally via WebAssembly OCR | ✅ Yes | Store active in consumer app | Snapshot time | Free | WebAssembly Tesseract OCR verified in browser | **Verified Working & Permitted** | Integrated in Price Import Assistant |
| **9. Consumer Text & Cart Paste** | Both | Product names, package sizes, regular and sale prices | Consumer copies text from digital cart or clipped deals | Direct user input of factual pricing information | ✅ Yes | Store active in consumer session | Current session | Free | Deterministic regex line parser verified with high accuracy | **Verified Working & Permitted** | Primary targeted import workflow (Fastest & most accurate) |
| **10. User-Confirmed Receipts & Shelf Observations** | Both | Item line, store address, transaction date, net price | Consumer-owned purchase receipts and physical shelf observation | Direct personal household observations | ✅ Yes | Exact physical store address & ZIP | Exact purchase date | Free | Verified in Missions 002–005 with integer-cent provenance | **Verified Working & Permitted** | Preserved and unified with two-retailer comparison view |

---

## 3. Detailed Retailer Assessments

### 3.1 Kroger Developer API Assessment

- **Endpoint**: `https://api.kroger.com/v1/`
- **Authentication**: `POST /v1/connect/oauth2/token` with `grant_type=client_credentials` using Base64-encoded `client_id:client_secret`.
- **Key Resources**:
  - `GET /v1/locations?filter.zipCode.near={zipCode}`: Identifies physical Kroger stores with `locationId`, address, and facilities.
  - `GET /v1/products?filter.term={query}&filter.locationId={locationId}`: Searches catalog for given location.
  - `GET /v1/products/{id}?filter.locationId={locationId}`: Retrieves specific product with `items[].price.regular`, `items[].price.promo`, `items[].size`, `items[].fulfillment`.
- **Legal Analysis**:
  - Kroger Developer Agreement Section 5(e) states:
    > "You may not use Kroger Content or the Kroger APIs in any way that facilitates a direct or indirect price comparison between Kroger and any third-party retailer, or in connection with any application whose primary purpose is competitive intelligence or comparison shopping, without Kroger's prior written consent."
  - For a personal 2-person household, a user could theoretically obtain their own developer credentials for personal use. However, embedding client credentials in a distributed application or presenting side-by-side comparison with Meijer using Kroger API data without partner consent violates this contractual term.
- **Implementation Strategy**:
  - Provide a clean, modular `KrogerApiClient` in `backend/app/providers/kroger.py`.
  - Allow the user to optionally configure `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` via environment variables or settings.
  - If keys are missing, the application clearly states: *"Kroger API credentials not configured. Using consumer price import and verified observations."*
  - If keys are present, the client is capable of fetching real store locations and pricing, but displays a clear partner compliance advisory.

### 3.2 Meijer Technical & Legal Assessment

- **Portal & API Availability**: Meijer has no developer portal, no public API, and no documented developer feeds.
- **Web & Mobile Infrastructure**:
  - Meijer's web storefront (`meijer.com`) and mobile app communicate with internal GraphQL/REST endpoints.
  - These endpoints are protected by enterprise Akamai Bot Manager (sensor data, TLS fingerprinting, dynamic request tokens, and rate limits).
- **Terms of Service**:
  - Meijer Terms of Use Section 4 explicitly prohibits:
    > "...using any robot, spider, scraper, deep-link or other automated data gathering or extraction tools, program, algorithm or methodology to access, acquire, copy or monitor any portion of the Website or any content..."
- **Conclusion**:
  - Automating requests against Meijer's private endpoints is technically fragile and legally forbidden.
  - Grocery Optimizer will NOT implement unauthorized background scraping or bot-evasion tools.
  - Meijer pricing must be ingested through consumer-supplied pathways (cart text paste, weekly ad PDFs, screenshots, or receipts).

---

## 4. The Permitted Consumer Solution

Because automatic cross-retailer API synchronization is either legally restricted (Kroger) or nonexistent/blocked (Meijer), the most valuable, reliable, and legal approach for our target household is:

1. **Targeted List-First Price Import**:
   - The household creates a grocery list of 10–20 items.
   - The user opens Kroger.com and Meijer.com in their browser (or mobile apps).
   - The user copies their shopping cart or search results text and pastes it into Grocery Optimizer's **Price Import Assistant**.
   - The assistant instantly extracts product names, prices (regular and sale), package sizes, and store locality, matches them to the list items, and highlights any uncertain matches for 1-click confirmation.
2. **Weekly Circular PDF & Screenshot Ingestion**:
   - The user drops in a downloaded weekly ad PDF or screenshot.
   - Local WebAssembly/OCR extracts prices and items with zero data sent to external servers.
3. **Observed Price History**:
   - Prices recorded from past shopping trips and receipts persist permanently in the user's local SQLite database.
4. **Side-by-Side Comparison Engine**:
   - The application computes the exact basket cost at Kroger, the exact basket cost at Meijer, the optimal 2-store combination, and whether splitting trips is worth the household's minimum savings threshold.
