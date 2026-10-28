import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { badge, divider, linkButton, md, plainHmacSecret, plainText, row, spacer, text, verifyPlainRequest, type PlainComponent } from '@/lib/plain';
import { STATUS_LABEL } from '@/lib/beta';
import { effectiveSeverity, LABEL } from '@/lib/betaModel';
import { STATUS_LABEL as TASK_STATUS } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

/**
 * Plain customer cards. Plain POSTs { cardKeys, customer: { id, email, externalId }, thread? }
 * when someone opens a customer or thread, signed with the workspace HMAC secret, and shows
 * what we return next to the conversation. Every requested key gets a card (null = nothing to show).
 *   crm-beta   the customer's beta programs and reports (the thread's own report first)
 *   crm-tasks  open CRM tasks about this thread or this customer's reports
 */
const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const REPORT_COLOR: Record<string, 'GREY' | 'GREEN' | 'YELLOW' | 'RED' | 'BLUE'> = {
  new: 'BLUE', triaged: 'GREY', escalated: 'YELLOW', fix_in_review: 'YELLOW', fix_live: 'GREEN', retest_needed: 'YELLOW', verified: 'GREEN',
  duplicate: 'GREY', already_known: 'GREY', wont_fix: 'GREY', noted: 'GREEN', passed_on: 'GREEN', shipped: 'GREEN', answered: 'GREEN',
};
const TASK_COLOR: Record<string, 'GREY' | 'GREEN' | 'YELLOW' | 'RED' | 'BLUE'> = { TODO: 'BLUE', IN_PROGRESS: 'YELLOW', BLOCKED: 'RED', DONE: 'GREEN' };
const day = (d: Date) => d.toISOString().slice(0, 10);

async function betaCard(email: string | null, threadExternalId: string | null): Promise<PlainComponent[] | null> {
  if (!email) return null;
  const testers = await prisma.tester.findMany({
    where: { email: email.toLowerCase() },
    include: {
      program: { select: { id: true, name: true, status: true } },
      reports: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, kind: true, severity: true, claimedSeverity: true, status: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!testers.length) return null;
  const focusId = threadExternalId?.startsWith('beta_report_') ? threadExternalId.slice('beta_report_'.length) : null;
  const out: PlainComponent[] = [];
  testers.forEach((t, i) => {
    if (i) out.push(divider());
    const open = t.reports.filter((r) => ['new', 'triaged', 'in_progress'].includes(r.status)).length;
    out.push(
      row([text(`**${md(t.program.name)}**`)], [badge(t.status === 'active' ? 'Tester' : 'Removed', t.status === 'active' ? 'GREEN' : 'GREY')]),
      plainText(`Joined ${day(t.createdAt)} · ${t.reports.length} report(s), ${open} open${t.platform ? ` · ${t.platform}` : ''}`, 'MUTED'),
    );
    const focus = t.reports.find((r) => r.id === focusId);
    const list = [...(focus ? [focus] : []), ...t.reports.filter((r) => r.id !== focusId)].slice(0, 4);
    for (const r of list) {
      out.push(row(
        [text(`${r.id === focusId ? '**This thread:** ' : ''}${r.kind === 'bug' ? `Bug (${LABEL.severity[effectiveSeverity(r) ?? 'medium']})` : LABEL.kind[r.kind] ?? r.kind}: ${md(r.title.slice(0, 250))}`)],
        [badge(STATUS_LABEL[r.status] ?? r.status, REPORT_COLOR[r.status] ?? 'GREY')],
      ));
    }
    out.push(spacer('XS'), linkButton(focus ? 'Open this report in the CRM' : 'Open the program in the CRM', `${APP_URL()}/beta/${t.program.id}${focus ? `?report=${focus.id}` : ''}`));
  });
  return out;
}

async function tasksCard(email: string | null, threadId: string | null, threadExternalId: string | null): Promise<PlainComponent[] | null> {
  const or: any[] = [];
  if (threadId) or.push({ source: 'plain', sourceRef: { contains: threadId } }, { sourceUrl: { contains: threadId } });
  const reportIds = email
    ? (await prisma.testerReport.findMany({ where: { tester: { email: email.toLowerCase() } }, select: { id: true }, take: 200 })).map((r) => r.id)
    : [];
  if (threadExternalId?.startsWith('beta_report_')) reportIds.push(threadExternalId.slice('beta_report_'.length));
  if (reportIds.length) or.push({ source: 'beta', sourceRef: { in: reportIds } });
  if (!or.length) return null;
  const tasks = await prisma.task.findMany({
    where: { OR: or, status: { not: 'DONE' } },
    include: { assignee: { select: { name: true, email: true } }, team: { select: { name: true } } },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }], take: 8,
  });
  if (!tasks.length) return null;
  const out: PlainComponent[] = [];
  for (const t of tasks) {
    const who = t.assignee?.name || t.assignee?.email || (t.team ? `${t.team.name} (unassigned)` : 'Unassigned');
    out.push(
      row([text(t.title.slice(0, 300))], [badge(TASK_STATUS[t.status], TASK_COLOR[t.status] ?? 'GREY')]),
      plainText(`${who}${t.dueAt ? ` · due ${day(t.dueAt)}` : ''}`, 'MUTED'),
    );
  }
  out.push(spacer('XS'), linkButton('Open the task board', `${APP_URL()}/tasks`));
  return out;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = plainHmacSecret();
  if (!secret) return NextResponse.json({ error: 'request signing not configured' }, { status: 503 });
  if (!verifyPlainRequest(raw, req.headers.get('plain-request-signature'), secret)) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'invalid JSON' }, { status: 400 }); }
  const keys: string[] = Array.isArray(body?.cardKeys) ? body.cardKeys.filter((k: unknown) => typeof k === 'string') : [];
  const email: string | null = body?.customer?.email ?? null;
  const threadId: string | null = body?.thread?.id ?? null;
  const threadExt: string | null = body?.thread?.externalId ?? null;

  const cards = await Promise.all(keys.map(async (key) => {
    try {
      const components = key === 'crm-beta' ? await betaCard(email, threadExt)
        : key === 'crm-tasks' ? await tasksCard(email, threadId, threadExt)
        : null;
      return { key, timeToLiveSeconds: 60, components };
    } catch (e: any) {
      console.error('[plain-cards]', key, e?.message ?? e);
      return { key, timeToLiveSeconds: 15, components: [text('Couldn’t load this from the CRM. Reload the card to try again.', { color: 'MUTED' })] };
    }
  }));
  return NextResponse.json({ cards });
}
