# Cron / Scheduling — Railway native setup

Jobs are managed in **Settings → Automation**. A heartbeat runs `npm run cron:tick`
on a schedule; each tick runs whatever jobs are *due* (their next-run time has passed).
No external pinger, no `CRON_SECRET` needed for the native path — it calls the
scheduler directly in our own process.

## One-time Railway setup

Railway runs scheduled commands via a **cron schedule on a service**. Set it up once:

### Option A — Cron schedule on a dedicated service (recommended)
1. In the Railway project, **New → Empty Service** (or duplicate the app service).
2. Point it at the **same repo** (so it has the code + env).
3. In that service's **Settings → Deploy**:
   - **Start Command:** `npm run cron:tick`
   - **Cron Schedule:** `*/5 * * * *`  (every 5 minutes)
4. Make sure it shares the same **`DATABASE_URL`** (and any env the jobs need, e.g.
   the Bankr API access used by onchain refresh). Railway cron services run the
   command, exit, and re-run on schedule — they don't stay up.

### Option B — Cron on the existing service
Some Railway plans allow a cron schedule directly on the web service via
`railway.json`/the dashboard. If available, set a cron entry running
`npm run cron:tick` every 5 minutes. (Dedicated service is cleaner — it keeps the
short-lived cron run separate from the long-lived web process.)

## Verify
- In **Settings → Automation**, create a job (e.g. *Hourly onchain refresh* →
  `refresh_onchain` → Hourly) and hit **Run now** to confirm the handler works.
- Within a few minutes of the cron schedule firing, due jobs run automatically;
  each job's **last run / next run / status** updates in the Automation tab.

## Notes
- The HTTP tick endpoint (`/api/cron/tick`, secret-gated) still exists as a
  fallback if you ever want an external pinger — but the native `npm run cron:tick`
  is the primary, self-contained path.
- Heartbeat cadence (every 5 min) is the *resolution* of scheduling, not how often
  jobs run — a "daily" job still runs daily; the tick just checks what's due.
