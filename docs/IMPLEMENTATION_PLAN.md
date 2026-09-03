# Fitbit AI Dashboard — Implementation Plan

Self-hosted, LLM-powered dashboard for a Fitbit device (Fitbit Web API — Google OAuth), deployed as a single Docker container on Unraid.

## Architecture

Single Docker container: **Express (TypeScript) API** serving a built **React (Vite)** frontend as static files, **SQLite** storage on a Docker volume. Single-user app, intended for reverse-proxied HTTPS access.

```
fitbit-ai-dashboard/
├── server/          # Express API, Fitbit sync, OpenRouter proxy
│   ├── src/
│   │   ├── index.ts            # Express app, static serving
│   │   ├── config.ts          # env var parsing
│   │   ├── db.ts              # better-sqlite3 setup + migrations
│   │   ├── auth/              # Fitbit OAuth (PKCE) + token refresh
│   │   ├── fitbit/            # API client + sync jobs
│   │   ├── ai/               # OpenRouter client, prompt builder, SSE chat
│   │   └── routes/           # /api/* REST routes
├── web/             # React + Vite + Tailwind + Recharts
└── docker/          # Dockerfile, docker-compose.yml, unraid template
```

## Environment Variables (Docker)

| Var | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | LLM access via OpenRouter |
| `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` | From dev.fitbit.com app registration |
| `APP_SECRET` | Encrypts stored Fitbit tokens at rest (AES-256-GCM) |
| `PORT` (default 3000) | Container port |
| `PUBLIC_BASE_URL` | Reverse-proxy URL, used for OAuth redirect |

## Backend

### Fitbit auth (Google OAuth 2.0 + PKCE)

The modern Fitbit Web API requires PKCE for personal clients.

- Routes: `/api/auth/start` → `/api/auth/callback`
- Tokens encrypted (AES-256-GCM via `APP_SECRET`) into SQLite
- Background refresh before token expiry

### Sync jobs (node-cron, backfill on first connect)

- **Daily summary**: resting HR, steps, calories, active minutes, floors
- **Sleep logs**: duration, efficiency, stages
- **Activities**: workouts list
- Manual "Sync now" button + scheduled nightly + 6-hour refresh
- Respect rate limits (150 req/hr/user), exponential backoff on 429, store last-sync cursor
- *Intraday HR requires extra Fitbit approval — skipped initially, summary HR only*

### AI via OpenRouter (`server/src/ai/`)

- `GET /api/ai/models` — proxies OpenRouter `/v1/models`, filtered to chat models, cached 24h. Selected model saved in `settings` table; API key stays server-side.
- `POST /api/ai/chat` — builds context (last 14 days of metrics as compact JSON summary + system prompt), **streams** OpenRouter response over SSE. Chat history persisted.
- `POST /api/ai/report` — daily/weekly structured analysis (trends, anomalies, 3–5 coaching recommendations), saved to `ai_reports`.

## Frontend

- **Dashboard**: Recharts — HR trend, steps bars, sleep duration/efficiency, range selector (7/30/90d)
- **AI Chat**: streaming chat panel, model dropdown (from `/api/ai/models`), report generation button
- **Settings**: Fitbit connection status + re-auth, model picker, sync controls, report history
- TanStack Query + Tailwind, no heavyweight UI library

## Docker / Unraid

- Multi-stage Dockerfile: `node:22-alpine` — build web → build server → final image runs `node dist/index.js`, serves `/app/web/dist` statically
- `docker-compose.yml`: volume `./data:/app/data` (SQLite + tokens), all env vars above
- README with Unraid steps: Community Applications "user template" or add container manually, map appdata path, set env vars, reverse-proxy to HTTPS subdomain, register that URL as redirect URI in Fitbit app settings

## Data Model (SQLite)

| Table | Contents |
|---|---|
| `tokens` | Encrypted Fitbit access/refresh tokens |
| `daily_metrics` | Per-day: resting_hr, steps, calories, active_minutes, floors, sleep_minutes, sleep_efficiency |
| `sleep_logs` | Per-night detail incl. stages |
| `activities` | Workouts |
| `settings` | Selected AI model, last-sync cursor, timezone |
| `chat_history` | Persisted chat messages |
| `ai_reports` | Generated daily/weekly reports |

## Prerequisites

1. Register an app at dev.fitbit.com (sign in with Google) — personal client, scopes: `profile activity heartrate sleep`, redirect URI = your proxy URL
2. OpenRouter API key
3. Reverse proxy entry on Unraid

## Build Order (Milestones)

1. **Scaffold**: monorepo, config, db, Dockerfile skeleton
2. **Fitbit**: OAuth flow, token refresh, sync jobs, SQLite storage
3. **Dashboard**: REST routes + React pages/charts
4. **AI**: OpenRouter chat (SSE), model picker, daily report
5. **Deploy**: compose file, Unraid README, end-to-end test

## Risks / Notes

- Fitbit API now under Google OAuth; if Google Fit/Health Connect is used instead, the client changes but the structure holds
- Rate limits are the main constraint; syncing to SQLite means old data is rarely re-fetched
- No auth on the dashboard itself (behind your proxy) — optional `APP_PASSWORD` can be added later
