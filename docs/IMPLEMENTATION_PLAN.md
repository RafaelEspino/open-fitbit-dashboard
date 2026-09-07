# Fitbit AI Dashboard — Implementation Plan

Self-hosted, LLM-powered dashboard for a Fitbit device (Google Health API — `health.googleapis.com/v4`), deployed as a single Docker container on Unraid.

> **Note:** The legacy Fitbit Web API is deprecated (September 2026). This project targets its replacement, the **Google Health API**. Fitbit devices sync to the phone app; data is then available at the Google-account level via the new API. No migration layer is needed since this is a greenfield build.

## Architecture

Single Docker container: **Express (TypeScript) API** serving a built **React (Vite)** frontend as static files, **SQLite** storage on a Docker volume. Single-user app, intended for reverse-proxied HTTPS access.

```
fitbit-ai-dashboard/
├── server/          # Express API, Google Health sync, OpenRouter proxy
│   ├── src/
│   │   ├── index.ts            # Express app, static serving
│   │   ├── config.ts          # env var parsing
│   │   ├── db.ts              # better-sqlite3 setup + migrations
│   │   ├── auth/              # Google OAuth (web-server flow) + token refresh
│   │   ├── health/            # Google Health API client + sync jobs
│   │   ├── ai/               # OpenRouter client, prompt builder, SSE chat
│   │   └── routes/           # /api/* REST routes
├── web/             # React + Vite + Tailwind + Recharts
└── docker/          # Dockerfile, docker-compose.yml, unraid template
```

## Environment Variables (Docker)

| Var | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | LLM access via OpenRouter |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Google Cloud Console (OAuth Web Server client) |
| `APP_SECRET` | Encrypts stored Google tokens at rest (AES-256-GCM) |
| `PORT` (default 3000) | Container port |
| `PUBLIC_BASE_URL` | Reverse-proxy URL, used for OAuth redirect |

## Backend

### Google OAuth 2.0 (web-server flow)

Standard Google web-server authorization-code flow against the Google Health API scopes.

- Routes: `/api/auth/start` → `/api/auth/callback`
- Auth URL includes `access_type=offline` (refresh token); `prompt=consent` only when re-consenting for scope changes
- Tokens encrypted (AES-256-GCM via `APP_SECRET`) into SQLite
- Access tokens refreshed **on demand** at `oauth2.googleapis.com/token` as part of the natural sync flow (Google recommends against batch/cron token refresh)
- After consent: call `GET /v4/users/me/identity`, store `healthUserId` alongside the tokens
- Scopes (read-only only): `googlehealth.activity_and_fitness.readonly` (steps, distance, active minutes, floors, calories, exercise), `googlehealth.health_metrics_and_measurements.readonly` (heart rate, resting HR, HRV, SpO2), `googlehealth.sleep.readonly`, `googlehealth.settings.readonly` (pairedDevices — battery, last sync)

### Sync jobs (node-cron + backfill queue)

All requests go to `https://health.googleapis.com/v4/users/me/...` with `Authorization: Bearer <token>`.

- **Daily metrics** via `dataPoints:dailyRollUp`: steps, total-calories, active-minutes, floors
- **Resting HR**: `daily-resting-heart-rate` dataPoints list
- **Intraday HR (hourly)**: `heart-rate` `rollUp` with `windowSize: 3600s`; queries chunked to max 14-day ranges per API limits
- **Sleep**: `sleep/dataPoints:reconcile` with `dataSourceFamily=users/me/dataSourceFamilies/google-wearables` (avoids double-counting phone/manual data) — stages + summary; paginated, 25 sessions/page
- **Workouts**: `exercise/dataPoints` list; paginated, 25/page
- Manual "Sync now" button + scheduled nightly + 6-hour refresh
- **Backfill (full history)**: first connect does a hot load (last 14 days) so the dashboard is usable immediately; a background cold-load queue then paginates all remaining history (sleep/exercise 25/page; rollup queries chunked to 14d for heart-rate/active-minutes/total-calories, 90d for others), persisting a progress cursor in `settings`
- Rate limits: 300 req/min/user — exponential backoff on 429 and 504, never retry large failed payloads immediately
- Device status via `GET /v4/users/me/pairedDevices` (battery, last sync time)

### AI via OpenRouter (`server/src/ai/`)

- `GET /api/ai/models` — proxies OpenRouter `/v1/models`, filtered to chat models, cached 24h. Selected model saved in `settings` table; API key stays server-side.
- `POST /api/ai/chat` — builds context (last 14 days of metrics as compact JSON summary + system prompt), **streams** OpenRouter response over SSE. Chat history persisted.
- `POST /api/ai/report` — daily/weekly structured analysis (trends, anomalies, 3–5 coaching recommendations), saved to `ai_reports`.

## Frontend

- **Dashboard**: Recharts — HR trend (daily + hourly intraday detail), steps bars, sleep duration/efficiency, range selector (7/30/90d)
- **AI Chat**: streaming chat panel, model dropdown (from `/api/ai/models`), report generation button
- **Settings**: Google Health connection status + re-auth, device battery & last sync time, model picker, sync controls, backfill progress, report history
- TanStack Query + Tailwind, no heavyweight UI library

## Docker / Unraid

- Multi-stage Dockerfile: `node:22-alpine` — build web → build server → final image runs `node dist/index.js`, serves `/app/web/dist` statically
- `docker-compose.yml`: volume `./data:/app/data` (SQLite + tokens), all env vars above
- README with Unraid steps: Community Applications "user template" or add container manually, map appdata path, set env vars, reverse-proxy to HTTPS subdomain, register that URL as an authorized redirect URI on the OAuth client in Google Cloud Console

## Data Model (SQLite)

| Table | Contents |
|---|---|
| `tokens` | Encrypted Google access/refresh tokens + `health_user_id` |
| `daily_metrics` | Per-day: resting_hr, steps, calories, active_minutes, floors, sleep_minutes, sleep_efficiency |
| `hr_hourly` | Per date + hour: min/avg/max heart rate |
| `sleep_logs` | Per-night detail incl. stages |
| `activities` | Workouts |
| `settings` | Selected AI model, backfill cursor, timezone |
| `chat_history` | Persisted chat messages |
| `ai_reports` | Generated daily/weekly reports |

## Prerequisites

1. Google Cloud setup:
   - Create a project and enable the **Google Health API** (`health.googleapis.com`)
   - Create an OAuth 2.0 **Web Server** client; redirect URI = your proxy URL
   - Add the three `googlehealth.*.readonly` scopes on the project's **Data Access** page
   - Add your Google account as a test user on the **Audience** page
   - **Publish the app to production** — in Testing mode refresh tokens expire after 7 days; the unverified-app 100-user cap is fine for single-user use
2. OpenRouter API key
3. Reverse proxy entry on Unraid

## Build Order (Milestones)

1. **Scaffold**: monorepo, config, db, Dockerfile skeleton
2. **Google Health**: OAuth flow, token refresh, sync jobs + full-history backfill, SQLite storage
3. **Dashboard**: REST routes + React pages/charts
4. **AI**: OpenRouter chat (SSE), model picker, daily report
5. **Deploy**: compose file, Unraid README, end-to-end test

## Risks / Notes

- Unverified app shows a Google warning screen during consent ("app not verified") — acceptable for a personal project; can proceed through "Advanced"
- Scope changes require user re-consent via `prompt=consent`
- Data freshness depends on the Fitbit app syncing the device to the cloud (auto-syncs every ~15 min with Bluetooth + app open); the API serves data only after sync
- Rate limits are generous (300 req/min/user); syncing to SQLite means old data is rarely re-fetched
- No auth on the dashboard itself (behind your proxy) — optional `APP_PASSWORD` can be added later
