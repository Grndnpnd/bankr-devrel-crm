# Bankr DevRel CRM

Internal developer-relations intake CRM for Bankr. A single Next.js service:
App Router UI + API routes + Postgres (Prisma) + cookie/JWT auth.

The UI is the warm-amber dark dashboard (Dashboard / Submissions / Profile /
Analytics / Settings) wired to live data from the same database that the scoring
engine and import adapters write to. One repo, one deploy.

## Stack
- Next.js 14 (App Router, React 18, TypeScript)
- Postgres + Prisma
- Auth: bcrypt + JWT in an httpOnly cookie (jose), role-based (ADMIN / DEVREL / VIEWER)
- UI: Tailwind + shadcn/ui (Radix), recharts, framer-motion, lucide, zustand

## Local development
Prereqs: Node 18+ and Docker (for local Postgres).

```bash
npm install                 # also runs `prisma generate` (needs network to binaries.prisma.sh)
docker compose up -d db     # Postgres on localhost:5433
cp .env.example .env        # then set AUTH_SECRET to a long random string
npm run db:push             # create tables from prisma/schema.prisma
npm run db:seed             # seed users + import the 81 cleaned submissions
npm run dev                 # http://localhost:3000
```

Sign in with the seeded admin: `admin@bankr.bot` / `changeme-admin`
(seed also creates `devrel@bankr.bot` / `changeme-devrel`). Change these.

### Note on `prisma generate`
This client must be generated against `binaries.prisma.sh`. If you ever build in
a sandboxed/offline environment where that host is blocked, generation fails and
`@prisma/client` won't export `PrismaClient`/`Prisma` (two TypeScript errors in
`src/lib/prisma.ts` and `src/lib/serialize.ts`). On a normal machine with network
this resolves automatically during `npm install`. Everything else type-checks.

## Data flow
- Browser → Zustand store (`src/store/useSubmissionStore.ts`) → `/api/*` → Prisma → Postgres.
- The API speaks the UI's contract via `src/lib/serialize.ts`: lowercase `source`
  (`google_form`/`plain`), display-label `stage` (`New`, `In Convo`, …), `owner`
  as a free-text name, and outreach activities as `{id,type,author,timestamp,content}`.
  Enum↔label maps live in `src/lib/labels.ts`.
- Aggregates for Dashboard/Analytics are computed from live rows by
  `computeStats()` / `computeAnalytics()` in `src/data/*`.

## Scoring
`src/lib/scoring.ts` — transparent weighted model (max 100): fees 40 (log-scaled),
launched 15, traction 15, founder 15, completeness 15. Weights are in one `WEIGHTS`
object. Verified to reproduce all 81 Phase-0 scores exactly (81/81 parity).

## Import sources
- Google Form export (active): `src/lib/adapters` + `npm run db:seed` / `POST /api/import`.
- Plain (framework stubbed): activate when multi-form support ships.
Re-importing preserves each submission's `stage` and `owner`.

## Roles
- ADMIN: manage users, trigger imports, configure sources/scoring, full edit.
- DEVREL: view/filter/score, claim ownership, change stage, log outreach.
- VIEWER: read-only.

## Deploy (later phase)
Single Railway service (web) + managed Postgres. Set `DATABASE_URL` and
`AUTH_SECRET`; `npm run build` runs `prisma generate` then `next build`.
