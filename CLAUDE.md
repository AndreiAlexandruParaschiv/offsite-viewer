# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page React viewer for LLMO offsite opportunity coverage (Reddit, YouTube, Cited, Wikipedia) across Spacecat sites. It talks directly to the production LLMO API from the browser using a user-pasted IMS/Spacecat bearer token — no backend of its own.

## Commands

```bash
npm run dev      # vite dev server on 0.0.0.0
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run test     # vitest run
```

Run a single test file: `npx vitest run src/utils/dashboard.test.ts`

## Architecture

Data flow, in order, is implemented across three layers:

1. **`src/api/spacecat.ts`** (`SpacecatClient`) — thin fetch wrapper around the LLMO API. `getAllSites()` pages through `GET /sites?limit=500` following `pagination.cursor`/`hasMore` (handles both a bare-array and a paginated-object response shape). `getSiteOpportunities(siteId)` and `getEntitlements(organizationId)` fetch per-site/per-org data. All requests send `Authorization: Bearer <token>`.

2. **`src/utils/dashboard.ts`** — pure transform functions, the core logic to understand before changing behavior:
   - `isLlmoSite` — keeps sites where `site.config.llmo` exists.
   - `indicatorFromOpportunities` — for a given opportunity type, a `NEW` status wins (→ `visible`), otherwise `IGNORED` (→ `ignored`), otherwise `missing`. `resolveOpportunityDate` picks the latest `updatedAt`/`createdAt` among matches.
   - `findLlmoEntitlement` / `customerGroupFromTier` — maps an org's entitlements to a customer group: `PAID` tier → `paid`, `FREE_TRIAL`/`TRIAL` → `trial`, else `free`.
   - `isPaidCustomerSite` requires `config.llmo`, local snapshot membership and a current LLMO PAID entitlement, excluding test sites before initial Paid loading and refresh. Unlisted PAID sites remain in Trial.
   - `groupRows` splits rows into `paid`/`trial`/`free`; Paid and Trial exclude configured test customers, probe hosts and organizations. Names match exactly; URL rules match exact hostnames across schemes and paths.
   - `buildSiteRow` composes one site + its opportunities + its org's entitlements into a `SiteOpportunityRow`. `toCsv` serializes the dataset for export.

3. **`src/App.tsx`** — orchestration and UI shell. Loads all sites, filters to LLMO sites, then fetches opportunities/entitlements per site via `mapWithConcurrency` (`src/utils/concurrency.ts`, concurrency limit 8) with live progress text. Entitlements are cached per `organizationId` within a single load. Base URL and token are persisted to `sessionStorage` only (`offsite-viewer.baseUrl`, `offsite-viewer.token`) — never persisted longer-term, never logged. Only `paid` + `trial` rows are rendered/exported; `free` rows are computed but intentionally hidden.

When adding a new offsite source (beyond reddit/youtube/cited/wikipedia), extend `OPPORTUNITY_SOURCES` in `src/types.ts` — `CustomerTable`, the overview metrics, and CSV export all derive their columns from that map, so no other file needs a source list.

Keep selection lists in ignored `private/customer-selection.local.json`, using
`customer-selection.example.json` as the template. Use synthetic data in tests.
Absent files mean empty lists; malformed files fail the build. Rebuild after edits.
Lists are bundled into the browser application, so private lists require private hosting.
