/**
 * Plain API client (GraphQL). One machine-user key, PLAIN_API_KEY, with only the permissions
 * the CRM uses (see PLAIN_PERMISSIONS). Everything here is a no-op error when no key is set,
 * so callers can treat Plain as optional.
 *
 * Env:
 *   PLAIN_API_KEY          machine user API key
 *   PLAIN_HMAC_SECRET      Settings → Request signing in Plain (signs webhooks and customer cards);
 *                          PLAIN_WEBHOOK_SECRET is read as a fallback
 *   PLAIN_CHAT_APP_ID      chat app id, for the tester portal's live chat
 *   PLAIN_CHAT_SECRET      chat app secret, signs tester identities for the chat widget
 *   PLAIN_API_URL          override for tests
 */
import crypto from 'node:crypto';

const API = () => process.env.PLAIN_API_URL || 'https://core-api.uk.plain.com/graphql/v1';

export const PLAIN_PERMISSIONS = [
  'customer:read', 'customer:create', 'customer:edit',
  'thread:read', 'thread:create', 'thread:edit', 'thread:reply',
  'threadEvent:create', 'threadEvent:read', 'timeline:read', 'labelType:read', 'workspace:read',
];

/** Customer card keys served by /api/plain/cards (one card per key in Plain's settings). */
export const CARD_KEYS = ['crm-beta', 'crm-tasks'] as const;

export const plainConfigured = () => !!process.env.PLAIN_API_KEY;
export const plainHmacSecret = () => process.env.PLAIN_HMAC_SECRET || process.env.PLAIN_WEBHOOK_SECRET || '';
export const plainChatConfigured = () => !!(process.env.PLAIN_CHAT_APP_ID && process.env.PLAIN_CHAT_SECRET);
export const plainThreadUrl = (threadId: string) => `https://app.plain.com/workspace/${process.env.PLAIN_WORKSPACE_ID || '_'}/thread/${threadId}`;

export class PlainError extends Error {
  constructor(message: string, public code?: string, public retriable = true) { super(message); }
}

export async function plainGql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.PLAIN_API_KEY;
  if (!key) throw new PlainError('PLAIN_API_KEY not set', 'not_configured', false);
  let res: Response;
  try {
    res = await fetch(API(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e: any) {
    throw new PlainError(`Plain unreachable: ${e?.message ?? e}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 401/403 won't fix themselves; 429 and 5xx will.
    throw new PlainError(`Plain HTTP ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`, `http_${res.status}`, res.status === 429 || res.status >= 500);
  }
  const json = await res.json();
  if (json.errors?.length) throw new PlainError(`Plain: ${json.errors[0]?.message ?? 'error'}`, json.errors[0]?.extensions?.code, false);
  return json.data as T;
}

const ERR = 'error { message type code fields { field message type } }';

/** Run a mutation and unwrap its `error` field into a thrown PlainError. */
async function mutate<T = any>(name: string, inputType: string, select: string, input: unknown): Promise<T> {
  const data = await plainGql(`mutation ${name}($input: ${inputType}!) { ${name}(input: $input) { ${select} ${ERR} } }`, { input });
  const out = data?.[name];
  if (out?.error) {
    const e = out.error;
    const detail = e.fields?.length ? ` (${e.fields.map((f: any) => `${f.field}: ${f.message}`).join('; ')})` : '';
    // Validation and permission errors repeat on retry; internal ones may not.
    throw new PlainError(`${e.message}${detail}`, e.code, e.type === 'INTERNAL');
  }
  return out as T;
}

// ───────── customers and threads ─────────

export async function upsertPlainCustomer(c: { email: string; fullName: string; shortName?: string }): Promise<string> {
  const out = await mutate('upsertCustomer', 'UpsertCustomerInput', 'result customer { id }', {
    identifier: { emailAddress: c.email },
    // An existing Plain customer keeps their name; a new one gets the name they joined with.
    onCreate: { email: { email: c.email, isVerified: false }, fullName: c.fullName, ...(c.shortName ? { shortName: c.shortName } : {}) },
    onUpdate: {},
  });
  return out.customer.id;
}

export type PlainComponent = Record<string, unknown>;
export const text = (t: string, opts: { color?: 'NORMAL' | 'MUTED' | 'SUCCESS' | 'WARNING' | 'ERROR'; size?: 'S' | 'M' | 'L' } = {}): PlainComponent =>
  ({ componentText: { text: t.slice(0, 10_000), ...(opts.color ? { textColor: opts.color } : {}), ...(opts.size ? { textSize: opts.size } : {}) } });
export const plainText = (t: string, color?: 'NORMAL' | 'MUTED'): PlainComponent =>
  ({ componentPlainText: { plainText: t.slice(0, 10_000), ...(color ? { plainTextColor: color } : {}) } });
export const spacer = (size: 'XS' | 'S' | 'M' = 'S'): PlainComponent => ({ componentSpacer: { spacerSize: size } });
export const divider = (): PlainComponent => ({ componentDivider: { dividerSpacingSize: 'M' } });
export const badge = (label: string, color: 'GREY' | 'GREEN' | 'YELLOW' | 'RED' | 'BLUE' = 'GREY'): PlainComponent =>
  ({ componentBadge: { badgeLabel: label.slice(0, 500), badgeColor: color } });
export const linkButton = (label: string, url: string): PlainComponent => ({ componentLinkButton: { linkButtonLabel: label.slice(0, 500), linkButtonUrl: url } });
export const row = (main: PlainComponent[], aside: PlainComponent[] = []): PlainComponent => ({ componentRow: { rowMainContent: main, rowAsideContent: aside } });

export interface NewThread {
  customerId: string; title: string; externalId: string; priority: number;
  components: PlainComponent[]; labelTypeIds?: string[]; description?: string;
}

/** Create an API-channel thread, or return the one already made for this externalId. */
export async function createPlainThread(t: NewThread): Promise<string> {
  const existing = await plainGql<{ threadByExternalId: { id: string } | null }>(
    'query($customerId: ID!, $externalId: ID!) { threadByExternalId(customerId: $customerId, externalId: $externalId) { id } }',
    { customerId: t.customerId, externalId: t.externalId },
  ).catch(() => null);
  if (existing?.threadByExternalId?.id) return existing.threadByExternalId.id;
  const out = await mutate('createThread', 'CreateThreadInput', 'thread { id }', {
    customerIdentifier: { customerId: t.customerId },
    title: t.title.slice(0, 250),
    externalId: t.externalId,
    priority: Math.min(3, Math.max(0, t.priority)),
    components: t.components,
    ...(t.description ? { description: t.description.slice(0, 500) } : {}),
    ...(t.labelTypeIds?.length ? { labelTypeIds: t.labelTypeIds } : {}),
  });
  return out.thread.id;
}

/** A reply from the team. On an API thread with no messages yet, Plain sends it to the customer by email. */
export async function replyOnPlainThread(threadId: string, body: string, markdown?: string) {
  await mutate('replyToThread', 'ReplyToThreadInput', '', { threadId, textContent: body.slice(0, 10_000), ...(markdown ? { markdownContent: markdown.slice(0, 10_000) } : {}) });
}

/** Something that happened outside Plain, shown in the thread's timeline. */
export async function addPlainThreadEvent(threadId: string, title: string, components: PlainComponent[], externalId?: string): Promise<string | null> {
  const out = await mutate('createThreadEvent', 'CreateThreadEventInput', 'threadEvent { id }', {
    threadId, title: title.slice(0, 200), components, ...(externalId ? { externalId } : {}),
  });
  return out?.threadEvent?.id ?? null;
}

export async function markPlainThreadTodo(threadId: string) {
  await mutate('markThreadAsTodo', 'MarkThreadAsTodoInput', 'thread { id }', { threadId, statusDetail: 'NEW_REPLY' });
}

export async function plainLabelTypes(): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let after: string | null = null;
  for (let i = 0; i < 5; i++) {
    const d: any = await plainGql(
      'query($first: Int, $after: String) { labelTypes(first: $first, after: $after, filters: { isArchived: false }) { edges { node { id name } } pageInfo { hasNextPage endCursor } } }',
      { first: 100, after },
    );
    for (const e of d?.labelTypes?.edges ?? []) out.push({ id: e.node.id, name: e.node.name });
    if (!d?.labelTypes?.pageInfo?.hasNextPage) break;
    after = d.labelTypes.pageInfo.endCursor;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function plainWorkspace(): Promise<{ id: string; name: string }> {
  const d = await plainGql<{ myWorkspace: { id: string; name: string } }>('query { myWorkspace { id name } }');
  return d.myWorkspace;
}

// ───────── signatures ─────────

/** Plain-Request-Signature: hex HMAC-SHA256 of the raw body with the workspace secret. */
export function verifyPlainRequest(rawBody: string, header: string | null, secret = plainHmacSecret()): boolean {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const provided = header.trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/** The chat widget's customerDetailsSignature for a known email (no extra identifiers). */
export function chatSignature(email: string, secret = process.env.PLAIN_CHAT_SECRET || '') {
  return crypto.createHmac('sha256', secret).update(email).digest('hex');
}
