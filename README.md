# Offsite Opportunities Viewer

Viewer for LLMO offsite opportunity coverage across Reddit, YouTube, Cited, and Wikipedia.

## Run locally

```bash
npm install
npm run dev
```

The app defaults to the production LLMO API base URL:

```text
https://llmo.experiencecloud.live/api/v1
```

Paste an IMS bearer token or Spacecat session token into the viewer before loading data. The token is stored in `sessionStorage` only and sent as:

```text
Authorization: Bearer <token>
```

## Data flow

The viewer:

- pages through `GET /sites?limit=500` until all sites are loaded
- keeps LLMO sites where `site.config.llmo` exists
- loads `GET /sites/{siteId}/opportunities` for eligible Paid sites initially;
  Trial loads on demand
- filters opportunity types:
  - `reddit-analysis`
  - `youtube-analysis`
  - `cited-analysis`
  - `wikipedia-analysis`
- treats `NEW` opportunities as visible/green
- shows `IGNORED` opportunities as ignored/yellow when no visible opportunity exists
- shows missing opportunity types as red
- groups visible tables by LLMO entitlement tier:
  - `PAID` -> Paid customers
  - `FREE_TRIAL` / `TRIAL` -> Trial customers

## Local customer selection

Copy `customer-selection.example.json` to `private/customer-selection.local.json`.
Populate its four arrays with the approved Paid site IDs, test customers, probe
sites and excluded organizations. The `private/` directory is ignored by Git.

Paid requires snapshot membership, `config.llmo` and a current LLMO PAID entitlement.
Test exclusions apply to both Paid and Trial, matching exact names or hostnames
across schemes and paths. Excluded Paid sites are skipped before opportunity loading.
Without a local file, Paid is empty; invalid files fail the build. Rebuild after edits.

Local lists are included in browser bundles. Use private hosting for private lists;
never include them in public deployments or store credentials in this file.

## Build and test

```bash
npm run lint
npm run test
npm run build
```
