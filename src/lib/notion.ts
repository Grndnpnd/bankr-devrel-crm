/**
 * Minimal Notion API client (version 2025-09-03: databases hold data sources, rows live in a
 * data source). One internal integration token for the workspace (NOTION_TOKEN); each board is
 * shared with the integration in Notion ("…" → Connections). Calls are spaced to stay under
 * Notion's ~3 requests/second and retried on 429 / 5xx.
 */
const VERSION = '2025-09-03';
const base = () => (process.env.NOTION_API_URL || 'https://api.notion.com/v1').replace(/\/$/, '');
export const notionConfigured = () => !!process.env.NOTION_TOKEN;

export class NotionError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 350;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

export async function notion<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (!notionConfigured()) throw new NotionError('NOTION_TOKEN is not set', 0, 'not_configured');
  for (let attempt = 0; ; attempt++) {
    await throttle();
    let res: Response;
    try {
      res = await fetch(`${base()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      if (attempt < 2) continue;
      throw new NotionError(`Notion didn't answer: ${e?.message ?? e}`, 0, 'network');
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const after = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(after, 30) * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = res.status === 404 ? ' — either the link isn’t a board, or the board isn’t shared with the CRM’s Notion integration yet (on the board: … → Connections → add it).' : '';
      throw new NotionError(`${data?.message ?? `Notion error ${res.status}`}${hint}`, res.status, data?.code);
    }
    return data as T;
  }
}

/** The 32-hex id in a Notion link (or a bare id), as a dashed UUID. */
export function notionIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?![0-9a-f])/i);
  if (!m) return null;
  const h = m[1].replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface NotionProperty {
  id: string; name: string; type: string;
  select?: { options: { name: string }[] }; status?: { options: { name: string }[] }; multi_select?: { options: { name: string }[] };
  relation?: { data_source_id?: string; database_id?: string };
}
export interface DataSource { id: string; title?: { plain_text: string }[]; properties: Record<string, NotionProperty>; parent?: { database_id?: string } }
export interface NotionPage {
  id: string; url?: string; last_edited_time: string; last_edited_by?: { id: string }; in_trash?: boolean; archived?: boolean;
  properties: Record<string, any>;
}

/** A pasted board link → its database and first data source (with the property schema). */
export async function resolveBoard(link: string) {
  const id = notionIdFrom(link);
  if (!id) throw new NotionError('That isn’t a Notion board link. In Notion, open the board as a full page, click Share → Copy link, and paste that here (it looks like https://www.notion.so/…/Board-name-1a2b3c…).', 400);
  let databaseId = id, dataSourceId: string;
  try {
    const db = await notion<{ id: string; title?: { plain_text: string }[]; url?: string; data_sources?: { id: string; name: string }[] }>('GET', `/databases/${id}`);
    if (!db.data_sources?.length) throw new NotionError('That database has no data sources.', 400);
    dataSourceId = db.data_sources[0].id;
  } catch (e) {
    // The link may already point at a data source (Manage data sources → Copy data source ID).
    if (!(e instanceof NotionError) || e.status !== 404) throw e;
    dataSourceId = id;
  }
  const ds = await notion<DataSource>('GET', `/data_sources/${dataSourceId}`);
  databaseId = ds.parent?.database_id ?? databaseId;
  const title = (ds.title ?? []).map((t) => t.plain_text).join('') || 'Untitled board';
  return { databaseId, dataSourceId, title, url: `https://www.notion.so/${databaseId.replace(/-/g, '')}`, properties: ds.properties };
}

export const getDataSource = (id: string) => notion<DataSource>('GET', `/data_sources/${id}`);

/** Rows edited since `since` (all rows when null), oldest edit first. */
export async function* rowsSince(dataSourceId: string, since: Date | null, max = 1000) {
  let cursor: string | undefined;
  let seen = 0;
  do {
    const page = await notion<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>('POST', `/data_sources/${dataSourceId}/query`, {
      page_size: 100,
      ...(since ? { filter: { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since.toISOString() } } } : {}),
      sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const r of page.results) { if (seen++ >= max) return; yield r; }
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);
}

export const createPage = (dataSourceId: string, properties: Record<string, unknown>) =>
  notion<NotionPage>('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: dataSourceId }, properties });
export const updatePage = (pageId: string, properties: Record<string, unknown>) => notion<NotionPage>('PATCH', `/pages/${pageId}`, { properties });
export const trashPage = (pageId: string) => notion('PATCH', `/pages/${pageId}`, { in_trash: true });

/** The integration's own bot user (to skip our own edits when pulling). */
let botId: string | null = null;
export async function notionBotId() {
  if (!botId) botId = (await notion<{ id: string }>('GET', '/users/me')).id;
  return botId;
}

/** Workspace people with emails (for People properties). Cached a few minutes. */
let peopleCache: { at: number; byEmail: Map<string, string>; byId: Map<string, string> } | null = null;
export async function notionPeople() {
  if (peopleCache && Date.now() - peopleCache.at < 5 * 60_000) return peopleCache;
  const byEmail = new Map<string, string>(), byId = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const r = await notion<{ results: any[]; has_more: boolean; next_cursor: string | null }>('GET', `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    for (const u of r.results) {
      const email = u?.person?.email?.toLowerCase();
      if (u.type === 'person' && email) { byEmail.set(email, u.id); byId.set(u.id, email); }
    }
    cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
  } while (cursor);
  peopleCache = { at: Date.now(), byEmail, byId };
  return peopleCache;
}
