/**
 * Rows for panels, dashboards and the agent, loaded as the person asking.
 *
 * Every source but the pipeline lives here (the pipeline's rows come from the loaded
 * submissions, or loadChatContext on the server). Beta rows only ever come from programs
 * the viewer can see (lib/betaHttp), artifacts only from what they can open. Rows carry
 * labels, not codes, and no tester emails or wallet addresses.
 */
import { prisma } from '@/lib/prisma';
import { can, type Role } from '@/lib/access';
import { visibleProgramFilter } from '@/lib/betaHttp';
import { listArtifacts } from '@/lib/artifacts';
import { loadChatContext } from '@/lib/chatData';
import { LABEL, effectiveSeverity, isOpen, OUTREACH_OPEN, values, BUG_OPEN } from '@/lib/betaModel';
import { validateSpec, executeSpec, sourceOf, SOURCES, type AnalyticsSpec, type PanelResult } from '@/lib/analyticsSpec';
import type { SessionUser } from '@/lib/auth';
import { artifactTable } from '@/lib/artifactTables';

export interface DataViewer { id: string; role: Role | string; email?: string; name?: string | null }

export class DataError extends Error {
  constructor(public code: 'forbidden' | 'no_access' | 'not_found' | 'invalid', message: string) { super(message); }
}

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const label = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? v : null);
const startOfToday = () => new Date(new Date().toISOString().slice(0, 10)).getTime();

const asSession = (v: DataViewer) => ({ id: v.id, role: v.role, email: v.email ?? '', name: v.name ?? null }) as SessionUser;

/** May this person read beta data at all (the same bar as the beta pages). */
export const canReadBeta = (v: DataViewer) => can(v.role, 'tasks.use');

/** The beta programs this person can see. */
export async function visiblePrograms(v: DataViewer) {
  if (!canReadBeta(v)) return [];
  const filter = await visibleProgramFilter(asSession(v));
  return prisma.betaProgram.findMany({
    where: filter ?? {},
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, product: true, slug: true, status: true, endsAt: true, testAreas: true, leadId: true, senderId: true, createdAt: true },
  });
}

/**
 * A program by id, slug or name ("texting" finds "Texting Beta"), among the ones this person
 * can see. A real program they can't see is no_access, not "not found".
 */
export async function resolveProgram(v: DataViewer, q: string) {
  const needle = String(q ?? '').trim();
  if (!needle) throw new DataError('invalid', 'Which program? Give its name.');
  const mine = await visiblePrograms(v);
  const low = needle.toLowerCase();
  const hit = mine.find((p) => p.id === needle || p.slug === low)
    ?? mine.find((p) => p.name.toLowerCase() === low)
    ?? mine.find((p) => p.name.toLowerCase().includes(low) || (p.product ?? '').toLowerCase().includes(low));
  if (hit) return hit;
  const exists = await prisma.betaProgram.findFirst({
    where: { OR: [{ id: needle }, { slug: low }, { name: { contains: needle, mode: 'insensitive' } }] },
    select: { id: true },
  });
  if (exists) throw new DataError('no_access', 'You don’t have access to that beta program. Ask an admin, or someone on its team, to add you to the team.');
  throw new DataError('not_found', `No beta program matching "${needle}". Programs you can see: ${mine.map((p) => p.name).join(', ') || 'none'}.`);
}

async function userNames(ids: (string | null | undefined)[]) {
  const want = Array.from(new Set(ids.filter((x): x is string => !!x)));
  if (!want.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: want } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

/** The program ids a beta query covers: one (checked) or every visible one. */
async function programScope(v: DataViewer, program?: string) {
  if (!canReadBeta(v)) throw new DataError('forbidden', 'Beta data needs task-board access.');
  if (program) {
    const p = await resolveProgram(v, program);
    return { ids: [p.id], names: new Map([[p.id, p.name]]) };
  }
  const all = await visiblePrograms(v);
  return { ids: all.map((p) => p.id), names: new Map(all.map((p) => [p.id, p.name])) };
}

/** The rows of one source, for this viewer. */
export async function loadRows(source: string, v: DataViewer, opts: { program?: string } = {}): Promise<any[]> {
  const now = Date.now();
  switch (source) {
    case 'submissions': {
      if (!can(v.role, 'devrel.view')) throw new DataError('forbidden', 'Pipeline data needs DevRel access.');
      return loadChatContext();
    }

    case 'beta_reports': {
      const { ids, names } = await programScope(v, opts.program);
      const reports = await prisma.testerReport.findMany({
        where: { programId: { in: ids } },
        select: {
          id: true, programId: true, kind: true, title: true, status: true, severity: true, claimedSeverity: true, testArea: true,
          device: true, environment: true, waitingOnId: true, nextActionDue: true, trackedIn: true, fixPr: true, createdAt: true, updatedAt: true,
          tester: { select: { name: true } }, _count: { select: { replies: true } },
        },
      });
      const who = await userNames(reports.map((r) => r.waitingOnId));
      const today = startOfToday();
      return reports.map((r) => {
        const open = isOpen(r.kind, r.status);
        return {
          id: r.id, program_id: r.programId, program: names.get(r.programId) ?? null, title: r.title,
          kind: label(LABEL.kind, r.kind), status: label(LABEL.status, r.status), open,
          severity: label(LABEL.severity, effectiveSeverity(r)), claimed_severity: label(LABEL.severity, r.claimedSeverity),
          test_area: r.testArea, device: label(LABEL.device, r.device), environment: label(LABEL.environment, r.environment),
          tester: r.tester.name, waiting_on: r.waitingOnId ? who.get(r.waitingOnId) ?? null : null,
          overdue: open && !!r.nextActionDue && r.nextActionDue.getTime() < today,
          tracked: !!r.trackedIn, has_fix_pr: !!r.fixPr, replies: r._count.replies,
          age_days: Math.floor((now - r.createdAt.getTime()) / DAY),
          created_at: iso(r.createdAt), updated_at: iso(r.updatedAt), next_action_due: iso(r.nextActionDue),
        };
      });
    }

    case 'beta_testers': {
      const { ids, names } = await programScope(v, opts.program);
      const testers = await prisma.tester.findMany({
        where: { programId: { in: ids } },
        select: {
          id: true, programId: true, name: true, stage: true, status: true, usage: true, sendFunds: true, channel: true, types: true,
          testAreas: true, wave: true, walletAddress: true, emailVerifiedAt: true, lastCheckInAt: true, lastSeenAt: true, createdAt: true,
          reports: { select: { kind: true, status: true } }, _count: { select: { payouts: true } },
        },
      });
      return testers.map((t) => {
        const bugs = t.reports.filter((r) => r.kind === 'bug');
        return {
          id: t.id, program_id: t.programId, program: names.get(t.programId) ?? null, name: t.name,
          stage: label(LABEL.stage, t.stage), status: t.status === 'removed' ? 'Declined' : 'Active',
          usage: label(LABEL.usage, t.usage), send_funds: label(LABEL.sendFunds, t.sendFunds), channel: label(LABEL.channel, t.channel),
          types: t.types, test_areas: t.testAreas, wave: t.wave,
          reports: t.reports.length, bugs: bugs.length, open_bugs: bugs.filter((r) => values(BUG_OPEN).includes(r.status)).length,
          payouts: t._count.payouts, has_wallet: !!t.walletAddress, email_verified: !!t.emailVerifiedAt,
          days_since_check_in: Math.floor((now - (t.lastCheckInAt ?? t.createdAt).getTime()) / DAY),
          joined_at: iso(t.createdAt), last_check_in: iso(t.lastCheckInAt), last_seen: iso(t.lastSeenAt),
        };
      });
    }

    case 'beta_outreach': {
      const { ids, names } = await programScope(v, opts.program);
      const rows = await prisma.betaOutreach.findMany({
        where: { programId: { in: ids } },
        select: {
          id: true, programId: true, title: true, type: true, status: true, outcome: true, sentVia: true, waitingOnId: true, auto: true,
          createdAt: true, sentAt: true, answeredAt: true, nextActionDue: true, tester: { select: { name: true } },
        },
      });
      const who = await userNames(rows.map((r) => r.waitingOnId));
      const today = startOfToday();
      return rows.map((o) => ({
        id: o.id, program_id: o.programId, program: names.get(o.programId) ?? null, title: o.title,
        type: label(LABEL.outreachType, o.type), status: label(LABEL.outreachStatus, o.status), outcome: label(LABEL.outcome, o.outcome),
        tester: o.tester.name, sent_via: o.sentVia === 'portal' ? 'Beta page' : o.sentVia === 'manual' ? 'By hand' : null,
        waiting_on: o.waitingOnId ? who.get(o.waitingOnId) ?? null : null, auto: o.auto,
        overdue: ['approved', 'sent', 'answered'].includes(o.status) && !!o.nextActionDue && o.nextActionDue.getTime() < today,
        hours_to_answer: o.sentAt && o.answeredAt ? Math.round((o.answeredAt.getTime() - o.sentAt.getTime()) / 36e5 * 10) / 10 : null,
        open: OUTREACH_OPEN.includes(o.status),
        created_at: iso(o.createdAt), sent_at: iso(o.sentAt), answered_at: iso(o.answeredAt), next_action_due: iso(o.nextActionDue),
      }));
    }

    case 'beta_payouts': {
      const { ids, names } = await programScope(v, opts.program);
      const rows = await prisma.betaPayout.findMany({
        where: { programId: { in: ids } },
        select: { id: true, programId: true, amount: true, token: true, reason: true, tx: true, sentAt: true, tester: { select: { name: true } } },
      });
      return rows.map((x) => ({
        id: x.id, program_id: x.programId, program: names.get(x.programId) ?? null, tester: x.tester.name,
        amount: x.amount, token: x.token.toUpperCase(), reason: label(LABEL.reason, x.reason), has_tx: !!x.tx, sent_at: iso(x.sentAt),
      }));
    }

    case 'artifacts': {
      const rows = await listArtifacts(v, { take: 500 });
      return rows.map((a) => ({
        id: a.id, title: a.title, kind: a.kind, owner: a.owner.name || a.owner.email,
        relation: a.relation === 'mine' ? 'Mine' : a.relation === 'shared' ? 'Shared with me' : 'Team',
        team_visible: a.visibility === 'TEAM', tags: a.tags, version: a.currentVersion,
        created_at: iso(a.createdAt), updated_at: iso(a.updatedAt),
      }));
    }
  }
  // artifact_data runs through runSpec, which loads the artifact's table and its fields together.
  throw new DataError('invalid', `Unknown data source ${source}.`);
}

/** Validate a spec, resolve its program (or artifact), and run it as this viewer. */
export async function runSpec(raw: unknown, v: DataViewer): Promise<{ spec: AnalyticsSpec; result: PanelResult; programName?: string; artifactTitle?: string }> {
  if ((raw as any)?.source === 'artifact_data') {
    // An artifact's own table: its fields come from the data, so load it before validating.
    const r = raw as any;
    if (!r.artifact) throw new DataError('invalid', 'artifact_data needs `artifact` (its title or id) and `table` — call inspect_artifact to see its tables.');
    const { artifact, table, source } = await artifactTable(v, r.artifact, r.table);
    const check = validateSpec({ ...r, table: table.name }, source);
    if (!check.ok) throw new DataError('invalid', check.errors.join('; '));
    const spec = { ...check.spec!, artifact: artifact.id, table: table.name };
    return { spec, result: executeSpec(spec, table.rows as any[], source), artifactTitle: artifact.title };
  }
  const check = validateSpec(raw);
  if (!check.ok) throw new DataError('invalid', check.errors.join('; '));
  const spec = check.spec!;
  let programName: string | undefined;
  if (spec.program) {
    const p = await resolveProgram(v, spec.program);
    spec.program = p.id;
    programName = p.name;
  }
  const rows = await loadRows(sourceOf(spec).key, v, { program: spec.program });
  return { spec, result: executeSpec(spec, rows), programName };
}

/** The sources this person can read. */
export function sourcesFor(v: DataViewer) {
  return Object.keys(SOURCES).filter((k) =>
    k === 'submissions' ? can(v.role, 'devrel.view') : k === 'artifacts' || k === 'artifact_data' ? true : canReadBeta(v));
}
