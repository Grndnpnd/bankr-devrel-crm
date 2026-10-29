/**
 * Agent tools for beta programs, artifacts and dashboards. Everything reads as the
 * person asking (lib/dataSources), so the agent never sees a program they can't.
 * Shared by the in-app agent, the Slack bot and the MCP server via runTool.
 */
import type { ToolDef } from '@/lib/llm';
import type { ToolContext, ToolExecResult } from '@/lib/agentTools';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/access';
import { createArtifact, listArtifacts, type ListScope } from '@/lib/artifacts';
import { programOverview, reportLink } from '@/lib/betaFlow';
import { LABEL, effectiveSeverity, isOpen } from '@/lib/betaModel';
import { describeSources, SOURCE_KEYS, sourceOf, type AnalyticsSpec } from '@/lib/analyticsSpec';
import { DataError, loadRows, resolveProgram, runSpec, sourcesFor, visiblePrograms, canReadBeta, type DataViewer } from '@/lib/dataSources';
import { dashboardHtml, DASHBOARD_CAPABILITIES, type DashboardPanel } from '@/lib/dashboardArtifact';
import { artifactTables } from '@/lib/artifactTables';

const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const programUrl = (id: string) => `${APP_URL()}/beta/${id}`;
const artifactUrl = (id: string) => `${APP_URL()}/artifacts/${id}`;
const out = (v: unknown): ToolExecResult => ({ result: JSON.stringify(v) });
const err = (message: string): ToolExecResult => out({ error: message });

/** The spec properties every data tool takes (one source at a time). */
export const SPEC_PROPS = {
  source: { type: 'string', enum: SOURCE_KEYS, description: 'which data: artifact_data (the data INSIDE one artifact: its data files or data store; needs artifact + table, see inspect_artifact), beta_reports, beta_testers, beta_outreach (messages to testers), beta_payouts, artifacts (the list of artifacts), or submissions (the pipeline). Call describe_data for the fixed sources\' fields.' },
  program: { type: 'string', description: 'beta sources: the program\'s name (e.g. "Texting"); leave out for every program the user can see' },
  artifact: { type: 'string', description: 'artifact_data: the artifact\'s title or id' },
  table: { type: 'string', description: 'artifact_data: which of its tables (a name from inspect_artifact, e.g. "positions.json" or "db:tasks")' },
  type: { type: 'string', enum: ['stat', 'bar', 'pie', 'line', 'table'], description: 'line = a time series (groupBy a date field)' },
  title: { type: 'string', description: 'short human title' },
  metric: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
  metricField: { type: 'string', description: 'a numeric field of the source (for sum/avg/min/max)' },
  groupBy: { type: 'string', description: 'a groupable field of the source (bar/pie/line); a date field groups by bucket' },
  bucket: { type: 'string', enum: ['day', 'week', 'month'], description: 'when groupBy is a date (default week)' },
  columns: { type: 'array', items: { type: 'string' }, description: 'table columns (fields of the source)' },
  filters: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'contains_any', 'has', 'is_empty', 'not_empty'] },
        value: { description: 'dates take an ISO date or "7d" (7 days ago): {field:"created_at",op:"gte",value:"7d"} = the last week. Booleans take true/false. Option fields take their label ("UX Feedback") or value ("feedback").' },
      },
      required: ['field', 'op'],
    },
  },
  sortBy: { type: 'string', description: 'table: the field to order by' },
  sort: { type: 'string', enum: ['asc', 'desc'] },
  limit: { type: 'number' },
} as const;

export const DATA_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'list_beta_programs',
      description: 'The beta programs (campaigns) this user can see, each with its headline numbers: testers, testing now, open/urgent/unreviewed bugs, messages to send/approve/overdue, testers waiting on funds, what was paid, and what waits on this user. Start here for any question about betas, campaigns or testers.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_beta_program',
      description: 'One beta program in depth: its overview numbers, coverage per test area, who leads and sends, its teams, and the latest reports. Use for "how is the X beta going", "status of X".',
      parameters: { type: 'object', properties: { program: { type: 'string', description: 'program name (partial is fine)' } }, required: ['program'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_data',
      description: 'Exact counts, breakdowns, time series and lists over beta programs (reports, testers, messages, payouts), the data inside an artifact (source artifact_data), or the list of artifacts, computed by code. ALWAYS use this for beta numbers ("how many bugs this week", "reports by severity", "testers by stage", "payouts by token"); never count yourself. For the DevRel pipeline use query_pipeline instead.',
      parameters: { type: 'object', properties: SPEC_PROPS, required: ['source', 'type'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_beta_reports',
      description: 'Find beta reports by text (title and description) and filters. Returns id, title, kind, severity, status, tester, program and a link. Use for "what did testers say about X", "open bugs about login".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'words to find in the title or description (optional)' },
          program: { type: 'string' },
          kind: { type: 'string', enum: ['bug', 'feedback', 'idea', 'question', 'praise'] },
          open_only: { type: 'boolean' },
          limit: { type: 'number' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_beta_report',
      description: 'The full record of one beta report: description, steps, expected/actual, severity (tester\'s and the team\'s), status, who it waits on, next step, links, the conversation with the tester, and messages about it. Pass the id from search_beta_reports.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_artifact',
      description: 'Look inside one artifact: what the page shows (its headings) and the data it carries: each table from its data files (JSON/CSV it loads) and its data store, with row counts, every field\'s type, ranges or example values, and a few sample rows. Call this whenever the user wants numbers, panels or a dashboard FROM an artifact ("pull data from the Traktor dashboard", "chart what that artifact tracks"); then use query_data / build_panel / build_dashboard with source "artifact_data", artifact and table.',
      parameters: { type: 'object', properties: { artifact: { type: 'string', description: 'its title (partial is fine) or id' } }, required: ['artifact'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_data',
      description: 'The data sources this user can chart and the fields of each (with their allowed values). Call before query_data / build_panel / build_dashboard when unsure which field to use.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_artifacts',
      description: 'Find artifacts (pages, dashboards, docs) the user can open: theirs, shared with them, or shared with the team. Returns title, kind, owner and link.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, scope: { type: 'string', enum: ['all', 'mine', 'shared', 'team'] } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_dashboard',
      description: 'Create a live dashboard as an artifact: a page of several panels (stats, charts, tables) over beta, artifact or pipeline data that refreshes itself, which the user can open, share and edit. Use when they ask for "a dashboard", "a page/report I can share", or several charts at once. A typical beta dashboard: open bugs (stat), urgent bugs (stat), reports per week (line on created_at), reports by kind (pie), bugs by severity (bar), testers by stage (bar), open bugs table, overdue messages table. Each panel uses the same shape as query_data. Returns the link — give it to the user.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'one line under the title' },
          program: { type: 'string', description: 'beta program name: applied to every beta panel that doesn\'t name one' },
          panels: { type: 'array', items: { type: 'object', properties: { ...SPEC_PROPS, wide: { type: 'boolean', description: 'span the full width' } }, required: ['source', 'type', 'title'] } },
          share_with_team: { type: 'boolean', description: 'everyone on the team can open it (each still sees only data they have access to)' },
        },
        required: ['title', 'panels'],
      },
    },
  },
];

export const DATA_TOOL_NAMES = new Set(DATA_TOOLS.map((t) => t.function.name));

const viewerOf = (ctx: ToolContext): DataViewer => ({ id: ctx.userId, role: ctx.role ?? '', email: ctx.userEmail });

async function names(ids: (string | null | undefined)[]) {
  const want = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const users = want.length ? await prisma.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true, email: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

/** A spec for one panel, with the dashboard's program filled in for beta sources. */
function withProgram(spec: any, program?: string) {
  const s = { ...spec };
  delete s.wide;
  if (program && !s.program && sourceOf(s).beta) s.program = program;
  return s;
}

export async function runDataTool(name: string, args: any, ctx: ToolContext): Promise<ToolExecResult> {
  const v = viewerOf(ctx);
  try {
    switch (name) {
      case 'describe_data':
        return out({ sources: describeSources(sourcesFor(v)), note: 'Rows hold labels (e.g. kind "UX Feedback"); dates are ISO. Beta sources take an optional program. artifact_data has no fixed fields: inspect_artifact shows each table\'s.' });

      case 'list_beta_programs': {
        if (!canReadBeta(v)) return err('Beta programs need task-board access.');
        const programs = await visiblePrograms(v);
        const rows = await Promise.all(programs.map(async (p) => ({
          name: p.name, product: p.product, status: p.status, ends: p.endsAt?.toISOString().slice(0, 10) ?? null,
          url: programUrl(p.id), ...(await programOverview(p.id, v.id, p.leadId === v.id)),
        })));
        return out({ count: rows.length, programs: rows });
      }

      case 'get_beta_program': {
        const p = await resolveProgram(v, args?.program);
        const full = await prisma.betaProgram.findUnique({
          where: { id: p.id },
          select: { name: true, product: true, status: true, description: true, endsAt: true, testAreas: true, leadId: true, senderId: true, team: { select: { name: true } }, bugTeam: { select: { name: true } } },
        });
        const [overview, latest] = await Promise.all([
          programOverview(p.id, v.id, p.leadId === v.id),
          prisma.testerReport.findMany({ where: { programId: p.id }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, title: true, kind: true, status: true, severity: true, claimedSeverity: true, createdAt: true, tester: { select: { name: true } } } }),
        ]);
        const who = await names([full?.leadId, full?.senderId]);
        return out({
          program: full?.name, product: full?.product, status: full?.status, description: full?.description,
          ends: full?.endsAt?.toISOString().slice(0, 10) ?? null, url: programUrl(p.id),
          lead: full?.leadId ? who.get(full.leadId) ?? null : null, sender: full?.senderId ? who.get(full.senderId) ?? null : null,
          team: full?.team?.name ?? null, bug_team: full?.bugTeam?.name ?? full?.team?.name ?? null,
          test_areas: full?.testAreas, overview,
          latest_reports: latest.map((r) => ({
            id: r.id, title: r.title, kind: LABEL.kind[r.kind] ?? r.kind, status: LABEL.status[r.status] ?? r.status,
            severity: LABEL.severity[effectiveSeverity(r) ?? ''] ?? null, tester: r.tester.name, reported: r.createdAt.toISOString().slice(0, 10), url: reportLink(p.id, r.id),
          })),
        });
      }

      case 'query_data': {
        const { spec, result, programName, artifactTitle } = await runSpec(args, v);
        return out({ ...(programName ? { program: programName } : {}), ...(artifactTitle ? { artifact: artifactTitle, table: spec.table } : {}), source: sourceOf(spec).key, ...result });
      }

      case 'inspect_artifact': {
        const { artifact: a, tables } = await artifactTables(v, args?.artifact);
        const plain = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
        const body = (a.html.match(/<body[^>]*>([\s\S]*)/i)?.[1] ?? a.html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
        const headings = Array.from(a.html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)).map((m) => plain(m[1])).filter(Boolean).slice(0, 30);
        const short = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([k, x]) => [k, typeof x === 'string' && x.length > 80 ? x.slice(0, 80) + '…' : x]));
        return out({
          id: a.id, title: a.title, kind: a.kind, description: a.description, url: artifactUrl(a.id),
          page_headings: headings, page_text: plain(body).slice(0, 1200),
          tables: tables.map((t) => ({
            table: t.name, from: t.origin, rows: t.rows.length, fields: t.info,
            ...(t.rows.length === 1 ? { values: short(t.rows[0]) } : { sample_rows: t.rows.slice(0, 3).map(short) }),
          })),
          ...(tables.length
            ? { how: 'Chart a table with source "artifact_data", artifact (this title or id) and table; fields are the keys above. Dates are ISO (epoch timestamps were converted), so they group by day/week/month.' }
            : { note: 'This artifact keeps no data files or stored data: its numbers are written into the page, so there is nothing live to chart from it.' }),
        });
      }

      case 'search_beta_reports': {
        const rows = await loadRows('beta_reports', v, { program: args?.program || undefined });
        const q = String(args?.query ?? '').trim().toLowerCase();
        let ids = rows.map((r) => r.id as string);
        if (q) {
          const hits = await prisma.testerReport.findMany({
            where: { id: { in: ids }, OR: [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }, { steps: { contains: q, mode: 'insensitive' } }] },
            select: { id: true },
          });
          ids = hits.map((h) => h.id);
        }
        const wanted = new Set(ids);
        const kindLabel = args?.kind ? LABEL.kind[args.kind] : null;
        const found = rows
          .filter((r) => wanted.has(r.id) && (!kindLabel || r.kind === kindLabel) && (!args?.open_only || r.open))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, Math.min(50, Math.max(1, Number(args?.limit) || 15)))
          .map((r) => ({ id: r.id, title: r.title, kind: r.kind, severity: r.severity, status: r.status, open: r.open, tester: r.tester, program: r.program, reported: String(r.created_at).slice(0, 10), url: reportLink(r.program_id, r.id) }));
        return out({ count: found.length, reports: found });
      }

      case 'get_beta_report': {
        const r = await prisma.testerReport.findUnique({
          where: { id: String(args?.id ?? '') },
          include: {
            tester: { select: { name: true, stage: true } },
            program: { select: { id: true, name: true, teamId: true, bugTeamId: true, leadId: true, senderId: true, createdById: true } },
            replies: { orderBy: { createdAt: 'asc' }, take: 20, select: { body: true, authorType: true, userId: true, createdAt: true } },
            outreach: { select: { title: true, type: true, status: true, outcome: true, answer: true, sentAt: true } },
            _count: { select: { attachments: true } },
          },
        }).catch(() => null);
        if (!r) return err('No report with that id. Use search_beta_reports to find one.');
        await resolveProgram(v, r.program.id); // throws no_access for a program they can't see
        const who = await names([r.waitingOnId, ...r.replies.map((x) => x.userId)]);
        return out({
          id: r.id, program: r.program.name, url: reportLink(r.program.id, r.id), title: r.title,
          kind: LABEL.kind[r.kind] ?? r.kind, status: LABEL.status[r.status] ?? r.status, open: isOpen(r.kind, r.status),
          severity: LABEL.severity[r.severity ?? ''] ?? null, testers_severity: LABEL.severity[r.claimedSeverity ?? ''] ?? null,
          tester: r.tester.name, test_area: r.testArea, device: LABEL.device[r.device ?? ''] ?? null, browser: r.browser,
          environment: LABEL.environment[r.environment ?? ''] ?? null, page: r.pageUrl,
          description: r.body, steps: r.steps, expected: r.expected, actual: r.actual,
          waiting_on: r.waitingOnId ? who.get(r.waitingOnId) ?? null : null, next_step: r.nextStep, next_action_due: r.nextActionDue?.toISOString().slice(0, 10) ?? null,
          tracked_in: r.trackedIn, fix_pr: r.fixPr, attachments: r._count.attachments,
          reported: r.createdAt.toISOString(),
          conversation: r.replies.map((x) => ({ from: x.authorType === 'tester' ? `${r.tester.name} (tester)` : (x.userId && who.get(x.userId)) || 'Team', at: x.createdAt.toISOString().slice(0, 16), text: x.body })),
          messages: r.outreach.map((o) => ({ title: o.title, type: LABEL.outreachType[o.type] ?? o.type, status: LABEL.outreachStatus[o.status] ?? o.status, outcome: o.outcome ? LABEL.outcome[o.outcome] ?? o.outcome : null, answer: o.answer })),
        });
      }

      case 'find_artifacts': {
        const rows = await listArtifacts(v, { scope: (['all', 'mine', 'shared', 'team'].includes(args?.scope) ? args.scope : 'all') as ListScope, q: args?.query || undefined, take: 25 });
        return out({ count: rows.length, artifacts: rows.map((a) => ({ id: a.id, title: a.title, kind: a.kind, owner: a.owner.name || a.owner.email, relation: a.relation, team_visible: a.visibility === 'TEAM', updated: a.updatedAt.toISOString().slice(0, 10), url: artifactUrl(a.id) })) });
      }

      case 'build_dashboard': {
        if (!can(v.role, 'panels.create')) return err('You don’t have permission to create dashboards.');
        const raw: any[] = Array.isArray(args?.panels) ? args.panels.slice(0, 16) : [];
        if (!raw.length) return err('A dashboard needs at least one panel.');
        const panels: DashboardPanel[] = [];
        const problems: string[] = [];
        let programName: string | undefined, artifactTitle: string | undefined;
        for (const [i, p] of raw.entries()) {
          try {
            const run = await runSpec(withProgram(p, args?.program), v);
            programName ??= run.programName;
            artifactTitle ??= run.artifactTitle;
            panels.push({ spec: run.spec as AnalyticsSpec, ...(p?.wide ? { wide: true } : {}) });
          } catch (e) {
            if (e instanceof DataError && e.code !== 'invalid') throw e;
            problems.push(`panel ${i + 1} (${p?.title ?? 'untitled'}): ${(e as Error).message}`);
          }
        }
        if (problems.length) return out({ error: 'Some panels are invalid — fix them and call build_dashboard again.', problems });
        const title = String(args?.title || 'Dashboard').trim().slice(0, 120);
        const subtitle = String(args?.description ?? '').trim() || (programName ? `${programName} beta` : artifactTitle ? `From ${artifactTitle}` : undefined);
        const a = await createArtifact(v, {
          title, html: dashboardHtml(title, panels, subtitle), description: subtitle ?? null, kind: 'dashboard',
          tags: ['dashboard', ...(panels.some((p) => sourceOf(p.spec).beta) ? ['beta'] : [])],
          capabilities: DASHBOARD_CAPABILITIES, visibility: args?.share_with_team ? 'TEAM' : undefined, note: 'Built by the CRM assistant',
        });
        const artifact = { id: a.id, title: a.title, url: artifactUrl(a.id) };
        return { result: JSON.stringify({ created: true, ...artifact, panels: panels.length, team_visible: !!args?.share_with_team }), artifact };
      }
    }
  } catch (e) {
    if (e instanceof DataError) return err(e.message);
    throw e;
  }
  return err(`Unknown tool ${name}`);
}
