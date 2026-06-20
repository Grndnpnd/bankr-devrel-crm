/**
 * Plain GraphQL client for backfill + reconciliation. Pages through ALL threads via the
 * Relay `threads` connection and upserts them into the same tables the webhook feeds, then
 * pulls each thread's timeline for messages. Reuses upsertThreadFromPayload so thread
 * mapping lives in ONE place (the webhook is the live path; this is the catch-up path).
 *
 * Endpoint + auth per Plain docs: POST https://core-api.uk.plain.com/graphql/v1,
 * Authorization: Bearer <PLAIN_API_KEY>. Dates come as { iso8601 }.
 */

const PLAIN_GQL = process.env.PLAIN_API_URL || "https://core-api.uk.plain.com/graphql/v1";

async function plainQuery<T = any>(query: string, variables: Record<string, any>): Promise<T> {
  const key = process.env.PLAIN_API_KEY;
  if (!key) throw new Error("PLAIN_API_KEY not set");
  const res = await fetch(PLAIN_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Plain GQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Plain GQL error: ${json.errors[0]?.message ?? "unknown"}`);
  return json.data as T;
}

// The thread node shape mirrors the webhook payload's `thread` object, so the same
// upsert mapper handles both. We request the fields the dashboard needs.
const THREAD_FIELDS = `
  id
  externalId
  title
  previewText
  status
  statusDetail { ... on ThreadStatusDetail { __typename } }
  priority
  createdAt { iso8601 }
  statusChangedAt { iso8601 }
  assignedToUser { id fullName publicName }
  assignedToMachineUser { id fullName publicName }
  labels { labelType { name } }
  customer { id email { email } externalId fullName shortName }
  firstInboundMessageInfo { timestamp { iso8601 } }
  firstOutboundMessageInfo { timestamp { iso8601 } }
  lastInboundMessageInfo { timestamp { iso8601 } }
  lastOutboundMessageInfo { timestamp { iso8601 } }
`;

const THREADS_QUERY = `
  query Threads($first: Int!, $after: String) {
    threads(first: $first, after: $after) {
      edges { node { ${THREAD_FIELDS} } cursor }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/**
 * Normalize a GraphQL thread node into the same shape upsertThreadFromPayload expects
 * (the webhook gives nested timestamp objects and inline assignee; GQL is close but the
 * assignee fields are split, so flatten them here).
 */
function normalizeThreadNode(n: any): any {
  const assignee =
    n.assignedToUser ? { id: n.assignedToUser.id, fullName: n.assignedToUser.fullName ?? n.assignedToUser.publicName, __kind: "user" }
    : n.assignedToMachineUser ? { id: n.assignedToMachineUser.id, fullName: n.assignedToMachineUser.fullName ?? n.assignedToMachineUser.publicName, description: "", __kind: "machineUser" }
    : null;
  return {
    id: n.id,
    externalId: n.externalId ?? null,
    title: n.title ?? null,
    previewText: n.previewText ?? null,
    status: n.status ?? null,
    statusDetail: n.statusDetail ? { type: n.statusDetail.__typename ?? null } : null,
    priority: n.priority,
    createdAt: n.createdAt?.iso8601 ?? null,
    statusChangedAt: n.statusChangedAt?.iso8601 ?? null,
    assignee,
    labels: n.labels ?? [],
    customer: n.customer ?? null,
    firstInboundMessageInfo: n.firstInboundMessageInfo?.timestamp ? { timestamp: n.firstInboundMessageInfo.timestamp.iso8601 } : null,
    firstOutboundMessageInfo: n.firstOutboundMessageInfo?.timestamp ? { timestamp: n.firstOutboundMessageInfo.timestamp.iso8601 } : null,
    lastInboundMessageInfo: n.lastInboundMessageInfo?.timestamp ? { timestamp: n.lastInboundMessageInfo.timestamp.iso8601 } : null,
    lastOutboundMessageInfo: n.lastOutboundMessageInfo?.timestamp ? { timestamp: n.lastOutboundMessageInfo.timestamp.iso8601 } : null,
  };
}

export interface ThreadPage { nodes: any[]; hasNextPage: boolean; endCursor: string | null }

/** Fetch one page of threads (normalized). */
export async function fetchThreadPage(first: number, after: string | null): Promise<ThreadPage> {
  const data = await plainQuery<{ threads: { edges: { node: any }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
    THREADS_QUERY, { first: Math.min(Math.max(first, 1), 100), after }
  );
  const edges = data?.threads?.edges ?? [];
  return {
    nodes: edges.map((e) => normalizeThreadNode(e.node)),
    hasNextPage: !!data?.threads?.pageInfo?.hasNextPage,
    endCursor: data?.threads?.pageInfo?.endCursor ?? null,
  };
}

// ── Timeline (messages) for a single thread ───────────────────────────────────
const TIMELINE_QUERY = `
  query Timeline($threadId: ID!, $first: Int!, $after: String) {
    thread(threadId: $threadId) {
      id
      timelineEntries(first: $first, after: $after) {
        edges {
          node {
            id
            timestamp { iso8601 }
            actor { __typename ... on UserActor { userId } ... on CustomerActor { customerId } ... on MachineUserActor { machineUserId } }
            entry {
              __typename
              ... on EmailEntry { textContent }
              ... on ChatEntry { text }
              ... on SlackMessageEntry { text }
              ... on NoteEntry { text }
            }
          }
          cursor
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export interface TimelineMessage { id: string; direction: string; channel: string | null; authorType: string | null; authorId: string | null; body: string | null; occurredAt: string }

const ENTRY_CHANNEL: Record<string, string> = {
  EmailEntry: "EMAIL", ChatEntry: "CHAT", SlackMessageEntry: "SLACK", NoteEntry: null as any,
};

/** Fetch ALL timeline messages for a thread (paged). Returns normalized messages. */
export async function fetchThreadMessages(threadId: string, pageSize = 50, maxPages = 20): Promise<TimelineMessage[]> {
  const out: TimelineMessage[] = [];
  let after: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const data: any = await plainQuery(TIMELINE_QUERY, { threadId, first: pageSize, after });
    const tl = data?.thread?.timelineEntries;
    const edges = tl?.edges ?? [];
    for (const e of edges) {
      const node = e.node;
      const typename: string = node?.entry?.__typename ?? "";
      const body = node?.entry?.textContent ?? node?.entry?.text ?? null;
      if (body == null && typename !== "NoteEntry") continue; // skip non-message entries (status changes, etc.)
      const actorType = node?.actor?.__typename === "CustomerActor" ? "customer"
        : node?.actor?.__typename === "MachineUserActor" ? "machineUser"
        : node?.actor?.__typename === "UserActor" ? "user" : "system";
      const direction = typename === "NoteEntry" ? "note" : actorType === "customer" ? "inbound" : "outbound";
      out.push({
        id: node.id,
        direction,
        channel: ENTRY_CHANNEL[typename] ?? null,
        authorType: actorType,
        authorId: node?.actor?.userId ?? node?.actor?.customerId ?? node?.actor?.machineUserId ?? null,
        body,
        occurredAt: node?.timestamp?.iso8601 ?? new Date().toISOString(),
      });
    }
    if (!tl?.pageInfo?.hasNextPage) break;
    after = tl.pageInfo.endCursor;
  }
  return out;
}

// ── Reconcile runner ──────────────────────────────────────────────────────────
import { upsertThreadFromPayload } from "@/lib/plainSync";
import { prisma } from "@/lib/prisma";

// Map a normalized-thread channel-less upsert: backfill threads don't carry an event
// type, so channel is set from the messages we pull (the first message's channel wins).
async function storeMessages(threadId: string, msgs: TimelineMessage[]): Promise<string | null> {
  let channel: string | null = null;
  for (const m of msgs) {
    if (!channel && m.channel) channel = m.channel;
    await prisma.supportMessage.upsert({
      where: { id: m.id },
      create: { id: m.id, threadId, direction: m.direction, channel: m.channel, authorType: m.authorType, authorId: m.authorId, body: m.body, occurredAt: new Date(m.occurredAt) },
      update: { direction: m.direction, channel: m.channel, authorType: m.authorType, authorId: m.authorId, body: m.body, occurredAt: new Date(m.occurredAt) },
    }).catch(() => {});
  }
  return channel;
}

export interface ReconcileResult { pagesScanned: number; threadsUpserted: number; messagesUpserted: number; completed: boolean; cursor: string | null }

/**
 * Reconcile a batch of threads from Plain into our tables. Resumable via a cursor stored
 * in CoreJobState.lastResult so each cron tick advances through history without redoing
 * work; once it reaches the end it loops back to the start on the next run (catching any
 * new/changed threads + webhook gaps). Bounded per-run so a single tick stays fast.
 */
export async function reconcilePlain(opts?: { maxPagesPerRun?: number; pageSize?: number; withMessages?: boolean }): Promise<ReconcileResult> {
  const maxPages = opts?.maxPagesPerRun ?? 5;       // ~5 pages * 100 = 500 threads per tick
  const pageSize = opts?.pageSize ?? 100;
  const withMessages = opts?.withMessages ?? true;

  // Resume from where we left off (cursor persisted on the core job state).
  const state = await prisma.coreJobState.findUnique({ where: { type: "plain_reconcile" } });
  let after: string | null = (state?.lastResult as any)?.cursor ?? null;

  let pages = 0, threadsUpserted = 0, messagesUpserted = 0, completed = false;

  for (let i = 0; i < maxPages; i++) {
    const page = await fetchThreadPage(pageSize, after);
    pages++;
    for (const node of page.nodes) {
      await upsertThreadFromPayload(node);  // no eventType → channel left for messages to set
      threadsUpserted++;
      if (withMessages) {
        try {
          const msgs = await fetchThreadMessages(node.id);
          const ch = await storeMessages(node.id, msgs);
          messagesUpserted += msgs.length;
          // If we learned a channel from messages and the thread has none, set it.
          if (ch) await prisma.supportThread.update({ where: { id: node.id }, data: { channel: ch } }).catch(() => {});
        } catch { /* a single thread's timeline failing shouldn't abort the run */ }
      }
    }
    after = page.endCursor;
    if (!page.hasNextPage) { completed = true; after = null; break; } // reached the end → reset cursor
  }

  return { pagesScanned: pages, threadsUpserted, messagesUpserted, completed, cursor: after };
}
