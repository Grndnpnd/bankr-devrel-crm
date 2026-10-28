/**
 * Two-way sync between a beta program and its Notion boards (testers, reports, outreach, payouts,
 * calls). Each kind maps CRM fields to board properties; the defaults match the team's boards, so
 * connecting a board maps itself and can be adjusted in Settings.
 *
 * Merge is field by field. Every synced record keeps `notionSnapshot`: the mapped values as Notion
 * last had them. Pull: a field whose Notion value differs from the snapshot was changed in Notion →
 * it's applied here (through the same workflow as a change in the CRM, so tasks, "waiting on" and
 * outreach follow). Push: a field whose CRM value differs from the snapshot was changed here → it's
 * written to Notion. Edits to different fields never overwrite each other; when both sides changed
 * the same field between syncs, Notion's edit wins (pull runs first). Our own writes come back from
 * Notion equal to the snapshot, so they're not mistaken for edits.
 *
 * Connecting a board imports its existing rows (matching testers by email or name, reports by title
 * and tester) and creates rows for CRM records that aren't on it yet.
 */
import { prisma } from '@/lib/prisma';
import {
  CHANNELS, DEVICES, ENVIRONMENTS, KINDS, OUTCOMES, OUTREACH_STATUSES, OUTREACH_TYPES, PAYOUT_REASONS, SEND_FUNDS,
  SEVERITY, STAGES, TESTER_TYPES, USAGE, ALL_STATUSES, BUG_OPEN, BUG_CLOSED, NOTE_STATUSES, LABEL, type Opt,
} from '@/lib/betaModel';
import { createPage, getDataSource, notionPeople, NotionError, rowsSince, updatePage, type NotionPage, type NotionProperty } from '@/lib/notion';

export type Kind = 'testers' | 'reports' | 'outreach' | 'payouts' | 'calls';
export const KIND_ORDER: Kind[] = ['testers', 'calls', 'reports', 'outreach', 'payouts']; // relations point backwards
export const KIND_LABEL: Record<Kind, string> = { testers: 'Testers', reports: 'Bugs & feedback', outreach: 'Outreach', payouts: 'Payouts', calls: 'Feedback calls' };
type Canon = 'title' | 'text' | 'enum' | 'enums' | 'date' | 'datetime' | 'number' | 'person' | 'relation' | 'relations' | 'link';

interface Field {
  key: string; label: string; canon: Canon; names: string[];
  options?: readonly Opt[]; // enum vocabulary (labels are the default Notion option names)
  target?: Kind; // relation target
  pushOnly?: boolean; // computed here (links, timestamps); never read back
  get: (r: any) => unknown; // CRM value (undefined = don't sync this field for this record)
  put?: (v: any, r: any) => Record<string, unknown>; // CRM patch for a value pulled from Notion
}

const STAGE_OPTS: Opt[] = [...STAGES, ['declined', 'Declined']];
const STATUS_OPTS: Opt[] = [...BUG_OPEN, ...BUG_CLOSED, ...NOTE_STATUSES];
const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const minute = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16) + ':00.000Z' : null);
const plain = (k: string) => ({ get: (r: any) => r[k] ?? null, put: (v: any) => ({ [k]: v ?? null }) });
const handleFor = (ch: string) => ({
  get: (r: any) => (r.channel === ch ? r.handle ?? null : undefined),
  put: (v: any, r: any) => (v && (!r.channel || r.channel === ch) ? { handle: v, channel: r.channel ?? ch } : {}),
});

export const FIELDS: Record<Kind, Field[]> = {
  testers: [
    { key: 'name', label: 'Name', canon: 'title', names: ['Tester', 'Name'], ...plain('name') },
    { key: 'stage', label: 'Status', canon: 'enum', options: STAGE_OPTS, names: ['Status', 'Stage'],
      get: (r) => (r.status === 'removed' ? 'declined' : r.stage),
      put: (v) => (v === 'declined' ? { status: 'removed' } : v ? { stage: v, status: 'active' } : {}) },
    { key: 'types', label: 'Tester type', canon: 'enums', options: TESTER_TYPES, names: ['Tester Type', 'Type'], ...plain('types') },
    { key: 'usage', label: 'Usage', canon: 'enum', options: USAGE, names: ['Usage'], get: (r) => r.usage, put: (v) => ({ usage: v ?? 'unknown' }) },
    { key: 'sendFunds', label: 'Send funds', canon: 'enum', options: SEND_FUNDS, names: ['Send Funds'], get: (r) => r.sendFunds, put: (v) => ({ sendFunds: v ?? 'not_asked' }) },
    { key: 'channel', label: 'Reach them on', canon: 'enum', options: CHANNELS, names: ['Channel', 'Reach them on'], ...plain('channel') },
    { key: 'handleX', label: 'X handle', canon: 'text', names: ['X Handle', 'X'], ...handleFor('x') },
    { key: 'handleDiscord', label: 'Discord handle', canon: 'text', names: ['Discord'], ...handleFor('discord') },
    { key: 'handleTelegram', label: 'Telegram handle', canon: 'text', names: ['Telegram'], ...handleFor('telegram') },
    { key: 'email', label: 'Email', canon: 'text', names: ['Email'], get: (r) => r.email ?? null, put: (v) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { email: String(v).toLowerCase() } : {}) },
    { key: 'walletAddress', label: 'Wallet', canon: 'text', names: ['Wallet Address', 'Wallet'], ...plain('walletAddress') },
    { key: 'testAreas', label: 'Test areas', canon: 'enums', names: ['Test Areas', 'Test Area'], get: (r) => r.testAreas, put: (v) => ({ testAreas: v ?? [] }) },
    { key: 'lastCheckInAt', label: 'Last check-in', canon: 'date', names: ['Last Check-in', 'Last Check-In'], get: (r) => day(r.lastCheckInAt), put: (v) => ({ lastCheckInAt: v ? new Date(v) : null }) },
    { key: 'invitedAt', label: 'Invited on', canon: 'date', names: ['Invited On'], get: (r) => day(r.invitedAt), put: (v) => ({ invitedAt: v ? new Date(v) : null }) },
    { key: 'wave', label: 'Wave', canon: 'text', names: ['Wave'], ...plain('wave') },
    { key: 'notes', label: 'Notes', canon: 'text', names: ['Notes'], ...plain('notes') },
  ],
  reports: [
    { key: 'title', label: 'Title', canon: 'title', names: ['Report', 'Title', 'Name'], ...plain('title') },
    { key: 'tester', label: 'Tester', canon: 'relation', target: 'testers', names: ['Tester'], get: (r) => r.testerId, put: () => ({}) },
    { key: 'kind', label: 'Type', canon: 'enum', options: KINDS, names: ['Type'], ...plain('kind') },
    { key: 'status', label: 'Status', canon: 'enum', options: STATUS_OPTS, names: ['Status'], ...plain('status') },
    { key: 'severity', label: 'Severity (team)', canon: 'enum', options: SEVERITY, names: ['Severity'], ...plain('severity') },
    { key: 'claimedSeverity', label: 'Claimed severity', canon: 'enum', options: SEVERITY, names: ['Claimed Severity'], ...plain('claimedSeverity') },
    { key: 'testArea', label: 'Test area', canon: 'text', names: ['Test Area'], ...plain('testArea') },
    { key: 'device', label: 'Device', canon: 'enum', options: DEVICES, names: ['Device'], ...plain('device') },
    { key: 'environment', label: 'Environment', canon: 'enum', options: ENVIRONMENTS, names: ['Environment'], ...plain('environment') },
    { key: 'reportedOn', label: 'Reported on', canon: 'date', pushOnly: true, names: ['Reported On'], get: (r) => day(r.createdAt) },
    { key: 'occurredAt', label: 'Occurred at', canon: 'datetime', names: ['Occurred At'], get: (r) => minute(r.occurredAt), put: (v) => ({ occurredAt: v }) },
    { key: 'nextActionDue', label: 'Next action due', canon: 'date', names: ['Next Action Due'], get: (r) => day(r.nextActionDue), put: (v) => ({ nextActionDue: v }) },
    { key: 'body', label: 'Details', canon: 'text', names: ['Details', 'Description'], get: (r) => r.body, put: (v, r) => (v ? { body: v } : r.body ? {} : { body: r.title }) },
    { key: 'steps', label: 'Steps to reproduce', canon: 'text', names: ['Steps to Reproduce', 'Steps'], ...plain('steps') },
    { key: 'expected', label: 'Expected', canon: 'text', names: ['Expected'], ...plain('expected') },
    { key: 'actual', label: 'Actual', canon: 'text', names: ['Actual'], ...plain('actual') },
    { key: 'browser', label: 'Browser / version', canon: 'text', names: ['Browser / Version', 'Browser'], ...plain('browser') },
    { key: 'tokenContract', label: 'Token / contract', canon: 'text', names: ['Token / Contract'], ...plain('tokenContract') },
    { key: 'txHash', label: 'Tx hash', canon: 'text', names: ['Tx Hash'], ...plain('txHash') },
    { key: 'wallet', label: 'Wallet', canon: 'text', names: ['Wallet'], ...plain('wallet') },
    { key: 'plainTicket', label: 'Plain ticket', canon: 'text', names: ['Plain Ticket'], ...plain('plainTicket') },
    { key: 'pageUrl', label: 'Source link', canon: 'text', names: ['Source Link'], ...plain('pageUrl') },
    { key: 'trackedIn', label: 'Tracked in', canon: 'text', names: ['Tracked In'], get: (r) => r.trackedIn ?? null, put: (v) => (!v || /^https:\/\//.test(v) ? { trackedIn: v ?? null } : {}) },
    { key: 'fixPr', label: 'Fix PR', canon: 'text', names: ['Fix PR'], ...plain('fixPr') },
    { key: 'nextStep', label: 'Next step', canon: 'text', names: ['Next Step'], ...plain('nextStep') },
    { key: 'waitingOn', label: 'Waiting on', canon: 'person', names: ['Waiting On'], get: (r) => r.waitingOnId ?? null, put: (v) => ({ waitingOnId: v ?? null }) },
    { key: 'duplicateOf', label: 'Duplicate of', canon: 'relation', target: 'reports', names: ['Duplicate Of'], get: (r) => r.duplicateOfId ?? null, put: (v) => ({ duplicateOfId: v ?? null }) },
    { key: 'call', label: 'Call', canon: 'relation', target: 'calls', names: ['Call'], get: (r) => r.callId ?? null, put: (v) => ({ callId: v ?? null }) },
    { key: 'crmLink', label: 'Link to the CRM (screenshots, conversation)', canon: 'link', pushOnly: true, names: ['Screenshots', 'CRM'], get: (r) => `${APP_URL()}/beta/${r.programId}?report=${r.id}` },
  ],
  outreach: [
    { key: 'title', label: 'Request', canon: 'title', names: ['Request', 'Name'], ...plain('title') },
    { key: 'tester', label: 'Tester', canon: 'relation', target: 'testers', names: ['Tester'], get: (r) => r.testerId, put: () => ({}) },
    { key: 'report', label: 'Report', canon: 'relation', target: 'reports', names: ['Report'], get: (r) => r.reportId ?? null, put: (v) => ({ reportId: v ?? null }) },
    { key: 'type', label: 'Type', canon: 'enum', options: OUTREACH_TYPES, names: ['Type'], get: (r) => r.type, put: (v) => ({ type: v ?? 'other' }) },
    { key: 'status', label: 'Status', canon: 'enum', options: OUTREACH_STATUSES, names: ['Status'], get: (r) => r.status, put: (v) => (v ? { status: v } : {}) },
    { key: 'outcome', label: 'Outcome', canon: 'enum', options: OUTCOMES, names: ['Outcome'], ...plain('outcome') },
    { key: 'message', label: 'Message', canon: 'text', names: ['Message'], ...plain('message') },
    { key: 'answer', label: 'Their answer', canon: 'text', names: ['Their Answer', 'Answer'], ...plain('answer') },
    { key: 'waitingOn', label: 'Waiting on', canon: 'person', names: ['Waiting On'], get: (r) => r.waitingOnId ?? null, put: (v) => ({ waitingOnId: v ?? null }) },
    { key: 'approvedBy', label: 'Approved by', canon: 'person', names: ['Approved By'], get: (r) => r.approvedById ?? null, put: (v) => ({ approvedById: v ?? null }) },
    { key: 'requestedBy', label: 'Requested by', canon: 'person', names: ['Requested By'], get: (r) => r.requestedById ?? null, put: (v) => ({ requestedById: v ?? null }) },
    { key: 'sentAt', label: 'Sent on', canon: 'date', names: ['Sent On'], get: (r) => day(r.sentAt), put: (v) => ({ sentAt: v ? new Date(v) : null }) },
    { key: 'answeredAt', label: 'Answered on', canon: 'date', names: ['Answered On'], get: (r) => day(r.answeredAt), put: (v) => ({ answeredAt: v ? new Date(v) : null }) },
    { key: 'nextActionDue', label: 'Next action due', canon: 'date', names: ['Next Action Due'], get: (r) => day(r.nextActionDue), put: (v) => ({ nextActionDue: v ? new Date(v) : null }) },
  ],
  payouts: [
    { key: 'title', label: 'Payout', canon: 'title', pushOnly: true, names: ['Payout', 'Name'], get: (r) => `${LABEL.reason[r.reason] ?? r.reason}: ${r.tester?.name ?? 'tester'}` },
    { key: 'tester', label: 'Tester', canon: 'relation', target: 'testers', names: ['Tester'], get: (r) => r.testerId, put: () => ({}) },
    { key: 'report', label: 'Report', canon: 'relation', target: 'reports', names: ['Report'], get: (r) => r.reportId ?? null, put: (v) => ({ reportId: v ?? null }) },
    { key: 'amount', label: 'Amount', canon: 'number', names: ['Amount'], get: (r) => r.amount, put: (v) => (typeof v === 'number' && v > 0 ? { amount: v } : {}) },
    { key: 'token', label: 'Token', canon: 'text', names: ['Token'], get: (r) => r.token, put: (v) => (v ? { token: v } : {}) },
    { key: 'reason', label: 'Reason', canon: 'enum', options: PAYOUT_REASONS, names: ['Reason'], get: (r) => r.reason, put: (v) => ({ reason: v ?? 'other' }) },
    { key: 'tx', label: 'Tx', canon: 'text', names: ['Tx', 'Tx Hash'], ...plain('tx') },
    { key: 'sentAt', label: 'Sent on', canon: 'date', names: ['Sent On'], get: (r) => day(r.sentAt), put: (v) => (v ? { sentAt: new Date(v) } : {}) },
    { key: 'sentBy', label: 'Sent by', canon: 'person', names: ['Sent By'], get: (r) => r.sentById ?? null, put: (v) => ({ sentById: v ?? null }) },
    { key: 'notes', label: 'Notes', canon: 'text', names: ['Notes'], ...plain('notes') },
  ],
  calls: [
    { key: 'title', label: 'Call', canon: 'title', names: ['Call', 'Name'], ...plain('title') },
    { key: 'date', label: 'Date', canon: 'date', names: ['Date'], get: (r) => day(r.date), put: (v) => (v ? { date: new Date(v) } : {}) },
    { key: 'summary', label: 'Summary', canon: 'text', names: ['Summary'], ...plain('summary') },
    { key: 'recordingUrl', label: 'Recording', canon: 'text', names: ['Recording'], get: (r) => r.recordingUrl ?? null, put: (v) => (!v || /^https:\/\//.test(v) ? { recordingUrl: v ?? null } : {}) },
    { key: 'testers', label: 'Testers', canon: 'relations', target: 'testers', names: ['Testers'], get: (r) => (r.testers ?? []).map((x: any) => x.testerId) },
  ],
};
/** Board-specific relation names for shared boards ("Texting Tester", "Texting Report"). */
const RELATION_HINT: Record<string, RegExp> = { tester: /tester/i, report: /report/i, testers: /tester/i, duplicateOf: /duplicate/i, call: /call/i };

const COMPATIBLE: Record<Canon, string[]> = {
  title: ['title'], text: ['rich_text', 'title', 'url', 'email', 'phone_number', 'select'], enum: ['select', 'status', 'multi_select'],
  enums: ['multi_select'], date: ['date'], datetime: ['date'], number: ['number'], person: ['people'], relation: ['relation'],
  relations: ['relation'], link: ['url', 'rich_text'],
};

export interface FieldMap { property: string; type: string; options?: Record<string, string> }
export type Mapping = Record<string, FieldMap>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const optionNames = (p: NotionProperty) => (p.select ?? p.status ?? p.multi_select)?.options.map((o) => o.name) ?? [];

/** Map a board's properties to our fields by name and type; enum options by label. */
export function autoMap(kind: Kind, props: Record<string, NotionProperty>, targets: Partial<Record<Kind, string>> = {}): Mapping {
  const list = Object.values(props);
  const out: Mapping = {};
  const used = new Set<string>();
  for (const f of FIELDS[kind]) {
    const fits = (p: NotionProperty) => COMPATIBLE[f.canon].includes(p.type) && !used.has(p.name)
      && (!f.target || !targets[f.target] || !p.relation?.data_source_id || p.relation.data_source_id === targets[f.target]);
    let p = list.find((x) => fits(x) && f.names.some((n) => norm(n) === norm(x.name)));
    if (!p && (f.canon === 'relation' || f.canon === 'relations')) {
      const hint = RELATION_HINT[f.key];
      p = list.find((x) => fits(x) && !!hint && hint.test(x.name) && (!f.target || !targets[f.target] || x.relation?.data_source_id === targets[f.target]));
    }
    if (!p && f.canon === 'title') p = list.find((x) => x.type === 'title' && !used.has(x.name));
    if (!p) continue;
    used.add(p.name);
    const m: FieldMap = { property: p.name, type: p.type };
    if (f.options && ['select', 'status', 'multi_select'].includes(p.type)) {
      const names = optionNames(p);
      m.options = {};
      for (const [v, label] of f.options) {
        const hit = names.find((n) => norm(n) === norm(label)) ?? names.find((n) => norm(n) === norm(v));
        // select/multi-select options are created on write; a status option has to exist already.
        if (hit || p.type !== 'status') m.options[v] = hit ?? label;
      }
    }
    out[f.key] = m;
  }
  return out;
}

// ───────── value conversion ─────────

interface Ctx {
  programId: string;
  pageOf: (kind: Kind, id: string) => Promise<string | null>; // CRM id → Notion page id
  recordOf: (kind: Kind, pageId: string) => Promise<string | null>; // Notion page id → CRM id
  notionUser: (crmUserId: string) => Promise<string | null>;
  crmUser: (notionUserId: string) => Promise<string | null>;
}

const richText = (s: string) => {
  const chunks: { type: 'text'; text: { content: string } }[] = [];
  for (let i = 0; i < Math.min(s.length, 100 * 2000); i += 2000) chunks.push({ type: 'text', text: { content: s.slice(i, i + 2000) } });
  return chunks;
};
const textOf = (arr: any[] | undefined) => (arr ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('').trim() || null;
const selectName = (s: string) => s.replace(/,/g, ' ').slice(0, 100);

/** Our value → a Notion property value; undefined when it can't be written yet (relation not on Notion). */
async function toNotion(f: Field, m: FieldMap, v: any, ctx: Ctx): Promise<unknown> {
  const opt = (x: string) => m.options?.[x] ?? (f.options ? undefined : x);
  switch (m.type) {
    case 'title': return { title: v ? richText(String(v)).slice(0, 1) : [] };
    case 'rich_text': return { rich_text: v ? richText(String(v)) : [] };
    case 'url': return { url: v ? String(v).slice(0, 2000) : null };
    case 'email': return { email: v ? String(v) : null };
    case 'phone_number': return { phone_number: v ? String(v) : null };
    case 'number': return { number: typeof v === 'number' ? v : v ? Number(v) : null };
    case 'date': return { date: v ? { start: f.canon === 'datetime' ? String(v) : String(v).slice(0, 10) } : null };
    case 'select': { const n = v ? opt(String(v)) : null; return n === undefined ? undefined : { select: n ? { name: selectName(n) } : null }; }
    case 'status': { if (!v) return undefined; const n = opt(String(v)); return n ? { status: { name: n } } : undefined; }
    case 'multi_select': {
      const list = (Array.isArray(v) ? v : v ? [v] : []).map((x: string) => opt(x)).filter(Boolean) as string[];
      return { multi_select: list.map((n) => ({ name: selectName(n) })) };
    }
    case 'people': { if (!v) return { people: [] }; const id = await ctx.notionUser(String(v)); return id ? { people: [{ id }] } : undefined; }
    case 'relation': {
      const ids = (Array.isArray(v) ? v : v ? [v] : []) as string[];
      const pages: string[] = [];
      for (const id of ids) { const pid = await ctx.pageOf(f.target!, id); if (!pid) return undefined; pages.push(pid); }
      return { relation: pages.map((id) => ({ id })) };
    }
    default: return undefined;
  }
}

/** A Notion property value → our value (undefined = unusable, leave ours alone). */
async function fromNotion(f: Field, m: FieldMap, prop: any, ctx: Ctx): Promise<unknown> {
  if (!prop) return undefined;
  const back = (name: string | null | undefined) => {
    if (!name) return null;
    if (!f.options) return name;
    const hit = Object.entries(m.options ?? {}).find(([, n]) => norm(n) === norm(name)) ?? f.options.find(([, l]) => norm(l) === norm(name));
    return hit ? hit[0] : undefined;
  };
  switch (prop.type) {
    case 'title': return textOf(prop.title);
    case 'rich_text': return textOf(prop.rich_text);
    case 'url': return prop.url || null;
    case 'email': return prop.email || null;
    case 'phone_number': return prop.phone_number || null;
    case 'number': return prop.number ?? null;
    case 'date': return prop.date?.start ? (f.canon === 'datetime' ? new Date(prop.date.start).toISOString().slice(0, 16) + ':00.000Z' : String(prop.date.start).slice(0, 10)) : null;
    case 'select': return back(prop.select?.name);
    case 'status': return back(prop.status?.name);
    case 'multi_select': {
      const vals = (prop.multi_select ?? []).map((o: any) => back(o.name)).filter((x: unknown) => x !== undefined && x !== null);
      return f.canon === 'enums' ? vals : vals[0] ?? null;
    }
    case 'people': { const p = prop.people?.[0]; return p ? (await ctx.crmUser(p.id)) ?? undefined : null; }
    case 'relation': {
      const ids: string[] = [];
      for (const r of prop.relation ?? []) { const id = await ctx.recordOf(f.target!, r.id); if (id) ids.push(id); }
      return f.canon === 'relations' ? ids : ids[0] ?? null;
    }
    default: return undefined;
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = (v: unknown): unknown => (Array.isArray(v) ? [...v].map(String).sort() : v === undefined || v === '' ? null : v);

// ───────── records ─────────

const MODEL: Record<Kind, any> = {
  testers: prisma.tester, reports: prisma.testerReport, outreach: prisma.betaOutreach, payouts: prisma.betaPayout, calls: prisma.betaCall,
};
const INCLUDE: Partial<Record<Kind, object>> = { payouts: { tester: { select: { name: true } } }, calls: { testers: { select: { testerId: true } } } };

function makeCtx(programId: string): Ctx {
  const pageCache = new Map<string, string | null>(), recCache = new Map<string, string | null>();
  return {
    programId,
    async pageOf(kind, id) {
      const k = `${kind}:${id}`;
      if (!pageCache.has(k)) {
        const r = await MODEL[kind].findFirst({ where: { id, programId }, select: { notionPageId: true } });
        pageCache.set(k, r?.notionPageId && !r.notionPageId.startsWith('gone:') ? r.notionPageId : null);
      }
      return pageCache.get(k)!;
    },
    async recordOf(kind, pageId) {
      const k = `${kind}:${pageId}`;
      if (!recCache.has(k)) {
        const r = await MODEL[kind].findFirst({ where: { notionPageId: pageId, programId }, select: { id: true } });
        recCache.set(k, r?.id ?? null);
      }
      return recCache.get(k)!;
    },
    async notionUser(crmUserId) {
      const u = await prisma.user.findUnique({ where: { id: crmUserId }, select: { email: true } });
      return u ? (await notionPeople()).byEmail.get(u.email.toLowerCase()) ?? null : null;
    },
    async crmUser(notionUserId) {
      const email = (await notionPeople()).byId.get(notionUserId);
      if (!email) return null;
      return (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null;
    },
  };
}

type Board = Awaited<ReturnType<typeof prisma.notionBoard.findFirst>> & {};
const mappedFields = (b: Board) => FIELDS[b.kind as Kind].filter((f) => (b.mapping as unknown as Mapping)[f.key]);
const scopeOf = (b: Board) => (b.scope as { property: string; value: string } | null) ?? null;

/** Who made a change in Notion, as a CRM actor (falls back to "Notion"). */
async function actorFor(row: NotionPage, ctx: Ctx) {
  const id = row.last_edited_by?.id ? await ctx.crmUser(row.last_edited_by.id).catch(() => null) : null;
  if (id) {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } });
    if (u) return { id: u.id, name: u.name, email: u.email, role: u.role as string };
  }
  return { id: 'system', name: 'Notion' };
}

/** The values a Notion row holds for the mapped fields. */
async function readRow(b: Board, row: NotionPage, ctx: Ctx) {
  const vals: Record<string, unknown> = {};
  for (const f of mappedFields(b)) {
    if (f.pushOnly) continue;
    const m = (b.mapping as unknown as Mapping)[f.key];
    const v = await fromNotion(f, m, row.properties?.[m.property], ctx);
    if (v !== undefined) vals[f.key] = v;
  }
  return vals;
}

// ───────── pull ─────────

export interface SyncStats { pulled: number; imported: number; pushed: number; created: number; skipped: number; errors: string[] }

async function applyPulled(kind: Kind, b: Board, rec: any, changed: Record<string, unknown>, actor: any, quiet: boolean) {
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS[kind]) if (f.key in changed && f.put) Object.assign(patch, f.put(changed[f.key], rec));
  if (kind === 'calls' && 'testers' in changed) {
    const ids = (changed.testers as string[]) ?? [];
    await prisma.betaCallTester.deleteMany({ where: { callId: rec.id } });
    if (ids.length) await prisma.betaCallTester.createMany({ data: ids.map((testerId) => ({ callId: rec.id, testerId })), skipDuplicates: true });
  }
  if (!Object.keys(patch).length) return;
  if (kind === 'reports') {
    // Through the workflow, so tasks, "waiting on" and outreach follow a status changed in Notion.
    const { updateReport } = await import('@/lib/betaFlow');
    const body: Record<string, unknown> = { ...patch };
    for (const k of ['occurredAt', 'nextActionDue'] as const) if (k in body) body[k] = body[k] ?? '';
    await updateReport(actor, rec.id, body, { quiet });
    return;
  }
  await MODEL[kind].update({ where: { id: rec.id }, data: patch });
  if (!quiet && kind === 'outreach' && 'outcome' in patch && patch.outcome !== rec.outcome && rec.reportId) {
    const { updateReport } = await import('@/lib/betaFlow');
    if (patch.outcome === 'retest_passed') await updateReport(actor, rec.reportId, { status: 'verified', waitingOnId: null }).catch(() => {});
    if (patch.outcome === 'retest_failed') await updateReport(actor, rec.reportId, { status: 'escalated' }).catch(() => {});
  }
}

/** A row that isn't linked to anything here: match an existing record, or import it. */
async function linkOrImport(kind: Kind, b: Board, row: NotionPage, vals: Record<string, any>, ctx: Ctx, actor: any): Promise<{ id: string; created: boolean } | null> {
  const programId = b.programId;
  const unlinked = { programId, notionPageId: null };
  if (kind === 'testers') {
    if (!vals.name) return null;
    const match = await prisma.tester.findFirst({ where: { ...unlinked, OR: [{ name: { equals: vals.name, mode: 'insensitive' } }, ...(vals.email ? [{ email: vals.email }] : [])] } });
    if (match) return { id: match.id, created: false };
    const { token, hashToken } = await import('@/lib/beta');
    const data: Record<string, unknown> = {};
    for (const f of FIELDS.testers) if (f.key in vals && f.put) Object.assign(data, f.put(vals[f.key], {}));
    if (data.email && (await prisma.tester.findFirst({ where: { programId, email: data.email as string } }))) delete data.email;
    const t = await prisma.tester.create({ data: { name: vals.name, ...data, programId, accessHash: hashToken(token()) } as any });
    return { id: t.id, created: true };
  }
  if (kind === 'calls') {
    if (!vals.title) return null;
    const c = await prisma.betaCall.create({ data: { programId, title: vals.title, date: vals.date ? new Date(vals.date) : new Date(row.last_edited_time), summary: vals.summary ?? null, recordingUrl: vals.recordingUrl ?? null } });
    if (vals.testers?.length) await prisma.betaCallTester.createMany({ data: vals.testers.map((testerId: string) => ({ callId: c.id, testerId })), skipDuplicates: true });
    return { id: c.id, created: true };
  }
  const testerId = vals.tester as string | undefined;
  if (!testerId) return null; // a report, message or payout needs its tester on the testers board first
  if (kind === 'reports') {
    if (!vals.title) return null;
    const match = await prisma.testerReport.findFirst({ where: { ...unlinked, testerId, title: { equals: vals.title, mode: 'insensitive' } } });
    if (match) return { id: match.id, created: false };
    const tester = await prisma.tester.findUnique({ where: { id: testerId }, include: { program: true } });
    if (!tester) return null;
    const { submitReport } = await import('@/lib/beta');
    const r = await submitReport(tester, { kind: vals.kind ?? 'feedback', title: vals.title, body: vals.body || vals.title, claimedSeverity: vals.claimedSeverity ?? vals.severity }, { id: actor.id, name: actor.name ?? 'Notion' });
    // Already on the team's board: don't open a Plain thread (and email the tester) for it.
    await prisma.testerReport.update({ where: { id: r.id }, data: { plainTries: 99, plainError: 'Imported from Notion' } });
    return { id: r.id, created: true };
  }
  if (kind === 'outreach') {
    if (!vals.title) return null;
    const o = await prisma.betaOutreach.create({ data: { programId, testerId, title: vals.title, type: vals.type ?? 'other', status: vals.status ?? 'suggested' } });
    return { id: o.id, created: true };
  }
  if (kind === 'payouts') {
    if (typeof vals.amount !== 'number' || vals.amount <= 0) return null;
    const p = await prisma.betaPayout.create({ data: { programId, testerId, amount: vals.amount, token: vals.token || 'USDC', reason: vals.reason ?? 'other', sentAt: vals.sentAt ? new Date(vals.sentAt) : new Date(row.last_edited_time) } });
    return { id: p.id, created: true };
  }
  return null;
}

async function pull(b: Board, ctx: Ctx, stats: SyncStats) {
  const kind = b.kind as Kind;
  const since = b.pullCursor ? new Date(b.pullCursor.getTime() - 2 * 60_000) : null;
  const scope = scopeOf(b);
  let cursor = b.pullCursor;
  for await (const row of rowsSince(b.dataSourceId, since)) {
    const edited = new Date(row.last_edited_time);
    if (!cursor || edited > cursor) cursor = edited;
    if (row.in_trash || row.archived) continue;
    if (scope) {
      const p = row.properties?.[scope.property];
      const v = p?.select?.name ?? p?.status?.name ?? textOf(p?.rich_text) ?? (p?.multi_select ?? []).map((o: any) => o.name).join(',');
      if (!v || !String(v).split(',').map(norm).includes(norm(scope.value))) continue;
    }
    try {
      const vals = await readRow(b, row, ctx);
      const actor = await actorFor(row, ctx);
      let rec = await MODEL[kind].findFirst({ where: { notionPageId: row.id, programId: b.programId }, include: INCLUDE[kind] });
      if (!rec) {
        const linked = await linkOrImport(kind, b, row, vals, ctx, actor);
        if (!linked) { stats.skipped++; continue; }
        const id = linked.id;
        rec = await MODEL[kind].findUnique({ where: { id }, include: INCLUDE[kind] });
        if (linked.created) stats.imported++;
        // Linking: Notion's values win for this first sync (the row was there first, or was just imported).
        await MODEL[kind].update({ where: { id }, data: { notionPageId: row.id, notionSnapshot: {}, notionDirty: false } });
        rec = { ...rec, notionSnapshot: {} };
      }
      const snap = (rec.notionSnapshot ?? {}) as Record<string, unknown>;
      const firstLink = !Object.keys(snap).length;
      const changed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(vals)) {
        const f = FIELDS[kind].find((x) => x.key === k)!;
        // On the first link an empty Notion cell doesn't erase what the CRM has; push fills it in.
        if (firstLink && (canonical(v) === null || (Array.isArray(v) && !v.length))) continue;
        if (!same(v, snap[k]) && !same(v, f.get(rec))) changed[k] = v;
      }
      if (Object.keys(changed).length) {
        try { await applyPulled(kind, b, rec, changed, actor, firstLink); stats.pulled++; }
        catch (e: any) { stats.errors.push(`${KIND_LABEL[kind]} “${vals.title ?? vals.name ?? row.id}”: ${e?.message ?? e}`); }
      }
      await MODEL[kind].update({ where: { id: rec.id }, data: { notionSnapshot: { ...snap, ...vals } as any, notionEditedAt: edited, notionDirty: undefined } });
    } catch (e: any) {
      stats.errors.push(`${KIND_LABEL[kind]} row ${row.id}: ${e?.message ?? e}`);
    }
  }
  await prisma.notionBoard.update({ where: { id: b.id }, data: { pullCursor: cursor, lastPullAt: new Date() } });
}

// ───────── push ─────────

async function push(b: Board, ctx: Ctx, stats: SyncStats) {
  const kind = b.kind as Kind;
  const recs = await MODEL[kind].findMany({
    where: { programId: b.programId, OR: [{ notionDirty: true }, { notionPageId: null }] },
    include: INCLUDE[kind], orderBy: { createdAt: 'asc' }, take: 200,
  });
  const scope = scopeOf(b);
  for (const rec of recs) {
    if (rec.notionPageId?.startsWith('gone:')) { await MODEL[kind].update({ where: { id: rec.id }, data: { notionDirty: false } }); continue; }
    const snap = (rec.notionSnapshot ?? {}) as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    const wrote: Record<string, unknown> = {};
    let pending = false;
    for (const f of mappedFields(b)) {
      const v = f.get(rec);
      if (v === undefined) continue;
      if (rec.notionPageId && same(v, snap[f.key])) continue;
      if (!rec.notionPageId && (v === null || (Array.isArray(v) && !v.length))) continue;
      const m = (b.mapping as unknown as Mapping)[f.key];
      const val = await toNotion(f, m, v, ctx);
      // A relation whose row isn't on Notion yet is retried; a value Notion can't hold (no such status option,
      // a person who isn't in the workspace) is skipped.
      if (val === undefined) { if (f.canon === 'relation' || f.canon === 'relations') pending = pending || !!(Array.isArray(v) ? v.length : v); continue; }
      props[m.property] = val;
      wrote[f.key] = v;
    }
    if (!rec.notionPageId && scope) {
      const sp = (await getDataSourceCached(b.dataSourceId)).properties[scope.property];
      if (sp) props[scope.property] = sp.type === 'multi_select' ? { multi_select: [{ name: scope.value }] } : sp.type === 'status' ? { status: { name: scope.value } } : sp.type === 'rich_text' ? { rich_text: richText(scope.value) } : { select: { name: scope.value } };
    }
    try {
      if (!rec.notionPageId) {
        const title = mappedFields(b).find((f) => f.canon === 'title');
        if (!title || !props[(b.mapping as unknown as Mapping)[title.key].property]) { pending = true; }
        else {
          const page = await createPage(b.dataSourceId, props);
          await MODEL[kind].update({ where: { id: rec.id }, data: { notionPageId: page.id, notionSnapshot: wrote as any, notionEditedAt: new Date(page.last_edited_time), notionDirty: pending, notionError: null } });
          stats.created++;
          continue;
        }
      } else if (Object.keys(props).length) {
        const page = await updatePage(rec.notionPageId, props);
        stats.pushed++;
        await MODEL[kind].update({ where: { id: rec.id }, data: { notionSnapshot: { ...snap, ...wrote } as any, notionEditedAt: new Date(page.last_edited_time), notionDirty: pending, notionError: null } });
        continue;
      }
      await MODEL[kind].update({ where: { id: rec.id }, data: { notionDirty: pending, notionError: null } });
    } catch (e: any) {
      const gone = e instanceof NotionError && (e.status === 404 || /archived|in trash/i.test(e.message));
      await MODEL[kind].update({
        where: { id: rec.id },
        data: gone ? { notionPageId: `gone:${rec.notionPageId}`, notionDirty: false, notionError: 'Its Notion row was deleted; not recreated.' } : { notionError: String(e?.message ?? e).slice(0, 500), notionDirty: true },
      });
      if (!gone) stats.errors.push(`${KIND_LABEL[kind]}: ${e?.message ?? e}`);
    }
  }
  await prisma.notionBoard.update({ where: { id: b.id }, data: { lastPushAt: new Date() } });
}

const dsCache = new Map<string, { at: number; ds: Awaited<ReturnType<typeof getDataSource>> }>();
async function getDataSourceCached(id: string) {
  const hit = dsCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ds;
  const ds = await getDataSource(id);
  dsCache.set(id, { at: Date.now(), ds });
  return ds;
}

// ───────── entry points ─────────

/** Sync one program's boards (pull then push, in relation order). One run per program at a time. */
export async function syncProgram(programId: string, opts: { pushOnly?: boolean } = {}): Promise<SyncStats | { skipped: string }> {
  const boards = await prisma.notionBoard.findMany({ where: { programId, enabled: true } });
  if (!boards.length) return { skipped: 'no boards' };
  const now = new Date();
  const lock = await prisma.betaProgram.updateMany({
    where: { id: programId, OR: [{ notionLockUntil: null }, { notionLockUntil: { lt: now } }] },
    data: { notionLockUntil: new Date(now.getTime() + 4 * 60_000) },
  });
  if (!lock.count) return { skipped: 'a sync is already running' };
  const stats: SyncStats = { pulled: 0, imported: 0, pushed: 0, created: 0, skipped: 0, errors: [] };
  const ctx = makeCtx(programId);
  try {
    const ordered = KIND_ORDER.map((k) => boards.find((b) => b.kind === k)).filter(Boolean) as Board[];
    if (!opts.pushOnly) for (const b of ordered) {
      try { await pull(b, ctx, stats); } catch (e: any) { stats.errors.push(`${KIND_LABEL[b.kind as Kind]}: ${e?.message ?? e}`); }
    }
    for (const b of ordered) {
      try { await push(b, ctx, stats); } catch (e: any) { stats.errors.push(`${KIND_LABEL[b.kind as Kind]}: ${e?.message ?? e}`); }
    }
    for (const b of ordered) {
      const mine = stats.errors.filter((x) => x.startsWith(KIND_LABEL[b.kind as Kind]));
      await prisma.notionBoard.update({ where: { id: b.id }, data: { lastError: mine.length ? mine.slice(0, 3).join(' · ').slice(0, 1000) : null } });
    }
  } finally {
    await prisma.betaProgram.update({ where: { id: programId }, data: { notionLockUntil: null } });
  }
  return stats;
}

/** Push a program's changes soon (after a report is filed), without waiting for the job. */
export async function pushSoon(programId: string) {
  const { notionConfigured } = await import('@/lib/notion');
  if (!notionConfigured() || !(await prisma.notionBoard.count({ where: { programId, enabled: true } }))) return;
  await syncProgram(programId, { pushOnly: true }).catch((e) => console.error('[notion] push', e));
}

/** Job: every program with a connected board. */
export async function syncAllPrograms() {
  const { notionConfigured } = await import('@/lib/notion');
  if (!notionConfigured()) return { skipped: 'NOTION_TOKEN not set' };
  const ids = [...new Set((await prisma.notionBoard.findMany({ where: { enabled: true }, select: { programId: true } })).map((x) => x.programId))];
  const out: Record<string, unknown> = {};
  for (const id of ids) out[id] = await syncProgram(id).catch((e) => ({ error: String(e?.message ?? e) }));
  return out;
}

/** Fields per kind for the settings page (no functions). */
export const fieldCatalog = () => Object.fromEntries(
  (Object.keys(FIELDS) as Kind[]).map((k) => [k, FIELDS[k].map((f) => ({ key: f.key, label: f.label, canon: f.canon, types: COMPATIBLE[f.canon], options: f.options ?? null, pushOnly: !!f.pushOnly, target: f.target ?? null }))]),
);
export { ALL_STATUSES };
