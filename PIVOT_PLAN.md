# Pivot plan: DevRel → Community & Support

Status 2026-10-26. The hub keeps everything it has (artifacts, MCP connector, CRM agent, support
dashboard). This plan turns the DevRel pipeline into a community + support workspace.

## Done

- **Google Sheet is no longer a source of truth.** The scheduled Sheets import and the DevRel onchain
  token refresh are paused by default (Settings → Core Refresh has a Scheduled switch per job).
  The import tooling, "Run now" and the submissions data all stay.
- **Teams, notifications and the task board** (2026-10-26). Settings → Teams (admins create teams, leads
  manage their own); /tasks board with drag-and-drop, filters and a drawer; the bell with live updates;
  Web Push per device (Settings → Notifications, installable app for iPhone); due-soon reminders every
  15 minutes. Tasks carry a source and link, ready for Slack, Claude, testers and email to feed them.
- **Claude Code task tools, Slack "add to tasks", wallet alerts** (2026-10-26). The MCP connector has
  my_tasks / list_tasks / create_task / update_task / list_teams / notifications. Slack: message shortcut
  + @mention over HTTP (needs the Slack app created from the manifest in Settings → Slack, then
  SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET on the web service). /wallets: Base/Ethereum ETH + USDC every
  5 minutes, low-balance alerts to the wallet's team plus a top-up task that closes on recovery.
- **Beta programs** (2026-10-26). /beta: a program per launch with a revocable join link, tester cap,
  end date and sign-up questions. Testers join at /b/<slug> (no account; a personal portal link, re-join
  with the same email for a fresh one), file bugs/feedback/ideas/questions with screenshots, and talk with
  the team per report. Each report is a task for the program's team (bugs can go elsewhere), priority from
  severity; tester replies notify the owner; Done on the board shows Fixed to the tester. Rate limits on
  the public forms; Cloudflare Turnstile switches on with TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY.
  Rate limits live in the database (they hold across instances).
- **Plain** (2026-10-27, built and tested against a mock; switches on with the keys below). Settings → Plain
  shows what's connected, the URLs to paste into Plain, SLA numbers and the routing rules.
  - Routing rules: a Plain label (or any thread) → a team, with "tell them about new threads" and "SLA alerts".
  - SLA alerts: about to breach / breached → the team's members (bell + push, opens the Plain thread); a breach
    puts an urgent task on the team's board that closes itself once the SLA is met or the thread is done.
  - Beta reports open an API thread in Plain (externalId `beta_report_<id>`, program label, priority from
    severity). CRM replies go out through Plain, which emails the tester; replies written in Plain and the
    tester's emailed answers show up in the portal; portal replies land on the thread and move it back to Todo.
    Failures are retried every 5 minutes (`plain_beta_sync`). Team replies older than the thread aren't emailed.
  - Live chat on the tester page: Plain's widget, signed as the tester (HMAC of their email).
  - Customer cards `crm-beta` (programs and reports, this thread's first) and `crm-tasks` (open CRM tasks).
  - Webhook now refuses unsigned requests in production; reconcile reads each thread's own timeline and channel.
  - Needs: PLAIN_API_KEY (machine user, permissions listed in Settings → Plain), PLAIN_HMAC_SECRET (or the
    existing PLAIN_WEBHOOK_SECRET), optional PLAIN_CHAT_APP_ID + PLAIN_CHAT_SECRET and PLAIN_WORKSPACE_ID.
  Email to testers now comes from Plain; Resend would only matter for programs with Plain switched off.

- **Beta programs, production pass** (2026-10-28). Re-joining with an email that already joined no longer signs
  you in as that tester (emailed link when email is set up; otherwise "use your saved link"); extra sign-in links
  and "sign out everywhere" for the team; email verification (opened an emailed link, or answered a Plain email)
  before Plain chat is signed; upload fixes (UTF-8 names, 10 MB through the proxy, caps under parallel uploads,
  quotas); clean errors; rollback of half-filed reports; Referrer-Policy on tester pages.
- **Beta dashboard parity + Notion** (2026-10-28), matching the team's Notion-backed "Texting Beta Testers" page:
  - Testers: lifecycle (To Contact → Invited → Onboarding → Active → Feedback In → Completed / Dropped; removed =
    Declined), type, usage, send funds, channel + handle, wallet, test areas, check-ins; the team can add testers
    without an email.
  - Reports: claimed vs official severity (Critical/High/Medium/Low), their bug flow (New → Triaged → Escalated →
    Fix in Review → Fix Live → Retest Needed → Verified, or Duplicate / Already Known / Won't Fix; others Noted /
    Passed On / Shipped), area, device, environment, tx/contract, Plain ticket, tracked in, fix PR, next step,
    "waiting on" that follows the status, duplicates, calls; the team can log a report for a tester.
  - Outreach queue: suggest → lead approves → sender sends on the tester's channel → answer → close with an outcome;
    escalating a bug or putting its fix live suggests the message for every affected tester (duplicates included).
    Testers can also answer a retest themselves on their page (Works now / Still broken).
  - Payouts and the funding queue, feedback calls, an overview (tiles, test-area coverage, "waiting on me").
  - Notion, both ways, per program: connect each board (testers, reports, outreach, payouts, calls) by link; it maps
    itself to their property names (adjustable in Settings → Notion), imports existing rows, and from then on syncs
    field by field every 5 minutes (new reports right away). Shared boards (Outreach, Payouts) are scoped by their
    Program column. If both sides change the same field between syncs, Notion's edit wins.
  - Needs: NOTION_TOKEN (an internal Notion integration, shared with each board) on the web service and Cron Tick.

## The shared building blocks

Most of the seven asks need the same three things first. Built once, every feature plugs into them.

| Block | What it is | Used by |
|---|---|---|
| **Teams** | Departments (Support, Community, Engineering, Ops …) with members; anything can be routed to a team | 2, 3, 6, 7 |
| **Notifications** | One `Notification` row per person per event, delivered by their preferences: in-app (bell + live stream), Web Push (phone/desktop, installable app), Slack DM, Telegram DM | 1, 2, 3, 5, 6, 7 |
| **Tasks** | A task board: title, link back to the source (Slack message, email thread, tester report, Plain thread), assignee, team, status, due date | 2, 3, 4, 5, 6 |

## The seven features

| # | Feature | How | Effort | Needs from you |
|---|---|---|---|---|
| 1 | **Web app with notifications** | Installable app (PWA) + Web Push (VAPID, same pattern ExMuseMe uses) + in-app bell over SSE with 30 s heartbeats (Railway closes idle HTTP after 5 min). iPhone needs iOS 16.4+ and "Add to Home Screen". | 2–3 days | — |
| 2 | **Beta programs for launches** | A program per launch (product, dates, questions). Its join link (random token, expiry, use cap, revocable) opens a sign-up form behind Cloudflare Turnstile; testers sign in by magic link. Testers file bugs and feedback (severity, steps, device, screenshots); rules route each to a team as a task + notification. Each report also opens a Plain thread, and testers get Plain live chat on their portal (see Plain below). | 1–2 weeks | Cloudflare Turnstile keys; who reviews tester reports |
| 3 | **Slack: "add that to my tasks"** | New internal Slack app over the HTTP Events API (no separate worker; the old Slack Bot service can go). Message shortcut "Add to my tasks" (the payload already carries the text and link) + @mention as a second way in; a modal picks team / due date; DM confirms. Internal apps keep full history rate limits. Bolt for JS 5.x. | 1–2 days | Create the Slack app in your workspace (I'll give the manifest) |
| 4 | **Claude Code integration** | Extend the existing MCP connector with task and notification tools: my tasks, create/update/complete a task, what needs me, tester reports for a program. Works in Claude Code and Desktop today with the token you already made. | 1 day | — |
| 5 | **Telegram** | One bot on webhooks (`secret_token` checked on every update). People link accounts with a one-time `t.me/<bot>?start=<token>` link from Settings; then they get notifications there and can forward a message to the bot to make a task. Can also bridge Telegram chats into Plain as threads. Optional later: a Telegram Mini App as the tester join flow. Replaces the old DevRel outbound queue a teammate's bot polled. | 1 day (+2 for Mini App) | Create the bot with BotFather |
| 6 | **Communication tracking (Gmail)** | Mark an email thread as tracked ("waiting on vendor — blocks Support + Engineering") from the app or with a Gmail label. Gmail `users.watch` → Pub/Sub push (OIDC-verified) → `history.list` matches the thread → notify the affected teams the moment the reply lands; nudge if it waits past N days. Watch renewed daily by cron. Scope `gmail.metadata` (headers + labels only, no bodies). | 3–5 days | See decision 3 |
| 7 | **Reimbursement wallet balance** | Wallets with chain, tokens, alert and clear levels, and teams to tell. A cron reads `eth_getBalance` + USDC `balanceOf` on Base every few minutes (Alchemy free tier covers it many times over). Alert only after 2 readings below the line, clear above a higher line, never on an RPC error. A balance-history tile for the dashboard. | 1 day | Wallet address(es) and chain; a new Alchemy key |

## Plain

From Plain's docs and changelog as of 2026-10-26 ([docs](https://www.plain.com/docs)). Today we only read
from Plain (webhooks + backfill → support dashboard). What's worth adding, best first:

| Add | What it gives the team | Effort |
|---|---|---|
| **SLA breach alerts** | Pin our webhook to the current version (`2026-10-06`); `service_level_agreement_status_transitioned` → notify the owning team on imminent breach / breach. SLA compliance on the support dashboard next to median first response. Plain now has SLA policies (first/next response, first/total resolution) with business-hours schedules. | 1 day |
| **Customer Card** | When someone opens a customer in Plain, Plain asks our endpoint and shows CRM context: tester status and programs, open tasks, wallet reimbursements, links back. Signed with the HMAC we already verify; only called on open. | 1 day |
| **Tester reports become Plain threads** | The beta form calls `upsertCustomer` + `createThread` (labels, priority, our id as `externalId`), so tester conversations live in the support inbox and replies go back through Plain. Contact forms are just API calls, so one per program is fine. | in feature 2 |
| **Live chat for testers** | Plain's chat embed on the tester portal, with the tester verified by an HMAC of email + our id (secret stays on our server). Ari (Plain's AI agent) can take the first pass from the help center. | ½ day |
| **Department routing** | Our webhook handler routes by label, thread field or account to Teams → notifications. `note_mention_created` can ping a team. | in blocks |
| **Accounts and tiers** | Tenants/companies are now "Accounts"; one per partner org, tiers like "Launch partner" so SLA policies follow the tier. | ½ day |
| **Telegram as a Plain channel** | Plain has no Telegram channel; our bot can bridge (message → thread, `thread.*_sent` → Telegram). | in feature 5 |
| **Sync fixes** | Read `Thread.channel` and the per-thread timeline directly (our code still guesses the channel and filters a customer's whole timeline), fewer API calls under the 450–1,000/min limit. | ½ day |

Also available, not planned yet: Plain's own MCP server (`mcp.plain.com`, per-user OAuth) — people can
add it to Claude next to ours; Plain Tasks with `task.*` webhooks if the team would rather keep tasks in Plain.

Before any of this: a new Plain API key (machine user, only the permissions above) — see decision 1.
Renames to watch: tenant/company fields are deprecated in favour of `account`; still work for now.

## Order

1. **Building blocks**: Teams, Notifications (in-app + Web Push), Tasks board — the visible part of feature 1.
2. **Quick wins on top**: Claude Code tools (4), Slack shortcut (3), wallet alerts (7).
3. **Beta programs** (2) with Plain wired back in.
4. **Telegram** (5) — tabled for now (Oct 27).
   Plain (support pillar) was done before Gmail, on Oct 27.
5. **Gmail tracking** (6) — last, because it needs Google Cloud setup and a decision on whose inboxes.

## Decisions for you

1. **Plain back on?** After the Oct 21 Railway incident the CRM has no Plain key (`PLAIN_ENABLED=false`). Beta programs and the support pillar want a new key.
2. **The DevRel pillar**: hide its pages for everyone (data kept, nothing deleted), or keep them visible under a new name for community partners?
3. **Gmail**: is the team on Google Workspace (bankr.bot)? An *Internal* Google app on the Workspace avoids Google's restricted-scope review and yearly security assessment. Whose inboxes get watched: each person who opts in, or one shared vendor inbox?
4. **Wallets**: Base only, or Solana too? Which addresses?

## Housekeeping from the October incident

- The Slack Bot service on Railway still has the old (revoked) Ollama key and its Slack app was deleted; it can be removed once the new HTTP Slack app is in.
- Still open from the incident notes: regenerate the Postgres password from Railway's dashboard, and rotate `AUTH_SECRET` (that signs people out once).

## Moving to AWS

The app is planned to move to AWS. What's already portable and what has to change:

- Portable: config is env vars only; Postgres via Prisma; no local files; webhook and job state live in the
  database. Core jobs claim each run with a conditional update and public-form rate limits are in Postgres,
  so running more than one instance is safe.
- `after()` work (Plain pushes, Slack replies) needs a long-lived Node server (ECS/Fargate or App Runner).
  On Lambda it would be cut off; the `plain_beta_sync` retry covers Plain, but prefer a container.
- The cron tick (`/api/cron/tick` every 5 minutes) becomes an EventBridge Scheduler rule calling the same URL.
- Railway starts with `prisma db push --accept-data-loss`; switch to `prisma migrate deploy` with checked-in
  migrations before the move.
- Tester attachments are stored in Postgres (`TesterAttachment.data`); move them to S3 when the data grows.
- SSE notifications poll the database every 4 s, so they work behind a load balancer; keep idle timeouts above
  the 25 s heartbeat.
