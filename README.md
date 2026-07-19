# Offsite Opportunities Viewer

Viewer for LLMO offsite opportunity coverage across Reddit, YouTube, Cited, and Wikipedia.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and set `VITE_IMS_CLIENT_ID` to a public IMS SPA client ID registered in Adobe Developer Console, with this app's origin(s) (`http://localhost:5173` for dev, plus any deployed URL) as allowed redirect URIs. No client secret is needed or used — this is a browser-only app.

The app defaults to the production LLMO API base URL:

```text
https://llmo.experiencecloud.live/api/v1
```

## Sign-in

Click "Sign in with Adobe" (or the app silently detects an existing Adobe SSO session). The resulting IMS access token is exchanged for a Spacecat session token via `POST {baseUrl}/auth/login`, then used as:

```text
Authorization: Bearer <sessionToken>
```

Data access is governed by your own Adobe account's Spacecat/LLMO entitlements (e.g. `is_admin` / `is_llmo_administrator`) — same as the previous manual-token flow, just without copy-pasting the token yourself. Nothing is persisted beyond the current browser session/tab.

## Data flow

The viewer:

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
