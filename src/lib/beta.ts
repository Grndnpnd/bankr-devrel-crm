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

export const REPORT_KINDS = ['bug', 'feedback', 'idea', 'question'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const SEVERITIES = ['blocker', 'major', 'minor'] as const;
export const REPORT_STATUSES = ['new', 'triaged', 'in_progress', 'fixed', 'wont_fix', 'duplicate', 'answered'] as const;
export const STATUS_LABEL: Record<string, string> = {
  new: 'New', triaged: 'Seen', in_progress: 'Being worked on', fixed: 'Fixed', wont_fix: 'Won’t fix', duplicate: 'Duplicate', answered: 'Answered',
};

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
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

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

/** The tester behind a portal token (cookie or link), if active and the program exists. */
export async function testerForToken(slug: string, raw: string | null | undefined) {
  if (!raw) return null;
  const t = await prisma.tester.findUnique({ where: { accessHash: hashToken(raw) }, include: { program: true } });
  if (!t || t.status !== 'active' || t.program.slug !== slug) return null;
  if (!t.lastSeenAt || Date.now() - t.lastSeenAt.getTime() > 300_000) {
    prisma.tester.update({ where: { id: t.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return t;
}

export async function testerFromRequest(req: Request, slug: string) {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName(slug)}=([^;]+)`));
  return testerForToken(slug, m ? decodeURIComponent(m[1]) : null);
}

export interface JoinInput { email: string; name: string; contact?: string; platform?: string; answers?: Record<string, string> }

/** Join (or re-join with the same email, which issues a fresh portal link). */
export async function joinProgram(p: BetaProgram, input: JoinInput): Promise<{ tester: Tester; portalToken: string; rejoined: boolean }> {
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new Error('Enter a valid email address.');
  if (!name) throw new Error('Enter your name.');
  const questions = cleanQuestions(p.questions);
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const a = String(input.answers?.[q.id] ?? '').trim().slice(0, 1000);
    if (q.required && !a) throw new Error(`Please answer: ${q.label}`);
    if (a) answers[q.id] = a;
  }
  const portalToken = token();
  const existing = await prisma.tester.findUnique({ where: { programId_email: { programId: p.id, email } } });
  if (existing) {
    if (existing.status !== 'active') throw new Error('This email can’t join this program. Contact the team if that’s a mistake.');
    const tester = await prisma.tester.update({
      where: { id: existing.id },
      data: { name, contact: input.contact?.trim().slice(0, 80) || existing.contact, platform: input.platform?.trim().slice(0, 120) || existing.platform, answers, accessHash: hashToken(portalToken) },
    });
    return { tester, portalToken, rejoined: true };
  }
  if (p.maxTesters) {
    const count = await prisma.tester.count({ where: { programId: p.id, status: 'active' } });
    if (count >= p.maxTesters) throw new Error('This beta is full. Thanks for your interest!');
  }
  const tester = await prisma.tester.create({
    data: {
      programId: p.id, email, name, answers,
      contact: input.contact?.trim().slice(0, 80) || null,
      platform: input.platform?.trim().slice(0, 120) || null,
      accessHash: hashToken(portalToken),
    },
  });
  return { tester, portalToken, rejoined: false };
}

// ───────── reports ─────────

export interface ReportInput {
  kind: string; title: string; body: string; severity?: string;
  steps?: string; expected?: string; actual?: string; platform?: string; pageUrl?: string;
}

const PRIORITY: Record<string, number> = { blocker: 0, major: 1, minor: 2 };

export async function submitReport(tester: Tester & { program: BetaProgram }, input: ReportInput) {
  const p = tester.program;
  if (!programOpen(p)) throw new Error('This beta isn’t taking new reports right now.');
  const kind = (REPORT_KINDS as readonly string[]).includes(input.kind) ? (input.kind as ReportKind) : null;
  if (!kind) throw new Error('Pick what kind of report this is.');
  const title = String(input.title ?? '').trim().slice(0, 200);
  const body = String(input.body ?? '').trim().slice(0, 10_000);
  if (!title) throw new Error('Give it a short title.');
  if (!body) throw new Error('Tell us a bit more in the description.');
  const severity = kind === 'bug' ? ((SEVERITIES as readonly string[]).includes(String(input.severity)) ? String(input.severity) : 'minor') : null;
  const clip = (s?: string, n = 4000) => (s ? String(s).trim().slice(0, n) || null : null);

  const report = await prisma.testerReport.create({
    data: {
      programId: p.id, testerId: tester.id, kind, title, body, severity,
      steps: clip(input.steps), expected: clip(input.expected, 2000), actual: clip(input.actual, 2000),
      platform: clip(input.platform, 120) ?? tester.platform, pageUrl: clip(input.pageUrl, 500),
    },
  });

  // Route it: a task for the right team, priority from severity.
  const teamId = (kind === 'bug' ? p.bugTeamId ?? p.teamId : p.teamId) ?? null;
  const triage = `${APP_URL()}/beta/${p.id}?report=${report.id}`;
  const detail = [
    `${kind === 'bug' ? `Bug (${severity})` : kind[0].toUpperCase() + kind.slice(1)} from ${tester.name} <${tester.email}> in ${p.name}`,
    report.platform ? `Platform: ${report.platform}` : null,
    report.pageUrl ? `Where: ${report.pageUrl}` : null,
    '', body,
    report.steps ? `\nSteps:\n${report.steps}` : null,
    report.expected ? `\nExpected: ${report.expected}` : null,
    report.actual ? `Actual: ${report.actual}` : null,
  ].filter((x) => x !== null).join('\n');
  const { task } = await createTask({ id: 'system', name: `${tester.name} (beta tester)` }, {
    title: `[${p.name}] ${kind === 'bug' ? 'Bug' : kind[0].toUpperCase() + kind.slice(1)}: ${title}`,
    body: detail, teamId,
    priority: kind === 'bug' ? PRIORITY[severity!] : kind === 'idea' ? 3 : 2,
    source: 'beta', sourceRef: report.id, sourceUrl: triage,
  });
  await prisma.testerReport.update({ where: { id: report.id }, data: { taskId: task.id } });
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
const ALLOWED = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm|quicktime)|application\/pdf|text\/plain)$/;
export const attachmentTypeOk = (t: string) => ALLOWED.test(t);
export const inlineType = (t: string) => /^(image|video)\//.test(t);
