/**
 * How a beta program's work moves, matching the team's Notion dashboard and tightening it:
 *
 *  Reports  New → Triaged → Escalated → Fix in Review → Fix Live → Retest Needed → Verified
 *           (or Duplicate / Already Known / Won't Fix; non-bugs: New → Noted / Passed On / Shipped).
 *           "Waiting on" follows the status (lead for new and fix-live, the sender for retests).
 *           The team sets the official severity; the tester's own is kept as "claimed".
 *  Tasks    each report's task follows its status, and moving the task on the board moves the report.
 *  Outreach anyone suggests a message to a tester; the program's lead (or an admin) approves; the
 *           sender sends it on the tester's channel and logs the answer; the requester closes it.
 *           Escalating a bug or putting its fix live suggests the message for every affected tester.
 *  Retests  "Retest passed" verifies the bug; "Retest failed" escalates it again. Testers can also
 *           answer the retest themselves on their page.
 */
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/access';
import { notify } from '@/lib/notify';
import { updateTask, type Actor as TaskActor } from '@/lib/tasks';
import {
  BUG_OPEN, CHANNELS, DEVICES, ENVIRONMENTS, effectiveSeverity, isOpen, KINDS, LABEL, OUTCOMES, OUTREACH_OPEN, OUTREACH_TYPES,
  PAYOUT_REASONS, priorityFor, SEND_FUNDS, SEVERITY, STAGES, statusesFor, TESTER_TYPES, TESTING_STAGES, USAGE, values,
} from '@/lib/betaModel';

export interface Actor extends TaskActor { role?: string }
export class FlowError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (m: string, status = 400): never => { throw new FlowError(m, status); };

const DAY = 86_400_000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);
const str = (v: unknown, n = 4000) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) || null : null);
const oneOf = (v: unknown, opts: readonly (readonly [string, string])[], field: string) => {
  if (v === null || v === '' || v === undefined) return null;
  return values(opts).includes(String(v)) ? String(v) : fail(`Unknown ${field}: ${v}`);
};
const manyOf = (v: unknown, opts: readonly (readonly [string, string])[]) =>
  Array.isArray(v) ? [...new Set(v.map(String).filter((x) => values(opts).includes(x)))] : [];
const date = (v: unknown, field: string) => {
  if (v === null || v === '' || v === undefined) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? fail(`${field} isn’t a date.`) : d;
};
const link = (v: unknown, field: string) => {
  const s = str(v, 500);
  if (!s) return null;
  return /^https:\/\//.test(s) ? s : fail(`${field} must be an https:// link.`);
};
const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');

export type Program = NonNullable<Awaited<ReturnType<typeof loadProgram>>>;
export const loadProgram = (id: string) => prisma.betaProgram.findUnique({ where: { id } });
export const isLead = (p: { leadId: string | null }, a: Actor) => !!p.leadId && p.leadId === a.id;
export const isSender = (p: { senderId: string | null }, a: Actor) => !!p.senderId && p.senderId === a.id;
/** Approving outreach: the lead, an admin, or (no lead set) anyone who runs beta programs. */
export const canApprove = (p: { leadId: string | null }, a: Actor) =>
  isLead(p, a) || a.role === 'ADMIN' || (!p.leadId && !!a.role && can(a.role as any, 'beta.manage'));

async function tell(userId: string | null | undefined, actor: Actor, title: string, url: string, body?: string) {
  if (userId) await notify({ userIds: [userId], actorId: actor.id, kind: 'beta.waiting', title, body: body ?? null, url });
}

// ───────── testers ─────────

const testerFields = (b: any, p: { testAreas: string[] }) => {
  const d: Record<string, unknown> = {};
  if (b.name !== undefined) d.name = str(b.name, 80) ?? fail('Give the tester a name.');
  if (b.email !== undefined) {
    const e = str(b.email, 200)?.toLowerCase() ?? null;
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('That email doesn’t look right.');
    d.email = e;
  }
  if (b.stage !== undefined) d.stage = oneOf(b.stage, STAGES, 'stage') ?? 'invited';
  if (b.types !== undefined) d.types = manyOf(b.types, TESTER_TYPES);
  if (b.usage !== undefined) d.usage = oneOf(b.usage, USAGE, 'usage') ?? 'unknown';
  if (b.sendFunds !== undefined) d.sendFunds = oneOf(b.sendFunds, SEND_FUNDS, 'funds choice') ?? 'not_asked';
  if (b.channel !== undefined) d.channel = oneOf(b.channel, CHANNELS, 'channel');
  if (b.handle !== undefined) d.handle = str(b.handle, 120);
  if (b.walletAddress !== undefined) d.walletAddress = str(b.walletAddress, 120);
  if (b.testAreas !== undefined) d.testAreas = Array.isArray(b.testAreas) ? [...new Set(b.testAreas.map(String).filter((x: string) => p.testAreas.includes(x)))] : [];
  if (b.wave !== undefined) d.wave = str(b.wave, 60);
  if (b.notes !== undefined) d.notes = str(b.notes, 4000);
  if (b.platform !== undefined) d.platform = str(b.platform, 120);
  return d;
};

/** The team adds someone (they start as Invited unless a stage is given). Email is optional. */
export async function addTester(p: Program, b: any) {
  const d = testerFields({ stage: 'invited', ...b }, p);
  if (!d.name) fail('Give the tester a name.');
  const clash = await prisma.tester.findFirst({ where: { programId: p.id, OR: [{ name: { equals: d.name as string, mode: 'insensitive' } }, ...(d.email ? [{ email: d.email as string }] : [])] } });
  if (clash) fail(`${clash.name} is already in this program.`, 409);
  const { token, hashToken } = await import('@/lib/beta');
  return prisma.tester.create({ data: { ...(d as any), programId: p.id, accessHash: hashToken(token()), invitedAt: new Date() } });
}

export async function updateTester(p: Program, id: string, b: any) {
  const t = await prisma.tester.findFirst({ where: { id, programId: p.id } });
  if (!t) fail('not found', 404);
  const d = testerFields(b, p);
  if (b.checkIn) d.lastCheckInAt = new Date();
  if (b.stage === 'invited' && !t!.invitedAt) d.invitedAt = new Date();
  if (d.email && d.email !== t!.email && (await prisma.tester.findFirst({ where: { programId: p.id, email: d.email as string, NOT: { id } } }))) fail('Another tester has that email.', 409);
  return prisma.tester.update({ where: { id }, data: d as any });
}

// ───────── reports ─────────

/** Who a report waits on after a status change. */
export function waitingOnAfter(p: Program, kind: string, status: string, current: string | null) {
  if (!isOpen(kind, status)) return null;
  if (kind !== 'bug') return p.leadId;
  if (['new', 'triaged', 'fix_live'].includes(status)) return p.leadId;
  if (status === 'retest_needed') return p.senderId ?? p.leadId;
  return current && current !== p.senderId ? current : p.leadId;
}

const TASK_FOR: Record<string, 'TODO' | 'IN_PROGRESS' | 'DONE'> = {
  new: 'TODO', triaged: 'TODO', escalated: 'IN_PROGRESS', fix_in_review: 'IN_PROGRESS',
  fix_live: 'DONE', retest_needed: 'DONE', verified: 'DONE', duplicate: 'DONE', already_known: 'DONE', wont_fix: 'DONE',
  noted: 'DONE', passed_on: 'DONE', shipped: 'DONE', answered: 'DONE',
};

/** Fields the team can change on a report (triage). */
async function reportPatch(p: Program, r: { id: string; kind: string; status: string }, b: any) {
  const d: Record<string, unknown> = {};
  const kind = b.kind !== undefined ? oneOf(b.kind, KINDS, 'kind') ?? r.kind : r.kind;
  if (kind !== r.kind) d.kind = kind;
  for (const k of ['title'] as const) if (b[k] !== undefined) d[k] = str(b[k], 200) ?? fail('A report needs a title.');
  if (b.body !== undefined) d.body = str(b.body, 10_000) ?? fail('A report needs a description.');
  for (const [k, n] of [['steps', 4000], ['expected', 2000], ['actual', 2000], ['browser', 120], ['tokenContract', 200], ['txHash', 200], ['wallet', 120], ['plainTicket', 60], ['fixPr', 500], ['nextStep', 2000], ['platform', 120], ['pageUrl', 500]] as const) {
    if (b[k] !== undefined) d[k] = str(b[k], n);
  }
  if (b.severity !== undefined) d.severity = oneOf(b.severity, SEVERITY, 'severity');
  if (b.claimedSeverity !== undefined) d.claimedSeverity = oneOf(b.claimedSeverity, SEVERITY, 'severity');
  if (b.device !== undefined) d.device = oneOf(b.device, DEVICES, 'device');
  if (b.environment !== undefined) d.environment = oneOf(b.environment, ENVIRONMENTS, 'environment');
  if (b.testArea !== undefined) d.testArea = b.testArea ? (p.testAreas.includes(String(b.testArea)) ? String(b.testArea) : fail('Unknown test area.')) : null;
  if (b.occurredAt !== undefined) d.occurredAt = date(b.occurredAt, 'Occurred at');
  if (b.nextActionDue !== undefined) d.nextActionDue = date(b.nextActionDue, 'Next action due');
  if (b.trackedIn !== undefined) d.trackedIn = link(b.trackedIn, 'Tracked in');
  if (b.waitingOnId !== undefined) d.waitingOnId = b.waitingOnId ? String(b.waitingOnId) : null;
  if (b.callId !== undefined) {
    d.callId = b.callId ? ((await prisma.betaCall.findFirst({ where: { id: String(b.callId), programId: p.id } })) ? String(b.callId) : fail('Unknown call.')) : null;
  }
  if (b.duplicateOfId !== undefined) {
    if (!b.duplicateOfId) d.duplicateOfId = null;
    else {
      const target = await prisma.testerReport.findFirst({ where: { id: String(b.duplicateOfId), programId: p.id } });
      if (!target || target.id === r.id) fail('Pick another report in this program.');
      if (target!.duplicateOfId) fail('That report is itself a duplicate — link to the original.');
      d.duplicateOfId = target!.id;
      if (b.status === undefined) d.status = 'duplicate';
    }
  }
  if (b.status !== undefined) d.status = values(statusesFor(kind)).includes(String(b.status)) ? String(b.status) : fail('That status doesn’t apply to this kind of report.');
  else if (d.kind && !values(statusesFor(kind)).includes(r.status)) d.status = 'new';
  return d;
}

/** Triage a report. Status changes move "waiting on", the task, and suggest outreach. */
export async function updateReport(actor: Actor, id: string, b: any, opts: { fromTask?: boolean; quiet?: boolean } = {}) {
  const before = await prisma.testerReport.findUnique({ where: { id } });
  if (!before) fail('not found', 404);
  const p = (await loadProgram(before!.programId))!;
  const d = await reportPatch(p, before!, b);
  const kind = (d.kind as string) ?? before!.kind;
  const status = (d.status as string) ?? before!.status;
  if (status !== before!.status && b.waitingOnId === undefined) d.waitingOnId = waitingOnAfter(p, kind, status, before!.waitingOnId);
  if (before!.status === 'duplicate' && status !== 'duplicate' && b.duplicateOfId === undefined) d.duplicateOfId = null;
  const r = await prisma.testerReport.update({ where: { id }, data: d as any, include: { tester: true } });

  if (r.taskId && !opts.fromTask) {
    const task = await prisma.task.findUnique({ where: { id: r.taskId } });
    const want = TASK_FOR[r.status];
    const sev = effectiveSeverity(r);
    const patch: Record<string, unknown> = {};
    if (task && want && task.status !== want && !(task.status === 'BLOCKED' && want === 'IN_PROGRESS')) patch.status = want;
    if (task && priorityFor(r.kind, sev) !== task.priority) patch.priority = priorityFor(r.kind, sev);
    if (Object.keys(patch).length) await updateTask(actor, r.taskId, patch as any, { fromReport: true });
  }
  if (opts.quiet) return r; // importing from Notion: no alerts or suggested messages for old history
  if (r.waitingOnId && r.waitingOnId !== before!.waitingOnId) {
    await tell(r.waitingOnId, actor, `Waiting on you: ${r.title}`, `/beta/${p.id}?report=${r.id}`, `${LABEL.kind[r.kind]} · ${LABEL.status[r.status]}`);
  }
  if (r.kind === 'bug' && r.status !== before!.status && (r.status === 'escalated' || r.status === 'fix_live')) {
    await suggestForReport(actor, p, r.id, r.status === 'escalated' ? 'bug_logged' : 'fix_live_retest');
  }
  return r;
}

/** A report's task moved on the board: move the report to match. */
export async function onReportTaskMoved(actor: Actor, taskId: string, from: string, to: string) {
  const r = await prisma.testerReport.findUnique({ where: { taskId } });
  if (!r) return;
  let status: string | null = null;
  if (to === 'DONE' && from !== 'DONE') {
    if (r.kind === 'bug') status = ['new', 'triaged', 'escalated', 'fix_in_review'].includes(r.status) ? 'fix_live' : null;
    else status = r.status === 'new' ? (r.kind === 'question' ? 'answered' : 'noted') : null;
  } else if (from === 'DONE' && to !== 'DONE') {
    if (r.kind === 'bug') status = ['fix_live', 'retest_needed', 'verified'].includes(r.status) ? 'escalated' : null;
    else status = r.status !== 'new' ? 'new' : null;
  } else if (to === 'IN_PROGRESS' && r.kind === 'bug' && ['new', 'triaged'].includes(r.status)) status = 'escalated';
  if (status) await updateReport(actor, r.id, { status }, { fromTask: true });
}

// ───────── outreach ─────────

const firstName = (n: string) => n.split(/\s+/)[0] || n;
const TEMPLATES: Record<string, (tester: string, title: string) => { title: string; message: string }> = {
  bug_logged: (t, title) => ({
    title: `Tell ${t} their bug is logged`,
    message: `Hi ${firstName(t)}! Thanks for reporting “${title}”. We've reproduced it and the team is on it — we'll let you know as soon as a fix is live.`,
  }),
  fix_live_retest: (t, title) => ({
    title: `Ask ${t} to retest`,
    message: `Hi ${firstName(t)}! A fix for “${title}” is live now. Could you try it again and tell us whether it works?`,
  }),
};

/** Suggest the bug-logged / retest message to the reporter and everyone whose report duplicates it. */
export async function suggestForReport(actor: Actor, p: Program, reportId: string, type: 'bug_logged' | 'fix_live_retest') {
  const r = await prisma.testerReport.findUnique({ where: { id: reportId }, include: { tester: true, duplicates: { include: { tester: true } } } });
  if (!r) return 0;
  const testers = new Map([[r.tester.id, r.tester], ...r.duplicates.map((x) => [x.tester.id, x.tester] as const)]);
  let made = 0;
  for (const t of testers.values()) {
    if (t.status !== 'active') continue;
    const exists = await prisma.betaOutreach.findFirst({ where: { testerId: t.id, reportId: r.id, type, status: { not: 'cancelled' } } });
    if (exists) continue;
    await createOutreach(actor, p, { testerId: t.id, reportId: r.id, type, ...TEMPLATES[type](t.name, r.title), auto: true });
    made++;
  }
  return made;
}

export async function createOutreach(actor: Actor, p: Program, b: any) {
  const tester = await prisma.tester.findFirst({ where: { id: String(b.testerId ?? ''), programId: p.id } });
  if (!tester) fail('Pick a tester in this program.');
  const reportId = b.reportId ? ((await prisma.testerReport.findFirst({ where: { id: String(b.reportId), programId: p.id } }))?.id ?? fail('Unknown report.')) : null;
  const title = str(b.title, 200) ?? fail('Say what we need from them.');
  // The lead's and the sender's own requests skip approval.
  const trusted = isLead(p, actor) || isSender(p, actor) || (b.auto && isLead(p, actor));
  const o = await prisma.betaOutreach.create({
    data: {
      programId: p.id, testerId: tester!.id, reportId, title,
      type: oneOf(b.type, OUTREACH_TYPES, 'type') ?? 'need_info',
      message: str(b.message, 4000), nextActionDue: date(b.nextActionDue, 'Send by'),
      callId: b.callId ? String(b.callId) : null, auto: !!b.auto,
      requestedById: actor.id === 'system' ? null : actor.id,
      status: trusted ? 'approved' : 'suggested',
      approvedById: trusted ? actor.id : null,
      waitingOnId: trusted ? p.senderId ?? p.leadId : p.leadId,
    },
  });
  const url = `/beta/${p.id}?tab=outreach&o=${o.id}`;
  if (o.status === 'suggested') await tell(o.waitingOnId, actor, `Approve a message to ${tester!.name}?`, url, o.title);
  else await tell(o.waitingOnId, actor, `Send to ${tester!.name}: ${o.title}`, url, tester!.channel ? `on ${LABEL.channel[tester!.channel]}` : undefined);
  return o;
}

/** approve | sent | nudged | answer | close | no_reply | cancel | edit */
export async function outreachAction(actor: Actor, id: string, action: string, b: any = {}) {
  const o = await prisma.betaOutreach.findUnique({ where: { id }, include: { tester: true, report: true } });
  if (!o) fail('not found', 404);
  const p = (await loadProgram(o!.programId))!;
  const open = OUTREACH_OPEN.includes(o!.status);
  const url = `/beta/${p.id}?tab=outreach&o=${id}`;
  const need = (ok: boolean, msg: string) => { if (!ok) fail(msg, 409); };
  let d: Record<string, unknown> = {};
  switch (action) {
    case 'approve':
      need(o!.status === 'suggested', 'Only suggested messages need approval.');
      if (!canApprove(p, actor)) fail('Only the program’s lead (or an admin) approves outreach.', 403);
      d = { status: 'approved', approvedById: actor.id, waitingOnId: p.senderId ?? p.leadId, ...(b.message !== undefined ? { message: str(b.message, 4000) } : {}) };
      break;
    case 'edit':
      need(open, 'This one is closed.');
      d = { ...(b.message !== undefined ? { message: str(b.message, 4000) } : {}), ...(b.title !== undefined ? { title: str(b.title, 200) ?? fail('Say what we need.') } : {}), ...(b.nextActionDue !== undefined ? { nextActionDue: date(b.nextActionDue, 'Send by') } : {}) };
      break;
    case 'sent':
      need(o!.status === 'approved', 'Approve it before sending.');
      d = { status: 'sent', sentAt: new Date(), nextActionDue: daysFromNow(3), waitingOnId: p.senderId ?? actor.id };
      break;
    case 'nudged':
      need(o!.status === 'sent', 'Only sent messages can be nudged.');
      d = { nextActionDue: daysFromNow(3) };
      break;
    case 'answer':
      need(['sent', 'approved'].includes(o!.status), 'Mark it sent first.');
      d = { status: 'answered', answer: str(b.answer, 4000) ?? fail('Paste what they said.'), answeredAt: new Date(), waitingOnId: o!.requestedById ?? p.leadId, nextActionDue: daysFromNow(2), sentAt: o!.sentAt ?? new Date() };
      break;
    case 'close':
    case 'no_reply': {
      need(open, 'This one is already closed.');
      const outcome = action === 'no_reply' ? 'no_reply' : oneOf(b.outcome, OUTCOMES, 'outcome') ?? fail('Pick an outcome.');
      d = { status: 'closed', outcome, waitingOnId: null, nextActionDue: null };
      break;
    }
    case 'cancel':
      need(open, 'This one is already closed.');
      d = { status: 'cancelled', waitingOnId: null, nextActionDue: null };
      break;
    default:
      fail('Unknown action.');
  }
  const after = await prisma.betaOutreach.update({ where: { id }, data: d as any });

  // Knock-on effects on the report.
  if (action === 'sent' && o!.type === 'fix_live_retest' && o!.report?.status === 'fix_live') {
    await updateReport(actor, o!.report.id, { status: 'retest_needed' });
  }
  if (after.outcome === 'retest_passed' && o!.report && o!.report.kind === 'bug') {
    await updateReport(actor, o!.report.id, { status: 'verified', waitingOnId: null });
  }
  if (after.outcome === 'retest_failed' && o!.report) {
    await updateReport(actor, o!.report.id, {
      status: o!.report.kind === 'bug' ? 'escalated' : 'new', waitingOnId: p.leadId,
      nextStep: `Retest failed (${new Date().toISOString().slice(0, 10)})${after.answer ? `: ${after.answer.slice(0, 300)}` : ''}`,
    });
  }
  if (after.waitingOnId && after.waitingOnId !== o!.waitingOnId) {
    const title = after.status === 'approved' ? `Send to ${o!.tester.name}: ${after.title}` : after.status === 'answered' ? `${o!.tester.name} answered: ${after.title}` : `Waiting on you: ${after.title}`;
    await tell(after.waitingOnId, actor, title, url, after.answer?.slice(0, 140));
  }
  return after;
}

/** The tester answered a retest on their own page. */
export async function testerRetest(testerId: string, reportId: string, works: boolean, note: string | null) {
  const r = await prisma.testerReport.findFirst({ where: { id: reportId, testerId } });
  if (!r || r.kind !== 'bug' || !['fix_live', 'retest_needed'].includes(r.status)) fail('This report isn’t waiting on a retest.', 409);
  const tester = await prisma.tester.findUnique({ where: { id: testerId } });
  const actor: Actor = { id: 'system', name: `${tester?.name ?? 'The tester'} (beta tester)` };
  const answer = `${works ? 'Works now' : 'Still broken'}${note ? ` — ${note}` : ''}`;
  await prisma.testerReply.create({ data: { reportId, authorType: 'tester', testerId, body: `Retest: ${answer}` } });
  // Close any open retest outreach with their answer; then move the bug.
  const open = await prisma.betaOutreach.findMany({ where: { reportId, testerId, type: 'fix_live_retest', status: { in: OUTREACH_OPEN } } });
  for (const o of open) await prisma.betaOutreach.update({ where: { id: o.id }, data: { status: 'closed', outcome: works ? 'retest_passed' : 'retest_failed', answer, answeredAt: new Date(), waitingOnId: null, nextActionDue: null } });
  const p = (await loadProgram(r!.programId))!;
  if (works) await updateReport(actor, reportId, { status: 'verified', waitingOnId: null });
  else await updateReport(actor, reportId, { status: 'escalated', waitingOnId: p.leadId, nextStep: `Retest failed (tester, ${new Date().toISOString().slice(0, 10)})${note ? `: ${note.slice(0, 300)}` : ''}` });
}

// ───────── payouts ─────────

export async function logPayout(actor: Actor, p: Program, b: any) {
  const tester = await prisma.tester.findFirst({ where: { id: String(b.testerId ?? ''), programId: p.id } });
  if (!tester) fail('Pick a tester in this program.');
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) fail('Enter the amount sent.');
  const reportId = b.reportId ? ((await prisma.testerReport.findFirst({ where: { id: String(b.reportId), programId: p.id } }))?.id ?? fail('Unknown report.')) : null;
  return prisma.betaPayout.create({
    data: {
      programId: p.id, testerId: tester!.id, reportId, amount: Math.round(amount * 1e6) / 1e6,
      token: str(b.token, 20) ?? 'USDC', reason: oneOf(b.reason, PAYOUT_REASONS, 'reason') ?? 'bug_reward',
      tx: str(b.tx, 300), notes: str(b.notes, 2000), sentAt: date(b.sentAt, 'Sent on') ?? new Date(), sentById: actor.id === 'system' ? null : actor.id,
    },
  });
}

// ───────── overview ─────────

export async function programOverview(programId: string, userId: string) {
  const [p, testers, reports, outreach, payouts] = await Promise.all([
    loadProgram(programId),
    prisma.tester.findMany({ where: { programId }, select: { id: true, status: true, stage: true, testAreas: true, sendFunds: true, walletAddress: true, lastCheckInAt: true } }),
    prisma.testerReport.findMany({ where: { programId }, select: { id: true, kind: true, status: true, severity: true, claimedSeverity: true, waitingOnId: true, nextActionDue: true } }),
    prisma.betaOutreach.findMany({ where: { programId, status: { in: OUTREACH_OPEN } }, select: { id: true, status: true, nextActionDue: true, waitingOnId: true } }),
    prisma.betaPayout.findMany({ where: { programId }, select: { testerId: true, amount: true, token: true, reason: true } }),
  ]);
  if (!p) return null;
  const now = Date.now();
  const startOfDay = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const active = testers.filter((t) => t.status === 'active');
  const funded = new Set(payouts.filter((x) => x.reason === 'test_funds').map((x) => x.testerId));
  const wantFunds = active.filter((t) => t.sendFunds === 'yes' && !funded.has(t.id));
  const openBugs = reports.filter((r) => r.kind === 'bug' && values(BUG_OPEN).includes(r.status));
  const testing = active.filter((t) => TESTING_STAGES.includes(t.stage));
  const byToken: Record<string, number> = {};
  for (const x of payouts) byToken[x.token] = (byToken[x.token] ?? 0) + x.amount;
  return {
    testers: { total: active.length, testingNow: active.filter((t) => ['onboarding', 'active'].includes(t.stage)).length, staleCheckIns: testing.filter((t) => !t.lastCheckInAt || now - t.lastCheckInAt.getTime() > 5 * DAY).length },
    outreach: {
      toSend: outreach.filter((o) => o.status === 'approved').length,
      awaitingApproval: outreach.filter((o) => o.status === 'suggested').length,
      overdue: outreach.filter((o) => ['approved', 'sent', 'answered'].includes(o.status) && o.nextActionDue && o.nextActionDue.getTime() < startOfDay).length,
    },
    bugs: { open: openBugs.length, urgent: openBugs.filter((r) => ['critical', 'high'].includes(effectiveSeverity(r) ?? '')).length, unreviewed: reports.filter((r) => r.status === 'new').length },
    funds: { waiting: wantFunds.length, missingWallet: wantFunds.filter((t) => !t.walletAddress).length },
    paid: { byToken, testers: new Set(payouts.map((x) => x.testerId)).size },
    coverage: p.testAreas.map((area) => ({ area, testers: testing.filter((t) => t.testAreas.includes(area)).length })),
    waitingOnMe: {
      outreach: outreach.filter((o) => o.waitingOnId === userId).length,
      reports: reports.filter((r) => r.waitingOnId === userId && isOpen(r.kind, r.status)).length,
    },
  };
}

export const reportLink = (programId: string, reportId: string) => `${APP_URL()}/beta/${programId}?report=${reportId}`;
