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
  if (!res.ok) {
    // Include the response body — GraphQL 400s name the exact offending field, which is
    // far more useful than a bare status when validating the query against the schema.
    const body = await res.text().catch(() => "");
    const hint = body ? ` — ${body.slice(0, 300)}` : "";
    throw new Error(`Plain GQL HTTP ${res.status}${hint}`);
  }
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Plain GQL error: ${json.errors[0]?.message ?? "unknown"}`);
  return json.data as T;
}

// Thread fields — using ONLY schema-confirmed names. Assignee is a ThreadAssignee union
// (User | MachineUser | System), fetched via inline fragments. statusDetail.type is the
// enum. Timing comes from the *MessageInfo fields (timestamp is a DateTime { iso8601 }).
const THREAD_FIELDS = `
  id
  externalId
  title
  previewText
  status
  priority
  createdAt { iso8601 }
  statusChangedAt { iso8601 }
  assignedTo {
    __typename
    ... on User { id fullName publicName }
    ... on MachineUser { id fullName publicName }
  }
  labels { labelType { name } }
  customer { id externalId fullName shortName email { email } }
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
  // assignedTo is a ThreadAssignee union: User | MachineUser | System
  const at = n.assignedTo;
  const assignee = at && at.id
    ? {
        id: at.id,
        fullName: at.fullName ?? at.publicName ?? null,
        // MachineUser has a description field; User does not — used downstream to tag AI.
        ...(at.__typename === "MachineUser" ? { description: "" } : {}),
        __kind: at.__typename === "MachineUser" ? "machineUser" : "user",
      }
    : null;
  return {
    id: n.id,
    externalId: n.externalId ?? null,
    title: n.title ?? null,
    previewText: n.previewText ?? null,
    status: n.status ?? null,
    statusDetail: null,
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

// ── Timeline (messages) ───────────────────────────────────────────────────────
// IMPORTANT: timelineEntries is CUSTOMER-scoped at the Query root (not nested under
// thread). Each TimelineEntry carries threadId, so we pull the customer's timeline and
// keep entries for the thread we're backfilling. entry is an Entry union; actor an Actor
// union. We fetch the message-bearing entry types.
const TIMELINE_QUERY = `
  query Timeline($customerId: ID!, $first: Int!, $after: String) {
    timelineEntries(customerId: $customerId, first: $first, after: $after) {
      edges {
        node {
          id
          threadId
          timestamp { iso8601 }
          actor {
            __typename
            ... on UserActor { userId }
            ... on CustomerActor { customerId }
            ... on MachineUserActor { machineUserId }
          }
          entry {
            __typename
            ... on EmailEntry { textContent markdownContent }
            ... on ChatEntry { text }
            ... on SlackMessageEntry { text }
            ... on NoteEntry { text markdown }
          }
        }
        cursor
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export interface TimelineMessage { id: string; threadId: string | null; direction: string; channel: string | null; authorType: string | null; authorId: string | null; body: string | null; occurredAt: string }

const ENTRY_CHANNEL: Record<string, string | null> = {
  EmailEntry: "EMAIL", ChatEntry: "CHAT", SlackMessageEntry: "SLACK", NoteEntry: null,
};

/**
 * Fetch a customer's timeline (paged) and return message entries, optionally filtered to a
 * single thread. Customer-scoped per the schema; we filter by threadId in code.
 */
export async function fetchCustomerMessages(customerId: string, threadId: string | null, pageSize = 50, maxPages = 20): Promise<TimelineMessage[]> {
  const out: TimelineMessage[] = [];
  let after: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const data: any = await plainQuery(TIMELINE_QUERY, { customerId, first: pageSize, after });
    const tl = data?.timelineEntries;
    const edges = tl?.edges ?? [];
    for (const e of edges) {
      const node = e.node;
      if (threadId && node?.threadId !== threadId) continue; // keep only this thread's entries
      const typename: string = node?.entry?.__typename ?? "";
      const body = node?.entry?.markdownContent ?? node?.entry?.textContent ?? node?.entry?.text ?? node?.entry?.markdown ?? null;
      if (body == null) continue; // skip non-message entries (status transitions, etc.)
      const actorTypename = node?.actor?.__typename;
      const authorType = actorTypename === "CustomerActor" ? "customer"
        : actorTypename === "MachineUserActor" ? "machineUser"
        : actorTypename === "UserActor" ? "user" : "system";
      const direction = typename === "NoteEntry" ? "note" : authorType === "customer" ? "inbound" : "outbound";
      out.push({
        id: node.id,
        threadId: node?.threadId ?? null,
        direction,
        channel: ENTRY_CHANNEL[typename] ?? null,
        authorType,
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
      if (withMessages && node.customer?.id) {
        try {
          const msgs = await fetchCustomerMessages(node.customer.id, node.id);
          const ch = await storeMessages(node.id, msgs);
          messagesUpserted += msgs.length;
          if (ch) await prisma.supportThread.update({ where: { id: node.id }, data: { channel: ch } }).catch(() => {});
        } catch { /* a single thread's timeline failing shouldn't abort the run */ }
      }
    }
    after = page.endCursor;
    if (!page.hasNextPage) { completed = true; after = null; break; } // reached the end → reset cursor
  }

  return { pagesScanned: pages, threadsUpserted, messagesUpserted, completed, cursor: after };
}
