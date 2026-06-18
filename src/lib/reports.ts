import { prisma } from '@/lib/prisma';
import { reportBlocks } from '@/lib/slack';

/**
 * SCHEDULED REPORTS — the hybrid model. The agent translates a user's
 * plain-language request into a structured ReportSpec ONCE (at job creation).
 * The cron then renders that spec DETERMINISTICALLY on every fire — no LLM at
 * run time, so reports are fast, cheap, and reliable.
 *
 * A spec is just a title + an ordered list of sections, each a known block type
 * with simple params. New section types = add a renderer here.
 */

export type ReportSection =
  | { kind: 'top_candidates'; limit?: number }
  | { kind: 'team_workload' }
  | { kind: 'pipeline_summary' }
  | { kind: 'new_this_week' };

export interface ReportSpec {
  title: string;
  sections: ReportSection[];
}

export const REPORT_SECTION_KINDS = ['top_candidates', 'team_workload', 'pipeline_summary', 'new_this_week'] as const;

const STAGE_LABEL: Record<string, string> = {
  NEW: 'New', REVIEWING: 'Reviewing', CONTACTED: 'Contacted',
  IN_CONVO: 'In conversation', ONBOARDING: 'Onboarding', WON: 'Won', PASSED: 'Passed',
};

// ── Section renderers (deterministic; each returns an mrkdwn string) ──────────

/** Top reach-out candidates: high score, early stage, not yet contacted. */
async function renderTopCandidates(limit = 5): Promise<string> {
  const rows = await prisma.submission.findMany({
    where: { stage: { in: ['NEW', 'REVIEWING'] }, lowEffort: false },
    orderBy: { score: 'desc' },
    take: Math.min(Math.max(limit, 1), 15),
    select: { project: true, score: true, stage: true, owner: true, needsHelp: true },
  });
  if (!rows.length) return '*Top reach-out candidates*\n_None right now — pipeline is all engaged._';
  const lines = rows.map((r: any, i: number) => {
    const help = (r.needsHelp || []).slice(0, 2).join(', ');
    const owner = r.owner ? ` · ${r.owner}` : ' · _unassigned_';
    return `${i + 1}. *${r.project}* — score ${r.score} · ${STAGE_LABEL[r.stage] ?? r.stage}${owner}${help ? ` · needs: ${help}` : ''}`;
  });
  return `*Top reach-out candidates*\n${lines.join('\n')}`;
}

/** Team workload: how many active projects each owner has. */
async function renderTeamWorkload(): Promise<string> {
  const rows = await prisma.submission.findMany({
    where: { stage: { notIn: ['WON', 'PASSED'] } },
    select: { owner: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.owner || 'Unassigned';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (!counts.size) return '*Team workload*\n_No active projects._';
  const sorted = [...counts.entries()].sort((a: [string, number], b: [string, number]) => b[1] - a[1]);
  return `*Team workload* (active projects)\n${sorted.map(([o, n]) => `• ${o}: ${n}`).join('\n')}`;
}

/** Pipeline summary: count by stage. */
async function renderPipelineSummary(): Promise<string> {
  const rows = await prisma.submission.groupBy({ by: ['stage'], _count: { _all: true } });
  const byStage = new Map(rows.map((r: any) => [r.stage, r._count._all]));
  const order = ['NEW', 'REVIEWING', 'CONTACTED', 'IN_CONVO', 'ONBOARDING', 'WON', 'PASSED'];
  const total = rows.reduce((acc: number, r: any) => acc + r._count._all, 0);
  const lines = order.filter((st) => byStage.has(st)).map((st) => `• ${STAGE_LABEL[st]}: ${byStage.get(st)}`);
  return `*Pipeline* (${total} total)\n${lines.join('\n')}`;
}

/** New projects in the last 7 days. */
async function renderNewThisWeek(): Promise<string> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const rows = await prisma.submission.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { score: 'desc' },
    take: 10,
    select: { project: true, score: true, source: true },
  });
  if (!rows.length) return '*New this week*\n_No new projects in the last 7 days._';
  return `*New this week* (${rows.length})\n${rows.map((r: any) => `• *${r.project}* — score ${r.score}`).join('\n')}`;
}

async function renderSection(s: ReportSection): Promise<string> {
  switch (s.kind) {
    case 'top_candidates': return renderTopCandidates(s.limit);
    case 'team_workload': return renderTeamWorkload();
    case 'pipeline_summary': return renderPipelineSummary();
    case 'new_this_week': return renderNewThisWeek();
    default: return '';
  }
}

/** Validate a raw spec object into a safe ReportSpec (drops unknown sections). */
export function validateReportSpec(raw: any): ReportSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Report';
  const sections: ReportSection[] = Array.isArray(raw.sections)
    ? raw.sections
        .filter((s: any) => s && REPORT_SECTION_KINDS.includes(s.kind))
        .map((s: any) => (s.kind === 'top_candidates' ? { kind: 'top_candidates', limit: Number(s.limit) || 5 } : { kind: s.kind }))
    : [];
  if (!sections.length) return null;
  return { title, sections };
}

/** Render a full spec into Slack Block Kit blocks. */
export async function renderReport(spec: ReportSpec): Promise<any[]> {
  const parts: string[] = [];
  for (const section of spec.sections) {
    const txt = await renderSection(section);
    if (txt) parts.push(txt);
  }
  const body = parts.join('\n\n') || '_No data to report._';
  return reportBlocks(spec.title, body);
}
