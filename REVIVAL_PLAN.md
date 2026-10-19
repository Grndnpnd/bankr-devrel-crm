# Revival plan: BANKRcrm → artifact manager + artifact dashboards

Status 2026-10-19: Phases 0 and 1 are built on branch `artifact-hub`, plus a first MCP connector (pulled forward from Phase 3), verified locally. Not deployed.

Done: Next 16 / React 19 / Prisma 6 / Node 22 / Railpack; LLM provider registry (Ollama Cloud default, Bankr kept, OpenAI-compatible) with Settings → Models;
artifact library with versions, sharing (view/use/edit, team), `window.claude` shim (db/user/artifact/downloads/sample/permissions); MCP at /api/mcp with personal tokens (Settings → Claude).
Still open: Prisma 7 (needs Node 22.12+ locally), Tailwind 4 / Recharts 3 / Zod 4, OAuth for claude.ai connectors, artifact tiles on the dashboard (Phase 2), rename.

## What is there today

- Next.js 14 (App Router), React 18, Prisma 5 on Postgres, Zustand, Tailwind 3, shadcn/ui.
- Railway project **Bankr CRM**, four services, all `SUCCESS`: `bankr-devrel-crm` (web,
  https://bankr-devrel-crm-production.up.railway.app), `Cron Tick`, `Slack Bot`, `Postgres`.
  Built with Nixpacks on Node 18. Last commit 2026-06-22.
- Features to keep: submissions pipeline + scoring, propose/review edit queue, outreach log,
  Plain support inbox sync + support dashboard, Google Sheets import, Slack bot + scheduled
  Slack reports, cron jobs, roles/capabilities, per-user dashboard layouts with widget registry
  and agent-built panels (`SharedPanel`), the tool-using agent (24 tools, `src/lib/agentTools.ts`).
- LLM: one client (`src/lib/llm.ts`) hard-wired to the Bankr gateway (`X-API-Key`,
  `BANKR_LLM_MODEL=gemini-3-flash`).

## Findings that shape the plan

1. **Ollama Cloud drops straight in.** `https://ollama.com/v1/chat/completions` with a Bearer key
   is OpenAI-compatible. Tool calls tested 2026-10-19 and all worked: kimi-k3, glm-5.3,
   deepseek-v4-pro, gpt-oss:120b, mistral-large-4, minimax-m3 (1–4 s). JSON extraction should
   default to gpt-oss:120b (glm-5.3 has failed strict JSON before).
2. **Claude artifacts are not static.** The dashboards (e.g. 30th Celebration Watch) declare
   runtime capabilities (`db`, `user`) and call `window.claude.*`. Copied out of claude.ai they
   break unless this app provides a compatible shim backed by its own database.
3. **Artifacts are untrusted HTML/JS.** They must render in a sandboxed iframe
   (`sandbox="allow-scripts"`, no `allow-same-origin`) on a separate path/origin, talking to the
   host only over `postMessage`.
4. **"Connect my Claude" = an MCP connector.** claude.ai has no API for a third-party app to pull
   artifacts, so the app exposes a remote MCP server; Claude (claude.ai, Claude Code, scheduled
   tasks) pushes artifacts and data into it. The one-time import of the existing 11 artifacts can
   be done from Claude Code, which can list and read them.

## Phases

**0 — Modernize (no feature change)**
- Node 22, Railpack instead of Nixpacks, Next 15 + React 19, Prisma 6, refresh deps.
- LLM provider registry: Ollama Cloud (default), Anthropic, Bankr gateway (kept, optional).
  Per-task model choice in Settings (agent / extraction / reports) instead of one env var.
- Rename product + Railway project; README rewrite.

**1 — Artifact library**
- `Artifact` (title, html, source URL, tags, declared capabilities, owner, visibility) +
  `ArtifactVersion` + `ArtifactData` (the shim's key/value collections).
- Library page: grid with live thumbnails, search/tags, version history, open full-screen.
- Sandboxed viewer + `window.claude` shim (db get/set/list/query, user identity).

**2 — Artifact dashboards**
- New widget kind "artifact tile" in `widgetRegistry`, so artifacts sit beside existing panels
  in the same 12-column layouts (`dashboardLayouts` already supports named layouts).

**3 — Connect Claude**
- Remote MCP server at `/api/mcp` (streamable HTTP, OAuth): `publish_artifact`,
  `update_artifact`, `list_artifacts`, `pin_to_dashboard`, `write_data`.
- Bulk import of the current claude.ai artifacts; point scheduled tasks (e.g. the Pokémon
  tracker) at the app so dashboards refresh there.

**4 — Agent**
- Agent tools to create/edit artifacts and tiles ("make me a tile that shows X").

## Open items

- Rotate the `GOOGLE_SERVICE_ACCOUNT` key (`bankr-crm-importer@koda-workspace`): it was
  printed into a Claude Code session transcript on 2026-10-19.
- New product name.
