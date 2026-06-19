# Offsite Opportunities Dashboard

Dashboard for LLMO offsite opportunity coverage across Reddit, YouTube, Cited, and Wikipedia.

## Run locally

```bash
npm install
npm run dev
```

The app defaults to the production LLMO API base URL:

```text
https://llmo.experiencecloud.live/api/v1
```

Paste an IMS bearer token or Spacecat session token into the dashboard before loading data. The token is stored in `sessionStorage` only and sent as:

```text
Authorization: Bearer <token>
```

## Data flow

The dashboard:

- pages through `GET /sites?limit=500` until all sites are loaded
- keeps LLMO sites where `site.config.llmo` exists
- loads `GET /sites/{siteId}/opportunities` for every LLMO site
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

## Build and test

```bash
npm run lint
npm run test
npm run build
```
