import { NextResponse } from 'next/server';
import { getSession, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/access';
import { FlowError, loadProgram, type Program } from '@/lib/betaFlow';
import { prisma } from '@/lib/prisma';

type Ok<T> = { session: SessionUser } & T;
type Err = { error: NextResponse };

/** The signed-in team member, if they hold `cap` (triage needs tasks.use; settings need beta.manage). */
export async function staff(cap: Capability = 'tasks.use'): Promise<Ok<{}> | Err> {
  const session = await getSession();
  if (!session || !can(session.role, cap)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}

/**
 * Who can see a beta program (its testers, reports, messages, payouts, calls, files, export and Notion
 * settings): admins, members of the program's team or bug team, and its lead, sender and creator.
 */
export async function canSeeProgram(session: SessionUser, p: { teamId: string | null; bugTeamId: string | null; leadId: string | null; senderId: string | null; createdById: string | null }) {
  if (session.role === 'ADMIN') return true;
  if ([p.leadId, p.senderId, p.createdById].includes(session.id)) return true;
  const teams = [p.teamId, p.bugTeamId].filter((x): x is string => !!x);
  if (!teams.length) return false;
  return (await prisma.teamMember.count({ where: { userId: session.id, teamId: { in: teams } } })) > 0;
}

/** The programs this person can see, as a filter (null = all, for admins). */
export async function visibleProgramFilter(session: SessionUser) {
  if (session.role === 'ADMIN') return null;
  const teamIds = (await prisma.teamMember.findMany({ where: { userId: session.id }, select: { teamId: true } })).map((t) => t.teamId);
  return {
    OR: [
      { leadId: session.id }, { senderId: session.id }, { createdById: session.id },
      ...(teamIds.length ? [{ teamId: { in: teamIds } }, { bugTeamId: { in: teamIds } }] : []),
    ],
  };
}

const noAccess = () => ({ error: NextResponse.json({ error: 'You don’t have access to this beta program. Ask an admin, or someone on its team, to add you to the team.', reason: 'no_access' }, { status: 403 }) });

/** staff() plus the program in the route, if this person may see it. */
export async function staffProgram(id: string, cap: Capability = 'tasks.use'): Promise<Ok<{ p: Program }> | Err> {
  const s = await staff(cap);
  if ('error' in s) return s;
  const p = await loadProgram(id);
  if (!p) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  if (!(await canSeeProgram(s.session, p))) return noAccess();
  return { session: s.session, p };
}

type RecordKind = 'report' | 'tester' | 'outreach' | 'payout' | 'call' | 'attachment';
/** staffProgram() for a route keyed by one of the program's records. */
export async function staffRecord(kind: RecordKind, id: string, cap: Capability = 'tasks.use'): Promise<Ok<{ p: Program }> | Err> {
  const s = await staff(cap);
  if ('error' in s) return s;
  const where = { where: { id }, select: { programId: true } } as const;
  const programId =
    kind === 'report' ? (await prisma.testerReport.findUnique(where))?.programId
    : kind === 'tester' ? (await prisma.tester.findUnique(where))?.programId
    : kind === 'outreach' ? (await prisma.betaOutreach.findUnique(where))?.programId
    : kind === 'payout' ? (await prisma.betaPayout.findUnique(where))?.programId
    : kind === 'call' ? (await prisma.betaCall.findUnique(where))?.programId
    : (await prisma.testerAttachment.findUnique({ where: { id }, select: { report: { select: { programId: true } } } }))?.report.programId;
  if (!programId) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  return staffProgram(programId, cap);
}

/** Run a workflow step; its FlowErrors become their status, anything else a logged 500. */
export async function run<T>(fn: () => Promise<T>, status = 200) {
  try {
    return NextResponse.json(await fn(), { status });
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[beta]', e);
    return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
  }
}

export const body = (req: Request) => req.json().catch(() => ({})) as Promise<any>;
