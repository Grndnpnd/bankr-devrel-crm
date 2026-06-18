import { prisma } from '@/lib/prisma';
import { reportBlocks } from '@/lib/slack';

/**
 * SCHEDULED REPORTS — hybrid model. The agent translates a plain-language
 * request into a structured ReportSpec ONCE (at creation). The cron renders it
 * DETERMINISTICALLY every fire — no LLM at run time.
 *
 * The workhorse is `query_table`: a flexible ranked-table section the agent
 * composes (sort field, direction, optional filter, columns, limit). This lets
 * arbitrary requests like "top 10 by 24h volume with ticker + market cap" become
 * a valid deterministic spec. The named sections are convenient shortcuts.
 */

export const REPORT_COLUMNS = ['project', 'ticker', 'score', 'vol24h', 'marketCap', 'stage', 'owner', 'needs', 'lastContact'] as const;
export type ReportColumn = typeof REPORT_COLUMNS[number];

export const SORT_FIELDS = ['vol24h', 'marketCap', 'score', 'lastContact'] as const;
export type SortField = typeof SORT_FIELDS[number];

export type ReportSection =
  | {
      kind: 'query_table';
      title?: string;                 // section heading
      sortBy?: SortField;             // default 'score'
      direction?: 'desc' | 'asc';     // default 'desc'
      limit?: number;                 // default 10
      columns?: ReportColumn[];       // default [project, score]
      stageFilter?: string[];         // optional stage filter (label values)
      onlyWithToken?: boolean;        // restrict to projects that have a token match
    }
  // Named shortcuts (still supported):
  | { kind: 'top_candidates'; limit?: number }
  | { kind: 'team_workload' }
  | { kind: 'pipeline_summary' }
  | { kind: 'new_this_week' };

export interface ReportSpec {
  title: string;
  sections: ReportSection[];
}

export const REPORT_SECTION_KINDS = ['query_table', 'top_candidates', 'team_workload', 'pipeline_summary', 'new_this_week'] as const;

const STAGE_LABEL: Record<string, string> = {
  NEW: 'New', REVIEWING: 'Reviewing', CONTACTED: 'Contacted',
  IN_CONVO: 'In conversation', ONBOARDING: 'Onboarding', WON: 'Won', PASSED: 'Passed',
};
const LABEL_TO_STAGE: Record<string, string> = Object.fromEntries(Object.entries(STAGE_LABEL).map(([k, v]) => [v.toLowerCase(), k]));

const COL_HEADER: Record<ReportColumn, string> = {
  project: 'Project', ticker: 'Ticker', score: 'Score', vol24h: '24h Vol',
  marketCap: 'Mkt Cap', stage: 'Stage', owner: 'Owner', needs: 'Needs', lastContact: 'Last contact',
};

const fmtUsd = (n: number | null | undefined): string => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + 'M';
  if (abs >= 1_000) return '$' + (n / 1_000).toFixed(abs >= 100_000 ? 0 : 1) + 'K';
  return '$' + Math.round(n).toLocaleString();
};
const fmtDate = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString() : 'never');
// Which columns are numeric (right-aligned in the table).
const NUMERIC_COLS = new Set<ReportColumn>(['score', 'vol24h', 'marketCap']);

// ── query_table (the flexible workhorse) ─────────────────────────────────────
async function renderQueryTable(s: Extract<ReportSection, { kind: 'query_table' }>): Promise<string> {
  const sortBy: SortField = (SORT_FIELDS as readonly string[]).includes(s.sortBy as string) ? (s.sortBy as SortField) : 'score';
  const direction = s.direction === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(s.limit ?? 10, 1), 25);
  const columns: ReportColumn[] = (Array.isArray(s.columns) && s.columns.length)
    ? s.columns.filter((c) => (REPORT_COLUMNS as readonly string[]).includes(c))
    : ['project', 'score'];

  const stageFilter = Array.isArray(s.stageFilter)
    ? s.stageFilter.map((x) => LABEL_TO_STAGE[String(x).toLowerCase()] || String(x).toUpperCase()).filter((x) => x in STAGE_LABEL)
    : undefined;

  // Pull a working set with token + latest activity, then sort/limit in code
  // (sort fields like vol24h/lastContact live in relations).
  const rows = await prisma.submission.findMany({
    where: {
      ...(stageFilter && stageFilter.length ? { stage: { in: stageFilter as any } } : {}),
      ...(s.onlyWithToken ? { tokenMatch: { isNot: null } } : {}),
    },
    select: {
      project: true, score: true, stage: true, owner: true, needsHelp: true,
      tokenMatch: { select: { token: true, vol24h: true, marketCapUsd: true } },
      activities: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  const enriched = rows.map((r: any) => ({
    project: r.project,
    ticker: r.tokenMatch?.token ? `$${String(r.tokenMatch.token).toUpperCase()}` : '—',
    score: r.score ?? 0,
    vol24h: r.tokenMatch?.vol24h ?? null,
    marketCap: r.tokenMatch?.marketCapUsd ?? null,
    stage: STAGE_LABEL[r.stage] ?? r.stage,
    owner: r.owner || 'unassigned',
    needs: (r.needsHelp || []).slice(0, 2).join(', ') || '—',
    lastContact: r.activities?.[0]?.createdAt ?? null,
  }));

  const sortVal = (e: any): number => {
    if (sortBy === 'score') return e.score ?? 0;
    if (sortBy === 'vol24h') return e.vol24h ?? -1;
    if (sortBy === 'marketCap') return e.marketCap ?? -1;
    if (sortBy === 'lastContact') return e.lastContact ? new Date(e.lastContact).getTime() : 0;
    return 0;
  };
  enriched.sort((a: any, b: any) => (direction === 'asc' ? sortVal(a) - sortVal(b) : sortVal(b) - sortVal(a)));
  const top = enriched.slice(0, limit);

  if (!top.length) return `*${s.title || 'Results'}*\n_No matching projects._`;

  // Render as a monospace table (Slack code block keeps columns aligned).
  const cell = (e: any, c: ReportColumn): string => {
    switch (c) {
      case 'project': return e.project;
      case 'ticker': return e.ticker;
      case 'score': return String(e.score);
      case 'vol24h': return fmtUsd(e.vol24h);
      case 'marketCap': return fmtUsd(e.marketCap);
      case 'stage': return e.stage;
      case 'owner': return e.owner;
      case 'needs': return e.needs;
      case 'lastContact': return fmtDate(e.lastContact);
    }
  };
  // Column widths (content + header), with a leading rank column.
  const dataWidths = columns.map((c) => Math.max(COL_HEADER[c].length, ...top.map((e: any) => cell(e, c).length)));
  const rankWidth = Math.max(1, String(top.length).length) + 1; // "1." → width 2+
  const padL = (str: string, w: number) => str.padEnd(w);   // left-align (text)
  const padR = (str: string, w: number) => str.padStart(w); // right-align (numbers)
  const padCol = (val: string, c: ReportColumn, w: number) => (NUMERIC_COLS.has(c) ? padR(val, w) : padL(val, w));

  const headerRow = padL('#', rankWidth) + '  ' + columns.map((c, i) => (NUMERIC_COLS.has(c) ? padR(COL_HEADER[c], dataWidths[i]) : padL(COL_HEADER[c], dataWidths[i]))).join('  ');
  const underline = '─'.repeat(headerRow.length);
  const bodyRows = top.map((e: any, idx: number) =>
    padL(`${idx + 1}.`, rankWidth) + '  ' + columns.map((c, i) => padCol(cell(e, c), c, dataWidths[i])).join('  '),
  );
  const table = '```\n' + [headerRow, underline, ...bodyRows].join('\n') + '\n```';
  return `*${s.title || 'Results'}*\n${table}`;
}

// ── Named shortcut sections ──────────────────────────────────────────────────
async function renderTopCandidates(limit = 5): Promise<string> {
  return renderQueryTable({
    kind: 'query_table', title: 'Top reach-out candidates', sortBy: 'score', limit,
    columns: ['project', 'score', 'stage', 'owner', 'needs'], stageFilter: ['New', 'Reviewing'],
  });
}
async function renderTeamWorkload(): Promise<string> {
  const rows = await prisma.submission.findMany({ where: { stage: { notIn: ['WON', 'PASSED'] } }, select: { owner: true } });
  const counts = new Map<string, number>();
  for (const r of rows) { const k = r.owner || 'Unassigned'; counts.set(k, (counts.get(k) ?? 0) + 1); }
  if (!counts.size) return '*Team workload*\n_No active projects._';
  const sorted = [...counts.entries()].sort((a: [string, number], b: [string, number]) => b[1] - a[1]);
  return `*Team workload* (active projects)\n${sorted.map(([o, n]) => `• ${o}: ${n}`).join('\n')}`;
}
async function renderPipelineSummary(): Promise<string> {
  const rows = await prisma.submission.groupBy({ by: ['stage'], _count: { _all: true } });
  const byStage = new Map(rows.map((r: any) => [r.stage, r._count._all]));
  const order = ['NEW', 'REVIEWING', 'CONTACTED', 'IN_CONVO', 'ONBOARDING', 'WON', 'PASSED'];
  const total = rows.reduce((acc: number, r: any) => acc + r._count._all, 0);
  const lines = order.filter((st) => byStage.has(st)).map((st) => `• ${STAGE_LABEL[st]}: ${byStage.get(st)}`);
  return `*Pipeline* (${total} total)\n${lines.join('\n')}`;
}
async function renderNewThisWeek(): Promise<string> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const rows = await prisma.submission.findMany({
    where: { createdAt: { gte: since } }, orderBy: { score: 'desc' }, take: 10,
    select: { project: true, score: true },
  });
  if (!rows.length) return '*New this week*\n_No new projects in the last 7 days._';
  return `*New this week* (${rows.length})\n${rows.map((r: any) => `• *${r.project}* — score ${r.score}`).join('\n')}`;
}

async function renderSection(s: ReportSection): Promise<string> {
  switch (s.kind) {
    case 'query_table': return renderQueryTable(s);
    case 'top_candidates': return renderTopCandidates(s.limit);
    case 'team_workload': return renderTeamWorkload();
    case 'pipeline_summary': return renderPipelineSummary();
    case 'new_this_week': return renderNewThisWeek();
    default: return '';
  }
}

export function validateReportSpec(raw: any): ReportSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Report';
  const sections: ReportSection[] = Array.isArray(raw.sections)
    ? raw.sections.filter((s: any) => s && (REPORT_SECTION_KINDS as readonly string[]).includes(s.kind))
        .map((s: any) => {
          if (s.kind === 'query_table') {
            return {
              kind: 'query_table',
              title: typeof s.title === 'string' ? s.title : undefined,
              sortBy: s.sortBy, direction: s.direction === 'asc' ? 'asc' : 'desc',
              limit: Number(s.limit) || 10,
              columns: Array.isArray(s.columns) ? s.columns : undefined,
              stageFilter: Array.isArray(s.stageFilter) ? s.stageFilter : undefined,
              onlyWithToken: !!s.onlyWithToken,
            } as ReportSection;
          }
          if (s.kind === 'top_candidates') return { kind: 'top_candidates', limit: Number(s.limit) || 5 };
          return { kind: s.kind };
        })
    : [];
  if (!sections.length) return null;
  return { title, sections };
}

export async function renderReport(spec: ReportSpec): Promise<any[]> {
  const parts: string[] = [];
  for (const section of spec.sections) {
    const txt = await renderSection(section);
    if (txt) parts.push(txt);
  }
  const body = parts.join('\n\n') || '_No data to report._';
  return reportBlocks(spec.title, body);
}
