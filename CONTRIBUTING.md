# Contributing to Hayloft

Thanks for helping! Hayloft is intentionally small: a fetcher, a Postgres
schema, and a server-rendered web UI. Please keep changes in that spirit.

## Local setup

```bash
docker compose up -d        # local Postgres 17
npm install
cp .env.example .env        # defaults work for local dev
npm run migrate
npm run seed-demo           # fake data — no Harvest account needed
npm run dev                 # http://localhost:3000
```

To exercise the fetcher you'll need a real Harvest account and a personal
access token from https://id.getharvest.com/developers. A free trial account
works fine.

## Before you open a PR

- `npm run typecheck` must pass.
- `npm run build:css` must succeed.
- Click through the pages you touched with the demo data loaded.
- Keep PRs focused — one change per PR.

## Conventions

- TypeScript strict mode; no `any` unless unavoidable.
- Server-side rendering only — no client-side framework. Small inline
  scripts are fine where genuinely needed.
- SQL lives in tagged template strings near its route; reuse the helpers in
  `src/lib/db.ts` (`q`, `qOne`, `qScalar`, `exec`).
- New Harvest resources go in `src/fetcher/resources.ts` and
  `src/db/schema.sql`, following the existing pattern (parsed columns +
  `raw_json` escape hatch).

## Reporting bugs

Use the issue templates. For fetcher bugs, include the resource name and the
relevant lines of CLI output (redact your account id).
