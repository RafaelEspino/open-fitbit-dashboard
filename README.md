# Fitbit AI Dashboard

Self-hosted, LLM-powered dashboard for a Fitbit wearable. Pulls your health history
from the **Google Health API** (the successor to the Fitbit Web API, deprecated
September 2026), stores it locally in SQLite, and adds AI chat and report
generation via **OpenRouter**. Single-user app, deployed as one Docker container
on Unraid behind a reverse proxy.

## Tech Stack

**Server** (Node 22, TypeScript, ESM)

| Concern | Choice |
|---|---|
| HTTP framework | Express 4 |
| Database | SQLite via `better-sqlite3` (WAL, per-migration versioning) |
| Scheduler | node-cron (nightly + 6h sync) |
| Health data | Google Health API v4 (`health.googleapis.com/v4`), REST + OAuth 2.0 |
| Token security | AES-256-GCM encryption at rest, scrypt-derived key from `APP_SECRET` |
| AI | OpenRouter API (streaming SSE chat + completions) |

**Web** (React 19)

| Concern | Choice |
|---|---|
| Build | Vite 6 |
| Styling | Tailwind CSS v4 |
| Data fetching | TanStack Query v5 |
| Charts | Recharts 3 |

## Project Organization

```
├── docs/IMPLEMENTATION_PLAN.md   # design decisions, milestone order, API research
├── docker/                       # multi-stage Dockerfile, docker-compose.yml
├── server/src/
│   ├── index.ts                  # app wiring, static serving, session restore
│   ├── config.ts                 # env var parsing (loads root .env)
│   ├── db.ts                     # better-sqlite3 + ordered migrations + settings KV
│   ├── auth/
│   │   ├── oauth.ts               # Google OAuth endpoints, scopes, token exchange
│   │   ├── store.ts               # encrypted token persistence, on-demand refresh
│   │   └── crypto.ts              # AES-256-GCM encrypt/decrypt
│   ├── health/
│   │   ├── client.ts              # API client: 401 auto-refresh, 429/504 backoff
│   │   ├── sync.ts                # SyncService: rollups, HR, sleep, workouts
│   │   ├── backfill.ts            # hot load + full-history cold backfill queue
│   │   └── scheduler.ts           # cron jobs
│   ├── ai/
│   │   ├── openrouter.ts          # model list, streaming chat, completions
│   │   └── context.ts             # metric context builder + prompts
│   ├── routes/                    # auth, sync, metrics, ai routers (dependency-injected)
│   └── util/dates.ts              # civil/UTC time helpers, timezone conversions
└── web/src/
    ├── api.ts / aiApi.ts         # typed API clients
    ├── pages/                    # DashboardPage, AiPage, SettingsPage
    └── components/                # Charts, ChatPanel, ui primitives
```

## Getting Started (Local Development)

### Prerequisites

- Node.js 22 (any version manager; nvm works)
- A Google Cloud project with the Google Health API enabled (see below)
- An OpenRouter API key

### Google Cloud setup (one-time)

1. Create/select a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the **Google Health API** on the API Enablement page
3. **Credentials → Create OAuth client → Web application**:
   - Authorized redirect URI: `http://localhost:8000/api/auth/callback` for dev,
     your proxy URL for production
   - Leave Authorized JavaScript origins empty (server-side flow only)
4. **Audience page**: add your Google account as a **Test user** (unverified health
   apps only authorize listed test users) and keep publishing status as
   **Testing**. Note: test-mode refresh tokens expire after 7 days, so you
   re-consent weekly during development
5. **Data Access page**: add the four `googlehealth.*.readonly` scopes
   (`activity_and_fitness`, `health_metrics_and_measurements`, `sleep`,
   `settings` — the last one is needed for the device battery/last-sync panel)

### Configure and run

```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENROUTER_API_KEY
# APP_SECRET is required (32+ random bytes, e.g. `openssl rand -hex 32`)

npm install             # root scripts only
npm --prefix server install
npm --prefix web install
```

Run each in its own terminal (both are long-running):

```bash
npm run dev:server      # Express + tsx watch on :8000
npm run dev:web         # Vite dev server on :5173 (proxies /api to :8000)
```

Then open http://localhost:5173, go to **Settings → Connect Google account**,
complete the Google consent, and the initial 14-day hot sync + full-history
backfill start automatically.

### Useful commands

| Command | Purpose |
|---|---|
| `npm run typecheck` | TypeScript check for server + web |
| `npm run build` | Build both (server → dist, web → dist) |
| `npm run start` | Run built server (serves built frontend if present) |

## Configuration (`.env`)

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth web-server client from Google Cloud |
| `OPENROUTER_API_KEY` | OpenRouter API key (server-side only, never sent to the browser) |
| `APP_SECRET` | Encrypts stored Google tokens at rest (AES-256-GCM) |
| `PORT` | Server port (default 3000; dev uses 8000 to match the registered redirect URI) |
| `PUBLIC_BASE_URL` | External base URL; used to build the OAuth redirect URI |
| `DATA_DIR` | SQLite data directory (default `<cwd>/data`, `/app/data` in Docker) |

## Behavior Notes

### Sync pipeline

- **On connect**: hot load of the last 14 days, then a background queue walks
  backwards through *all* history in 14-day chunks (a persisted cursor survives
  restarts) and stops after ~3 months of data-free chunks
- **Ongoing**: nightly sync (3-day window) + every 6h (2-day window), both
  idempotent upserts; "Sync now" button does a 3-day window on demand
- **Rate limits**: Google allows 300 req/min/user; the client backs off
  exponentially on 429/504 and auto-refreshes access tokens on 401
- **Rollup range caps**: the API limits `heart-rate`, `active-minutes` and
  `total-calories` rollup queries to 14 days (90 days for others) — all chunked
- **Time zones**: daily aggregates use civil time via `dailyRollUp`; the
  user's timezone is auto-detected and stored in `settings` on first sync

### Quirks discovered against the live API

- The `reconcile` endpoint returns data point IDs as `dataPointName`; `list`
  uses `name` — the parser accepts both
- Intraday heart-rate history is only available for a limited window
  (several weeks); older chunks return empty rollups and can 400 — do not
  treat that as fatal
- Some devices (e.g. Fitbit Air) do not record floors; the column stays null
- Data availability is driven by the Fitbit phone app syncing the device to
  Google's cloud (every ~15 min while the app is open with Bluetooth)

### Security model

- Google tokens are encrypted at rest with `APP_SECRET`; losing `APP_SECRET`
  invalidates the stored session (re-auth required)
- The dashboard itself has no auth — it's intended for reverse-proxied,
  single-user deployment (optional `APP_PASSWORD` is a future item)

## API Overview

| Route | Purpose |
|---|---|
| `GET /api/auth/start` → `/api/auth/callback` | Google OAuth flow |
| `GET /api/auth/status`, `POST /api/auth/disconnect` | Connection state |
| `POST /api/sync/now`, `GET /api/sync/status`, `GET /api/sync/devices` | Sync + device battery/last-sync |
| `GET /api/metrics/daily\|sleep\|activities\|hr/*` | Dashboard data |
| `GET /api/ai/models\|settings\|history\|reports`, `POST /api/ai/settings\|chat\|report` | AI features |

## Data Model (SQLite)

`tokens` (encrypted session + health user id) · `daily_metrics` · `hr_hourly` ·
`sleep_logs` (incl. stages) · `activities` · `chat_history` · `ai_reports` ·
`settings` (KV: timezone, selected model, backfill cursor, sync timestamps)

Migrations are defined as an ordered array in `server/src/db.ts` and applied
transactionally on boot.

## Deployment

Docker assets live in `docker/` (multi-stage build, compose with an appdata
volume for SQLite). Full Unraid deployment docs are planned as part of
milestone 5 — see `docs/IMPLEMENTATION_PLAN.md` for the current design.
