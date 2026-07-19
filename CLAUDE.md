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
   - `groupRows` — splits rows into `paid`/`trial`/`free`; `paid` additionally excludes `INTERNAL_TEST_PAID_CUSTOMERS` (a hardcoded allowlist of internal/test sites, matched by normalized site name or base URL) so internal test sites never show up as real paid customers.
   - `buildSiteRow` composes one site + its opportunities + its org's entitlements into a `SiteOpportunityRow`. `toCsv` serializes the dataset for export.

3. **`src/App.tsx`** — orchestration and UI shell. Loads all sites, filters to LLMO sites, then fetches opportunities/entitlements per site via `mapWithConcurrency` (`src/utils/concurrency.ts`, concurrency limit 8) with live progress text. Entitlements are cached per `organizationId` within a single load. Base URL and token are persisted to `sessionStorage` only (`offsite-viewer.baseUrl`, `offsite-viewer.token`) — never persisted longer-term, never logged. Only `paid` + `trial` rows are rendered/exported; `free` rows are computed but intentionally hidden.

When adding a new offsite source (beyond reddit/youtube/cited/wikipedia), extend `OPPORTUNITY_SOURCES` in `src/types.ts` — `CustomerTable`, the overview metrics, and CSV export all derive their columns from that map, so no other file needs a source list.

When changing which sites count as "internal test" paid customers, edit `INTERNAL_TEST_PAID_CUSTOMERS` in `src/utils/dashboard.ts`.
