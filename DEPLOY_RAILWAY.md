# Deploy to Railway (Phase 2 prod test)

This app is a single service: Next.js (UI + API) + Postgres. These steps stand up a
prod instance you can work from.

## 0. One-time local prep
Make sure only **one** Next config exists: `next.config.mjs` (delete any `next.config.js`).
Commit everything (Railway deploys from your Git repo, or via the CLI from the folder).

## 1. Create the Railway project + database
1. railway.app → New Project → **Deploy from GitHub repo** (pick this repo) — or use the
   CLI: `npm i -g @railway/cli`, `railway login`, `railway init`, `railway up`.
2. In the project, **+ New → Database → PostgreSQL**. Railway provisions it and exposes
   `DATABASE_URL` to the project.

## 2. Set environment variables (service → Variables)
```
DATABASE_URL=${{Postgres.DATABASE_URL}}      # reference the Postgres service
AUTH_SECRET=<long random string>             # e.g. `openssl rand -base64 32`
NODE_ENV=production
SEED_ADMIN_PASSWORD=<choose>
SEED_DEVREL_PASSWORD=<choose>

# Live Google Sheets ingestion (see GOOGLE_SHEETS_SETUP.md)
GOOGLE_SERVICE_ACCOUNT=<service-account JSON, one line>
GOOGLE_SHEET_ID=<spreadsheet id>
GOOGLE_SHEET_RANGE=Form Responses 1
```
Notes:
- `DATABASE_URL`: type `${{` in the field and Railway autocompletes the Postgres reference.
- Leave the Google vars unset if you only want to seed the bundled 81 rows for now; the
  Import button falls back to the seed file when they're absent.

## 3. Deploy
Railway builds with Nixpacks: `npm install` (runs `prisma generate`) → `npm run build`
(`prisma generate && next build`). On boot, the start command runs
`prisma db push` (creates/syncs all tables, non-destructive) then `next start`.

First deploy creates the schema automatically. Watch the deploy logs for "Listening".

## 4. Load data (pick one)
Open a shell against the deployed env with the Railway CLI:

**Option A — seed the 81 baseline rows:**
```
railway run npm run db:seed
```
**Option B — go straight to live Google data** (after step 2 Google vars are set):
sign in, then click **Import** (top bar, admin). Seeding first is fine too — the dedup
key matches, so a later live Import updates the seeded rows instead of duplicating.

## 5. Sign in
Visit the service's public URL (`*.up.railway.app`). Log in with `admin@bankr.bot` and the
`SEED_ADMIN_PASSWORD` you set. Change it from the Users tab once that lands (Phase 2C).

---

## Operational notes
- **Schema changes going forward:** edit `prisma/schema.prisma`, redeploy — the boot-time
  `prisma db push` applies additive changes automatically. (It will refuse a destructive
  change rather than drop data; if you intend one, run `railway run npx prisma db push`
  interactively to confirm.)
- **Re-running imports** preserves `stage`, `owner`, and outreach activity; it refreshes
  intake fields + scores. Onchain (token/fees) data is preserved even when the form lacks it.
- **Scoring weights** (Settings → Scoring, admin) persist in the DB and re-score all rows on
  Save — this works in prod the same as locally.
- **Scaling past one instance:** the boot-time `db push` is fine for a single test instance.
  Before running multiple replicas, switch to committed migrations (`prisma migrate deploy`)
  so only one process mutates the schema. Not needed for this test.
- **Secrets:** `GOOGLE_SERVICE_ACCOUNT` is a credential — keep it only in Railway Variables,
  never in the repo.
