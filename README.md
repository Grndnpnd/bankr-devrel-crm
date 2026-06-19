# Bankr DevRel CRM

A CRM for triaging, scoring, and managing crypto project submissions for the Bankr DevRel team. Projects arrive from Google Forms, the Plain support inbox, manual entry, or natural-language ingest (agent chat / Slack), get auto-scored, and move through an outreach pipeline. An embedded LLM agent can query the pipeline, create/edit cards, build dashboard panels, and schedule Slack reports — reachable from both the web app and a Slack bot.

---

## Architecture

Three services, one repo, one Postgres database:

| Service | Railway config | Start command | Restart policy | Purpose |
| --- | --- | --- | --- | --- |
| **web** | `railway.json` | `prisma db push … && npm run start` | ON_FAILURE | Next.js app (UI + API routes) |
| **cron** | `railway.cron.json` | `npm run cron:tick` | NEVER (re-invoked by Railway cron) | Scheduled jobs (onchain/sheet refresh, Slack reports) |
| **slack-bot** | `railway.slack.json` | `npm run slack:bot` | ALWAYS (persistent socket) | Inbound Slack bot (Socket Mode worker) |

- All three build from the same repo; set each service's **Config File Path** in the Railway dashboard.
- The web service owns the schema (`prisma db push` runs on its start). cron and slack-bot only read/write data, they do not push schema.
- The agent dispatch loop lives in `src/lib/agentRun.ts` — a shared "brain" called by **both** the web `/api/agent` route and the Slack bot, so they have identical capabilities.

---

## Tech stack

- **Next.js 14** (App Router) + React + Zustand (`src/store/useSubmissionStore.ts`)
- **Postgres** + **Prisma 5** (`prisma/schema.prisma`)
- **Auth:** JWT cookie sessions (`jose`) + Google OAuth sign-in
- **LLM:** OpenAI/Anthropic-compatible gateway, model selected by env (`BANKR_LLM_MODEL`) — never hard-coded, so models can be swapped without a deploy
- **Slack:** `@slack/socket-mode` + `@slack/web-api`
- **Integrations:** Google Sheets (`googleapis`), Plain (support inbox), Resend (email, dormant)

---

## Environment variables

Set as **Railway shared/project variables** so all three services see them.

**Core**
- `DATABASE_URL` — Postgres (use the internal reference `${{Postgres.DATABASE_URL}}`)
- `AUTH_SECRET` — JWT signing secret
- `APP_URL` — public app URL (OAuth redirects, links)
- `NODE_ENV`

**LLM gateway**
- `BANKR_LLM_BASE_URL` — gateway base URL
- `BANKR_LLM_KEY` — gateway API key
- `BANKR_LLM_MODEL` — model string (e.g. `gemini-3-flash`)

**Google OAuth + Sheets**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth sign-in
- `GOOGLE_HOSTED_DOMAIN` — restrict sign-in to a domain (optional)
- `GOOGLE_SERVICE_ACCOUNT`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_RANGE` — form-submission import (needed by **cron** for scheduled sheet refresh)

**Slack** (needed by **slack-bot**, and web for outbound/reports)
- `SLACK_APP_TOKEN` — app-level token, `xapp-…` (Socket Mode)
- `SLACK_BOT_TOKEN` — bot token, `xoxb-…` (posting + identity lookup)

**Other**
- `CRON_SECRET` — protects the manual cron-trigger route
- `PLAIN_API_KEY`, `PLAIN_ENABLED` — Plain support-inbox import
- `RESEND_API_KEY`, `EMAIL_FROM` — email (dormant)

---

## Local development

```bash
npm install
# set a .env with at least DATABASE_URL, AUTH_SECRET, BANKR_LLM_*
npm run db:push       # sync schema to your DB
npm run db:seed       # seed an initial user / sample data
npm run dev
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run db:push` | Sync schema (no migration history) |
| `npm run db:seed` | Seed via `prisma/seed.ts` |
| `npm run db:reset` | Force-reset + reseed (destructive) |
| `npm run cron:tick` | Run the cron worker once (what the cron service runs) |
| `npm run slack:bot` | Run the Slack bot worker (what the slack-bot service runs) |
| `npm run migrate:roles` | One-off role migration |

> **Node version:** Railway currently runs Node 18; `resend` wants Node 20+ (warning only today). Pin Node 20 on the services if a dependency starts hard-requiring it.

> **`prisma generate`:** the client is generated on `postinstall` and `build`. If editing in an environment that can't reach Prisma's binary host, `tsc` will report `@prisma/client has no exported member 'Prisma'/'PrismaClient'` and Prisma input types degrade to `any` — real type errors then only surface at the Railway build. Verify locally with:
> ```bash
> npx tsc --noEmit 2>&1 | grep "error TS" | grep -vcE "has no exported member '(Prisma|PrismaClient)'"
> ```
> (should be `0`).

---

## Data model (key tables)

- **Submission** — a project; narrative fields, `founders` (JSON), `score` + `scoreBreakdown`, `stage`, `owner`, `needsHelp[]`, `source`.
- **TokenMatch** — live onchain data for a submission (`token` = the ticker/symbol, `vol24h`, `marketCapUsd`, `priceChange24h`, `fees24h`).
- **ProposedEdit** — queued/applied agent edits (the propose-review system); `changes` JSON, `status` (pending/approved/rejected/auto_applied), `source`, `proposedBy`.
- **OutreachActivity** — notes/contact log on a submission (requires a real `User` author).
- **CronJob** — ad-hoc scheduled jobs; `config` JSON holds job-specific data (e.g. a Slack report spec + webhook).
- **CoreJobState** — state for the hard-coded core refreshes (onchain/sheet), which are not table rows.
- **User** — `role`, `slackWebhook` (per-user outbound), dashboard layout/panels.
- **AppConfig** — singleton; team-wide Slack webhook.
- **SharedPanel**, **ScoreConfig**, **ImportLog** — saved dashboard panels, scoring weights singleton, import audit log.

**Enums**
- `Source`: GOOGLE_FORM · PLAIN · MANUAL · AGENT · SLACK · TELEGRAM
- `Stage`: NEW · REVIEWING · CONTACTED · IN_CONVO · ONBOARDING · WON · PASSED
- `Role`: ADMIN · DEVREL · SUPPORT · ENGINEERING

---

## Roles & capabilities

Capabilities are checked via `can(role, capability)` in `src/lib/access.ts`. Keys:
`analytics.use`, `cron.manage`, `import.run`, `panels.create`, `settings.scoring`, `settings.sources`, `submissions.edit`, `submissions.enrich`, `submissions.view`, `users.manage`.

Agent **write** tools are gated: create_submission / propose_edit / ingest_project / resolve_proposal → `submissions.edit`; create_scheduled_job / create_slack_report → `cron.manage`. Read tools are open to any agent user. (This is also how the Slack bot enforces "unmapped user = read-only" — an unmapped Slack user gets a sentinel role that fails every `can()` check, so reads work and writes are refused.)

---

## The agent

One agent, two front doors (web bubble + Slack bot), both calling `agentRun()`.

**Read tools:** `query_pipeline`, `get_pipeline_summary`, `get_submission_detail`, `search_submissions`, `get_team_workload`, `get_token_data`, `get_score_config`, `list_saved_panels`, `list_scheduled_jobs`, `list_pending_proposals`.

**Write tools:** `create_submission` (new card, with dedup), `propose_edit` (edit existing), `ingest_project` (unstructured text → CRM), `resolve_proposal` (approve/reject a queued edit), `create_scheduled_job`, `create_slack_report`, `build_panel`.

**Propose-review safety model:**
- Additive edits (append/add to a blank or list field) **auto-apply** immediately.
- Destructive edits (replace/remove on a populated field, or multi-field) are **queued** to the Review inbox for human approval — applied only on approve.
- Approve/reject from the web Review inbox **or** inline in Slack (reply "approve"/"reject"); both share one `resolveProposal()` path, so the queue stays in sync.

---

## Ingest pipeline (`src/lib/ingestSkill.ts`, `src/lib/ingest.ts`)

Turns arbitrary unstructured text into CRM data. Two stages:

1. **Extract** (`extractProjectData`) — one LLM call against the canonical schema map / extraction contract. Returns validated JSON; never invents values, never sets score, flags missing/ambiguous fields.
2. **Act** (`applyIngest`) — deterministic, no LLM. Dedups → creates a new card (new project) or routes field updates through the propose-review engine (existing project). Vague input → returns a clarification request instead of guessing.

`ingestSkill.ts` is the single canonical definition any source (agent, Slack, Telegram) references, so the mapping logic lives in one place. Tag the source via the `source` param (AGENT/SLACK/TELEGRAM).

---

## Slack integration

Three pieces:

1. **Outbound** (`src/lib/slack.ts`) — post to incoming webhooks (per-user `User.slackWebhook`, with an admin team-wide fallback in `AppConfig`). Configured in **Settings → Slack**.
2. **Scheduled reports** (`src/lib/reports.ts`) — the agent builds a structured `ReportSpec` once (`create_slack_report`); the cron service renders it **deterministically** each fire (no LLM at run time) and delivers via the webhook. The flexible `query_table` section covers ranked lists (sort/filter/columns/limit); named sections (top_candidates, team_workload, pipeline_summary, new_this_week) are shortcuts.
3. **Inbound bot** (`scripts/slackBot.ts`) — always-on Socket Mode worker (the slack-bot service). Responds to @-mentions, untagged replies in threads it's already in, and DMs. Resolves the Slack user → CRM user **by email** (mapped users act with their role + write attribution; unmapped users are read-only). Reuses the full agent via `agentRun()`.

### Slack app setup checklist

Setup lives across **several different pages** in the Slack app dashboard (api.slack.com/apps → your app). OAuth scopes and event subscriptions are **separate** — you need both. The gotchas below were each non-obvious:

**1. Socket Mode** — Settings → Socket Mode → Enable. Generates an app-level token (`xapp-…`) with `connections:write` → that's `SLACK_APP_TOKEN`.

**2. OAuth scopes** — OAuth & Permissions → Bot Token Scopes:
- `app_mentions:read` — receive mentions
- `chat:write` — post messages
- `users:read`, `users:read.email` — resolve Slack user → CRM user by email (**without `users:read.email`, identity mapping silently fails and everyone is treated as a read-only guest**)
- `channels:history`, `groups:history`, `im:history` — read thread history (for conversational memory + reading replies). `incoming-webhook` — outbound webhooks.
- Install/reinstall → copy the Bot User OAuth Token (`xoxb-…`) → `SLACK_BOT_TOKEN`.

**3. Event Subscriptions** — Features → Event Subscriptions → Enable, then "Subscribe to bot events" (this is a **separate page from OAuth scopes** — a scope alone does not deliver events):
- `app_mention` — mentions
- `message.im` — DMs
- `message.channels` — untagged messages in **public** channels (**if the bot works in DMs/mentions but is silent on untagged channel replies, this is almost always the missing piece**)
- `message.groups` — untagged messages in private channels

**4. App Home** — Features → App Home → Show Tabs → **Messages Tab ON** + check **"Allow users to send Slash commands and messages from the messages tab"** (without this, DMs to the bot show "Sending messages to this app has been turned off").

**5. Reinstall** — required whenever you change **OAuth scopes** (not for App Home toggles). After reinstalling, invite the bot to channels with `/invite @Bankr CRM`.

---

## Deploy / ops

- **Git → Railway:** push to the repo; all three services rebuild. Schema changes go in the same commit as the code that needs them.
- **`npm ci` lockfile:** Railway uses `npm ci`, which fails if `package-lock.json` is out of sync with `package.json`. **When adding a dependency, commit the updated lockfile** (`npm install --package-lock-only`).
- **Multi-service env parity:** promote variables to Railway **shared/project vars** rather than duplicating per service. cron needs `DATABASE_URL` + the `GOOGLE_SHEET_*` vars; slack-bot needs `DATABASE_URL` + `BANKR_LLM_*` + `SLACK_*`.
- **`--accept-data-loss`:** the web start command currently runs `prisma db push --accept-data-loss`. Remove this flag before holding real production data you can't lose.
- **Core refreshes** (onchain 15m, sheet 30m) are hard-coded in the scheduler (not deletable CronJob rows); their status shows in **Admin → Core Refresh**.

---

## Project layout (selected)

```
prisma/schema.prisma          data model
src/lib/agentRun.ts           shared agent dispatch loop (web + bot)
src/lib/agentTools.ts         agent tool definitions + executors
src/lib/ingest.ts             two-stage ingest pipeline
src/lib/ingestSkill.ts        canonical schema map / extraction contract
src/lib/proposedEdits.ts      propose-review model + apply logic
src/lib/reports.ts            Slack report sections + renderer
src/lib/slack.ts              outbound Slack helpers
src/lib/scheduler.ts          cron job handlers + core refreshes
src/lib/access.ts             roles + capability checks
scripts/slackBot.ts           Slack Socket Mode worker (slack-bot service)
scripts/cronTick.ts           cron worker (cron service)
railway.json / .cron.json / .slack.json   per-service Railway config
```
