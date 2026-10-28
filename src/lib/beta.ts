/**
 * Beta programs: testers join a launch's program through its link, get a personal portal
 * link (no password, no CRM account), and file reports. Each report becomes a task for the
 * program's team (bugs can go to a separate team), with priority from the bug's severity.
 * Team and tester talk in the report's replies; a tester reply notifies whoever owns it.
 *
 * Optional: TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY put Cloudflare Turnstile on the join form.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { BetaProgram, Tester } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createTask } from '@/lib/tasks';
import { notify, teamMemberIds } from '@/lib/notify';
import { emailConfigured, sendEmail } from '@/lib/email';
import { DEVICES, ENVIRONMENTS, KINDS, LABEL, priorityFor, SEVERITY, TESTER_STATUS, values } from '@/lib/betaModel';

/** A problem the tester can fix; its message is safe to show them. Anything else is a 500. */
export class BetaInputError extends Error {}
export const isInputError = (e: unknown): e is BetaInputError => e instanceof BetaInputError;
const fail = (m: string): never => { throw new BetaInputError(m); };
const str = (v: unknown, n: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, n) : '');

/** What the tester sees for a status. */
export const STATUS_LABEL = TESTER_STATUS;
/** The old three-level severity from earlier portal versions. */
const LEGACY_SEVERITY: Record<string, string> = { blocker: 'critical', major: 'high', minor: 'medium' };

const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const cookieName = (slug: string) => `beta_${slug.replace(/[^a-z0-9-]/g, '')}`;

export function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'beta';
}

export async function uniqueSlug(base: string) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const slug = i ? `${root}-${i + 1}` : root;
    if (!(await prisma.betaProgram.findUnique({ where: { slug } }))) return slug;
  }
  return `${root}-${token(4).toLowerCase()}`;
}

export const joinUrl = (p: { slug: string; joinToken: string }) => `${APP_URL()}/b/${p.slug}?k=${p.joinToken}`;
export const portalUrl = (slug: string, t: string) => `${APP_URL()}/b/${slug}/t/${t}`;

export interface Question { id: string; label: string; required?: boolean }
export function cleanQuestions(q: unknown): Question[] {
  if (!Array.isArray(q)) return [];
  return q.slice(0, 10).map((x: any, i) => ({
    id: String(x?.id || `q${i + 1}`).slice(0, 30),
    label: String(x?.label ?? '').trim().slice(0, 200),
    required: !!x?.required,
  })).filter((x) => x.label);
}

/** Reject settings that would fail in the database: unknown teams, bad dates. Returns the problem, or null. */
export async function checkProgramInput(b: any): Promise<string | null> {
  if (b?.endsAt && Number.isNaN(new Date(b.endsAt).getTime())) return 'That end date isn’t a date.';
  for (const k of ['teamId', 'bugTeamId'] as const) {
    if (b?.[k] && !(await prisma.team.findUnique({ where: { id: String(b[k]) }, select: { id: true } }))) return 'That team doesn’t exist any more — pick another.';
  }
  return null;
}

export function programOpen(p: BetaProgram) {
  return p.status === 'open' && (!p.endsAt || p.endsAt > new Date());
}

// ───────── abuse limits (in the database, so they hold across instances) ─────────

/** Fixed window per key: true once `max` hits land within `windowMs`. Fails open if the DB errors. */
export async function rateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const start = new Date(now.getTime() - windowMs);
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${now}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" < ${start} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" < ${start} THEN ${now} ELSE "RateLimit"."windowStart" END
      RETURNING "count"`;
    if (Math.random() < 0.01) prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } }).catch(() => {});
    return Number(rows[0]?.count ?? 0) > max;
  } catch {
    return false;
  }
}
/**
 * The caller's IP. A client can send its own X-Forwarded-For; the last entry is the one our
 * edge proxy (Railway, or an AWS load balancer) appended, so that's the one to trust.
 */
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',').map((x) => x.trim()).filter(Boolean).pop() || 'unknown';

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null;
export async function turnstileOk(tokenValue: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured: rate limits only
  if (typeof tokenValue !== 'string' || !tokenValue) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: tokenValue, remoteip: ip }),
      signal: AbortSignal.timeout(8_000),
    });
    const d = await res.json();
    return !!d.success;
  } catch {
    return false;
  }
}

// ───────── testers ─────────

/**
 * The tester behind a portal token (cookie or link), if active and in this program. A token is
 * either the personal link from joining (Tester.accessHash) or an extra link (TesterLink).
 */
export async function testerForToken(slug: string, raw: string | null | undefined, opts: { opening?: boolean } = {}) {
  if (!raw || raw.length > 100) return null;
  const hash = hashToken(raw);
  let t = await prisma.tester.findUnique({ where: { accessHash: hash }, include: { program: true } });
  if (!t) {
    const link = await prisma.testerLink.findUnique({ where: { hash }, include: { tester: { include: { program: true } } } });
    if (link && link.tester.status === 'active' && link.tester.program.slug === slug) {
      t = link.tester;
      // Opening a link we emailed proves they own the address.
      if (opts.opening) {
        await prisma.testerLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
        if (link.kind === 'email' && !t.emailVerifiedAt) t = await prisma.tester.update({ where: { id: t.id }, data: { emailVerifiedAt: new Date() }, include: { program: true } });
      }
    }
  }
  if (!t || t.status !== 'active' || t.program.slug !== slug) return null;
  if (!t.lastSeenAt || Date.now() - t.lastSeenAt.getTime() > 300_000) {
    prisma.tester.update({ where: { id: t.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return t;
}

/** A new sign-in link for a tester; their other links keep working. */
export async function newTesterLink(testerId: string, kind: 'email' | 'team', createdById?: string) {
  const raw = token();
  await prisma.testerLink.create({ data: { testerId, hash: hashToken(raw), kind, createdById: createdById ?? null } });
  return raw;
}

/** Sign the tester out everywhere: a fresh personal link, every extra link gone. Returns the new link's token. */
export async function resetTesterLinks(testerId: string) {
  const raw = token();
  await prisma.$transaction([
    prisma.testerLink.deleteMany({ where: { testerId } }),
    prisma.tester.update({ where: { id: testerId }, data: { accessHash: hashToken(raw) } }),
  ]);
  return raw;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Email a tester their sign-in link (Resend). False when email isn't set up or the send failed. */
export async function emailTesterLink(p: { name: string; product: string | null }, to: string, name: string, url: string, first: boolean) {
  if (!emailConfigured()) return false;
  const label = p.product || p.name;
  const intro = first ? `Thanks for joining the ${label} beta.` : `Here’s a new link to your ${label} beta page.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1b19">
<div style="max-width:520px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e4e1da;border-radius:14px;padding:24px">
<p style="margin:0 0 12px;font-size:15px">Hi ${escapeHtml(name.split(' ')[0] || name)},</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55">${escapeHtml(intro)} This link opens your reports and the team’s replies on any device. Keep it to yourself — anyone with it can post as you.</p>
<a href="${escapeHtml(url)}" style="display:inline-block;background:#c4620d;color:#fff;font-weight:600;font-size:15px;text-decoration:none;padding:12px 20px;border-radius:10px">Open my beta page</a>
<p style="margin:18px 0 0;font-size:12.5px;color:#66625a;word-break:break-all">${escapeHtml(url)}</p>
</div><p style="font-size:12px;color:#9a958b;text-align:center;margin-top:16px">You’re getting this because this address was used to join the ${escapeHtml(label)} beta. If that wasn’t you, ignore it.</p></div></body></html>`;
  const text = `Hi ${name},\n\n${intro} Open your beta page (keep this link to yourself):\n${url}\n\nIf you didn’t join this beta, ignore this email.`;
  const r = await sendEmail({ to, subject: first ? `You’re in: the ${label} beta` : `Your ${label} beta link`, html, text });
  return r.ok;
}

export async function testerFromRequest(req: Request, slug: string) {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName(slug)}=([^;]+)`));
  return testerForToken(slug, m ? decodeURIComponent(m[1]) : null);
}


export type JoinResult =
  | { status: 'joined'; tester: Tester; portalToken: string; emailed: boolean } // new tester, signed in here
  | { status: 'updated'; tester: Tester } // already signed in here as this tester
  | { status: 'emailed' } // that email already joined: we sent its owner a sign-in link
  | { status: 'exists' }; // that email already joined, and we can't email (no email provider)

/**
 * Join. An email that already joined never gets signed in from here — that would let anyone who
 * knows a tester's address take over their page. Its owner gets a link by email instead (or, with
 * no email provider, is told to use the link they saved or ask the team).
 */
export async function joinProgram(p: BetaProgram, input: unknown, signedInAs: Tester | null): Promise<JoinResult> {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const email = str(raw.email, 201).toLowerCase();
  const name = str(raw.name, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) fail('Enter a valid email address.');
  if (!name) fail('Enter your name.');
  const contact = str(raw.contact, 80) || null, platform = str(raw.platform, 120) || null;
  const given = (raw.answers && typeof raw.answers === 'object' ? raw.answers : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const q of cleanQuestions(p.questions)) {
    const a = str(given[q.id], 1000);
    if (q.required && !a) fail(`Please answer: ${q.label}`);
    if (a) answers[q.id] = a;
  }
  const already = (): JoinResult => (emailConfigured() ? { status: 'emailed' } : { status: 'exists' });
  const existing = await prisma.tester.findUnique({ where: { programId_email: { programId: p.id, email } } });
  if (existing) {
    if (signedInAs?.id === existing.id) {
      const tester = await prisma.tester.update({ where: { id: existing.id }, data: { name, contact: contact ?? existing.contact, platform: platform ?? existing.platform, answers } });
      return { status: 'updated', tester };
    }
    if (existing.status === 'active' && existing.email && emailConfigured()) {
      await emailTesterLink(p, existing.email, existing.name, portalUrl(p.slug, await newTesterLink(existing.id, 'email')), false);
    }
    return already(); // the same answer for removed testers, so it says nothing about them
  }
  const portalToken = token();
  let tester: Tester;
  try {
    tester = await prisma.tester.create({ data: { programId: p.id, email, name, answers, contact, platform, accessHash: hashToken(portalToken) } });
  } catch (e: any) {
    if (e?.code === 'P2002') return already(); // the same email joining twice at once
    throw e;
  }
  // The cap is checked after the insert so two people joining at once can't both take the last place.
  if (p.maxTesters && (await prisma.tester.count({ where: { programId: p.id, status: 'active' } })) > p.maxTesters) {
    await prisma.tester.delete({ where: { id: tester.id } });
    fail('This beta is full. Thanks for your interest!');
  }
  const emailed = await emailTesterLink(p, email, name, portalUrl(p.slug, portalToken), true).catch(() => false);
  return { status: 'joined', tester, portalToken, emailed };
}

// ───────── reports ─────────

export type ReportInput = Record<string, unknown>;

/**
 * File a report — by the tester from their page, or by the team for them (`by`, e.g. from a call
 * or a DM). The tester's severity is kept as "claimed"; the team sets the official one in triage.
 */
export async function submitReport(tester: Tester & { program: BetaProgram }, input: unknown, by?: { id: string; name?: string | null }) {
  const p = tester.program;
  if (!by && !programOpen(p)) fail('This beta isn’t taking new reports right now.');
  const b = (input && typeof input === 'object' ? input : {}) as ReportInput;
  const kind = values(KINDS).includes(String(b.kind)) ? String(b.kind) : fail('Pick what kind of report this is.');
  const title = str(b.title, 200);
  const body = str(b.body, 10_000);
  if (!title) fail('Give it a short title.');
  if (!body) fail('Tell us a bit more in the description.');
  const pick = (v: unknown, opts: readonly (readonly [string, string])[]) => (values(opts).includes(String(v)) ? String(v) : null);
  const sev = LEGACY_SEVERITY[String(b.severity ?? b.claimedSeverity)] ?? pick(b.claimedSeverity ?? b.severity, SEVERITY);
  const claimedSeverity = kind === 'bug' ? sev ?? 'medium' : null;
  const clip = (v: unknown, n = 4000) => str(v, n) || null;
  const occurred = b.occurredAt ? new Date(String(b.occurredAt)) : null;
  let duplicateOfId: string | null = null;
  if (by && b.duplicateOfId) {
    const target = await prisma.testerReport.findFirst({ where: { id: String(b.duplicateOfId), programId: p.id, duplicateOfId: null } });
    duplicateOfId = target?.id ?? fail('Pick an original report in this program to mark it a duplicate of.');
  }
  const status = duplicateOfId ? 'duplicate' : 'new';

  const report = await prisma.testerReport.create({
    data: {
      programId: p.id, testerId: tester.id, kind, title, body, claimedSeverity, status,
      steps: clip(b.steps), expected: clip(b.expected, 2000), actual: clip(b.actual, 2000),
      platform: clip(b.platform, 120) ?? tester.platform, pageUrl: clip(b.pageUrl, 500),
      device: pick(b.device, DEVICES), environment: pick(b.environment, ENVIRONMENTS) ?? (kind === 'bug' ? 'production' : null),
      browser: clip(b.browser, 120), testArea: p.testAreas.includes(String(b.testArea)) ? String(b.testArea) : null,
      occurredAt: occurred && !Number.isNaN(occurred.getTime()) ? occurred : null,
      tokenContract: clip(b.tokenContract, 200), txHash: clip(b.txHash, 200), wallet: tester.walletAddress,
      plainTicket: by ? clip(b.plainTicket, 60) : null, duplicateOfId, loggedById: by?.id ?? null,
      callId: by && b.callId ? String(b.callId) : null,
      waitingOnId: status === 'new' ? p.leadId : null,
    },
  });
  // Filing a report makes an invited or onboarding tester active.
  if (!by && ['invited', 'onboarding', 'to_contact'].includes(tester.stage)) await prisma.tester.update({ where: { id: tester.id }, data: { stage: 'active' } }).catch(() => {});

  // Route it: a task for the right team, priority from severity.
  const teamId = (kind === 'bug' ? p.bugTeamId ?? p.teamId : p.teamId) ?? null;
  const triage = `${APP_URL()}/beta/${p.id}?report=${report.id}`;
  const what = kind === 'bug' ? `Bug (${LABEL.severity[claimedSeverity!]}, as reported)` : LABEL.kind[kind];
  const detail = [
    `${what} from ${tester.name}${tester.email ? ` <${tester.email}>` : ''} in ${p.name}${by ? ` · logged by ${by.name ?? 'the team'}` : ''}`,
    report.testArea ? `Area: ${report.testArea}` : null,
    [report.device && LABEL.device[report.device], report.browser, report.platform].filter(Boolean).join(' · ') || null,
    report.pageUrl ? `Where: ${report.pageUrl}` : null,
    '', body,
    report.steps ? `\nSteps:\n${report.steps}` : null,
    report.expected ? `\nExpected: ${report.expected}` : null,
    report.actual ? `Actual: ${report.actual}` : null,
    report.txHash ? `Tx: ${report.txHash}` : null,
  ].filter((x) => x !== null).join('\n');
  try {
    const { task } = await createTask({ id: by?.id ?? 'system', name: by?.name ?? `${tester.name} (beta tester)` }, {
      title: `[${p.name}] ${kind === 'bug' ? 'Bug' : LABEL.kind[kind]}: ${title}`,
      body: detail, teamId, priority: priorityFor(kind, claimedSeverity),
      status: duplicateOfId ? 'DONE' : 'TODO',
      source: 'beta', sourceRef: report.id, sourceUrl: triage,
    });
    await prisma.testerReport.update({ where: { id: report.id }, data: { taskId: task.id } });
  } catch (e) {
    // No half-filed reports: without its task nobody would see it, and the tester will retry.
    await prisma.testerReport.delete({ where: { id: report.id } }).catch(() => {});
    throw e;
  }
  return report;
}

/** A tester replied: tell whoever owns the task (or the team). */
export async function notifyTesterReply(reportId: string, testerName: string, body: string) {
  const r = await prisma.testerReport.findUnique({ where: { id: reportId }, include: { task: true, program: true } });
  if (!r) return;
  const ids = r.task?.assigneeId ? [r.task.assigneeId] : r.task?.teamId ? await teamMemberIds(r.task.teamId) : [];
  if (!ids.length && r.program.createdById) ids.push(r.program.createdById);
  await notify({
    userIds: ids, kind: 'beta.reply', url: `/beta/${r.programId}?report=${r.id}`,
    title: `${testerName} replied on “${r.title}”`, body: body.slice(0, 140),
  });
}

// ───────── attachments ─────────

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const TESTER_QUOTA_BYTES = 150 * 1024 * 1024; // all of one tester's files
export const PROGRAM_QUOTA_BYTES = 3 * 1024 * 1024 * 1024; // all files in a program (they live in Postgres for now)
const ALLOWED = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/;
export const attachmentTypeOk = (t: string) => ALLOWED.test(t);
export const inlineType = (t: string) => /^(image|video)\//.test(t);
