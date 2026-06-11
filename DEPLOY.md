# Railway Deployment Guide

This app deploys on [Railway](https://railway.app) with their managed
Postgres add-on. One-time setup, then self-maintaining.

## Architecture

```
┌─────────────────────────────────────────┐
│         Railway project                 │
│  ┌────────────────────────────────────┐ │
│  │ Service: hayloft (Node)     │ │
│  │ - tsx src/web/server.ts            │ │
│  │ - Hono server on $PORT             │ │
│  │ - reads DATABASE_URL from env      │ │
│  └────────────────┬───────────────────┘ │
│                   │                     │
│                   ▼                     │
│  ┌────────────────────────────────────┐ │
│  │ Service: Postgres (managed)        │ │
│  │ - Railway provides DATABASE_URL    │ │
│  │ - Backed up automatically          │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

The Postgres add-on is what makes this durable. Railway snapshots it, the
app container can be restarted/redeployed without touching data, and you get
a real DB with a real connection string.

## One-time setup

### 1. Create the Postgres database

In Railway:

1. Open your project → **+ New → Database → Add Postgres**
2. Railway provisions it in ~30 seconds. You'll see a new service in the canvas.
3. That's it — no settings to configure.

### 2. Create / link the web service

1. **+ New → Deploy from GitHub repo** → pick `WebDevStudios/hayloft`
2. Railway detects the `Dockerfile` and starts the first build
3. The first deploy will crash without env vars — that's expected, we'll fix it next

### 3. Wire the database into the web service

In the web service:

1. Click **Variables**
2. Click **+ New Variable → Add Reference**
3. Select your Postgres service → choose `DATABASE_URL`
4. Railway now passes the internal Postgres URL to your app as `DATABASE_URL` on every deploy

### 4. Set the rest of the environment variables

Still in **Variables**, add:

| Variable | Value | Notes |
|---|---|---|
| `HARVEST_ACCOUNT_ID` | (from id.getharvest.com) | |
| `HARVEST_ACCESS_TOKEN` | (your PAT) | |
| `HARVEST_USER_AGENT` | `Hayloft (you@example.com)` | |
| `APP_PASSWORD_HASH` | `$2a$12$...` | Run `npm run hash-password` locally |
| `SESSION_SECRET` | 32+ random chars | `openssl rand -hex 32` |
| `NODE_ENV` | `production` | |

`DATABASE_URL` is already there from step 3. `PORT` is auto-set by Railway.

### 5. Deploy and generate a domain

1. Click **Deploy** → wait for green checkmark
2. **Settings → Networking → Generate Domain** → you'll get a `*.up.railway.app` URL
3. Visit the URL → you should land on the login page

## Loading data

Your app boots with an empty schema (migrations run on every startup). To
populate it, run the fetcher against your Railway Postgres.

### Option A — Fetch from your laptop (recommended)

The app talks to Postgres over the network, so you can run the fetch from
anywhere that has the `DATABASE_URL` and Harvest creds. This is much more
reliable than fighting Railway's container shell.

1. In Railway dashboard, find your Postgres service → **Connect** → copy the
   **Public URL** (`postgresql://...:...@viaduct.proxy.rlwy.net:.../railway` or similar)
2. On your Mac, create a `.env.railway` file:
   ```
   HARVEST_ACCOUNT_ID=...
   HARVEST_ACCESS_TOKEN=...
   HARVEST_USER_AGENT="Hayloft (you@example.com)"
   DATABASE_URL=postgresql://...railway-public-url...
   ```
3. Run:
   ```bash
   set -a; source .env.railway; set +a
   npm run fetch
   ```

This streams data straight from Harvest into Railway's Postgres. No SSH, no
upload, no surprises. Takes 15–30 min for a decade of history.

### Option B — Run fetch on Railway

If you'd rather have it run on Railway (e.g., as a scheduled cron later):

1. Open Railway shell on the web service: `railway link` then `railway ssh`
2. Run `npm run fetch`

This works but is less convenient for ad-hoc runs.

## Re-syncing before cutover

Just re-run `npm run fetch` from your laptop (Option A above). It's
idempotent. The UPSERT-by-id pattern means re-running is safe; you'll pick
up any time entries / invoices added since the last pull.

For **delta-only** (faster):

```bash
npm run fetch -- --mode sync
```

This uses `updated_since` from each resource's `sync_state` row, so it only
asks Harvest for records changed since the last successful sync.

## Downloading the archive for permanent offline storage

The Postgres data is the archive. `pg_dump` produces a single `.sql` file
that's portable forever — restore it anywhere with `psql`.

```bash
# Using the Railway public URL from earlier:
pg_dump "$DATABASE_URL" --no-owner --no-acl > hayloft-2026-06-01.sql
gzip hayloft-2026-06-01.sql
ls -lh hayloft-2026-06-01.sql.gz
```

To restore on another machine:

```bash
gunzip hayloft-2026-06-01.sql.gz
psql -d new_database -f hayloft-2026-06-01.sql
```

## Health checks & logs

- Health endpoint: `/health` → returns `ok`. Railway pings every 30s.
- Logs: Railway dashboard → **Deployments → View Logs**.
- Postgres logs: Postgres service → **Logs** tab.

## Costs

Two services on Railway's Hobby plan:
- Web service: ~256 MB RAM, low CPU
- Postgres: starts at 256 MB RAM, scales with data
- Total: typically ~$5–10/mo for this dataset size

## Troubleshooting

**Container crashes on boot with `DATABASE_URL required`**
The variable reference (Step 3) didn't get saved, or you're missing
`HARVEST_*` vars. Check Variables tab.

**Container boots but `/health` fails / pages 500**
Most likely Postgres isn't reachable. Check Postgres service is **Active**
in the canvas, then redeploy the web service so it picks up the URL.

**Fetch from laptop fails with SSL / connection errors**
Make sure you're using Railway's **Public URL** (not the internal
`postgres.railway.internal` one). The public URL is exposed for external
connections.

**Fetch hits rate limits**
The client paces at ~90 req / 15s with auto-backoff. If you're seeing 429s,
Harvest is throttling — wait and re-run.
