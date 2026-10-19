/**
 * Artifacts: HTML pages (Claude artifacts, dashboards, docs) with version history,
 * per-user sharing, and a document store that mirrors claude.ai's `db` capability.
 *
 * Access levels use claude.ai's words so imported pages behave the same here:
 *   view < interact < admin < owner
 * owner = the artifact's owner; admin = shared at EDIT; interact = shared at INTERACT;
 * view = shared at VIEW, or any active user when visibility is TEAM.
 */
import { createHash } from 'node:crypto';
import type { Artifact, ArtifactLevel, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type Level = 'view' | 'interact' | 'admin' | 'owner';
const RANK: Record<Level, number> = { view: 1, interact: 2, admin: 3, owner: 4 };
export const atLeast = (have: Level | null, need: Level) => !!have && RANK[have] >= RANK[need];

const SHARE_LEVEL: Record<ArtifactLevel, Level> = { VIEW: 'view', INTERACT: 'interact', EDIT: 'admin' };

export interface Viewer { id: string; email?: string; name?: string | null; role?: string }

/** The viewer's level on an artifact, or null when they cannot open it. */
export async function levelFor(artifact: Pick<Artifact, 'id' | 'ownerId' | 'visibility'>, viewer: Viewer): Promise<Level | null> {
  if (artifact.ownerId === viewer.id) return 'owner';
  const share = await prisma.artifactShare.findUnique({
    where: { artifactId_userId: { artifactId: artifact.id, userId: viewer.id } },
    select: { level: true },
  });
  if (share) return SHARE_LEVEL[share.level];
  return artifact.visibility === 'TEAM' ? 'view' : null;
}

/** Load an artifact the viewer can open, with their level. */
export async function openArtifact(id: string, viewer: Viewer) {
  const artifact = await prisma.artifact.findUnique({ where: { id } });
  if (!artifact) return null;
  const level = await levelFor(artifact, viewer);
  if (!level) return null;
  return { artifact, level };
}

export type ListScope = 'all' | 'mine' | 'shared' | 'team';

/** Artifacts the viewer can open, newest first, without HTML. */
export async function listArtifacts(viewer: Viewer, opts: { scope?: ListScope; q?: string; tag?: string; take?: number } = {}) {
  const scope = opts.scope ?? 'all';
  const ors: Prisma.ArtifactWhereInput[] = [];
  if (scope === 'all' || scope === 'mine') ors.push({ ownerId: viewer.id });
  if (scope === 'all' || scope === 'shared') ors.push({ shares: { some: { userId: viewer.id } } });
  if (scope === 'all' || scope === 'team') ors.push({ visibility: 'TEAM', NOT: { ownerId: viewer.id } });
  const and: Prisma.ArtifactWhereInput[] = [{ OR: ors }];
  if (opts.q) {
    and.push({ OR: [
      { title: { contains: opts.q, mode: 'insensitive' } },
      { description: { contains: opts.q, mode: 'insensitive' } },
      { tags: { has: opts.q.toLowerCase() } },
    ] });
  }
  if (opts.tag) and.push({ tags: { has: opts.tag } });
  const rows = await prisma.artifact.findMany({
    where: { AND: and },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(opts.take ?? 200, 500),
    select: {
      id: true, title: true, description: true, kind: true, tags: true, currentVersion: true,
      sourceUrl: true, visibility: true, ownerId: true, createdAt: true, updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      shares: { where: { userId: viewer.id }, select: { level: true } },
    },
  });
  return rows.map(({ shares, ...r }) => ({
    ...r,
    level: (r.ownerId === viewer.id ? 'owner' : shares[0] ? SHARE_LEVEL[shares[0].level] : 'view') as Level,
    relation: r.ownerId === viewer.id ? 'mine' : shares[0] ? 'shared' : 'team',
  }));
}

/** Pull a <title> from the page when none is given. */
export function titleFromHtml(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  return m ? m[1].trim() : null;
}

export const MAX_HTML_BYTES = 16 * 1024 * 1024;

export interface CreateInput {
  title?: string;
  html: string;
  description?: string | null;
  kind?: string;
  tags?: string[];
  sourceUrl?: string | null;
  capabilities?: unknown;
  visibility?: 'PRIVATE' | 'TEAM';
  note?: string;
}

const normTags = (tags?: string[]) =>
  Array.from(new Set((tags ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))).slice(0, 20);

export async function createArtifact(viewer: Viewer, input: CreateInput) {
  if (!input.html?.trim()) throw new Error('html is required');
  if (Buffer.byteLength(input.html) > MAX_HTML_BYTES) throw new Error('html is over 16 MB');
  const title = input.title?.trim() || titleFromHtml(input.html) || 'Untitled artifact';
  return prisma.artifact.create({
    data: {
      title,
      html: input.html,
      description: input.description ?? null,
      kind: input.kind || 'page',
      tags: normTags(input.tags),
      sourceUrl: input.sourceUrl ?? null,
      capabilities: (input.capabilities ?? undefined) as Prisma.InputJsonValue | undefined,
      visibility: input.visibility ?? 'PRIVATE',
      ownerId: viewer.id,
      versions: { create: { version: 1, html: input.html, note: input.note ?? 'Created', createdById: viewer.id } },
    },
  });
}

export interface UpdateInput {
  title?: string;
  html?: string;
  description?: string | null;
  kind?: string;
  tags?: string[];
  sourceUrl?: string | null;
  capabilities?: unknown;
  visibility?: 'PRIVATE' | 'TEAM';
  note?: string;
}

/** Update metadata; new HTML becomes the next version. Needs admin (metadata) or owner (visibility). */
export async function updateArtifact(id: string, viewer: Viewer, level: Level, input: UpdateInput) {
  if (!atLeast(level, 'admin')) throw new Error('not allowed to edit this artifact');
  if (input.visibility && level !== 'owner') throw new Error('only the owner can change visibility');
  const data: Prisma.ArtifactUpdateInput = {};
  if (input.title !== undefined) data.title = input.title.trim() || 'Untitled artifact';
  if (input.description !== undefined) data.description = input.description;
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.tags !== undefined) data.tags = normTags(input.tags);
  if (input.sourceUrl !== undefined) data.sourceUrl = input.sourceUrl;
  if (input.capabilities !== undefined) data.capabilities = input.capabilities as Prisma.InputJsonValue;
  if (input.visibility !== undefined) data.visibility = input.visibility;

  if (input.html !== undefined) {
    if (!input.html.trim()) throw new Error('html is empty');
    if (Buffer.byteLength(input.html) > MAX_HTML_BYTES) throw new Error('html is over 16 MB');
    return prisma.$transaction(async (tx) => {
      const cur = await tx.artifact.findUniqueOrThrow({ where: { id }, select: { currentVersion: true, html: true } });
      if (cur.html === input.html) return tx.artifact.update({ where: { id }, data });
      const next = cur.currentVersion + 1;
      await tx.artifactVersion.create({ data: { artifactId: id, version: next, html: input.html!, note: input.note ?? null, createdById: viewer.id } });
      return tx.artifact.update({ where: { id }, data: { ...data, html: input.html, currentVersion: next } });
    });
  }
  return prisma.artifact.update({ where: { id }, data });
}

/** Make an old version current again (as a new version, so history is never lost). */
export async function restoreVersion(id: string, viewer: Viewer, level: Level, version: number) {
  const v = await prisma.artifactVersion.findUnique({ where: { artifactId_version: { artifactId: id, version } } });
  if (!v) throw new Error(`version ${version} not found`);
  return updateArtifact(id, viewer, level, { html: v.html, note: `Restored version ${version}` });
}

export async function setShares(id: string, shares: { userId: string; level: ArtifactLevel }[]) {
  const art = await prisma.artifact.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
  const clean = shares.filter((s) => s.userId && s.userId !== art.ownerId);
  await prisma.$transaction([
    prisma.artifactShare.deleteMany({ where: { artifactId: id, userId: { notIn: clean.map((s) => s.userId) } } }),
    ...clean.map((s) => prisma.artifactShare.upsert({
      where: { artifactId_userId: { artifactId: id, userId: s.userId } },
      update: { level: s.level },
      create: { artifactId: id, userId: s.userId, level: s.level },
    })),
  ]);
}

// ───────────────────────── db store (claude.ai `db` semantics) ─────────────────────────

/** The opaque per-viewer id pages see from user.id() and use under data/users/<id>/. */
export function viewerKey(artifactId: string, userId: string) {
  return 'u' + createHash('sha256').update(`${artifactId}:${userId}`).digest('hex').slice(0, 20);
}

const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;

export function checkPath(path: string, kind: 'doc' | 'collection'): string[] {
  if (typeof path !== 'string' || !path) throw new DbError('invalid_argument', 'path is empty');
  const segs = path.split('/');
  if (segs.length > 16 || Buffer.byteLength(path) > 1000) throw new DbError('invalid_argument', 'path too long');
  for (const s of segs) {
    if (!SEGMENT.test(s) || s === '.' || s === '..' || Buffer.byteLength(s) > 200) {
      throw new DbError('invalid_argument', `bad path segment "${s}"`);
    }
  }
  const even = segs.length % 2 === 0;
  if (kind === 'doc' && !even) throw new DbError('invalid_argument', `document path needs an even number of segments (got ${segs.length})`);
  if (kind === 'collection' && even) throw new DbError('invalid_argument', `collection path needs an odd number of segments (got ${segs.length})`);
  return segs;
}

export class DbError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

interface Rule { path: string; read?: Level; write?: Level }

function rulesOf(capabilities: unknown): Rule[] {
  const rules = (capabilities as any)?.db?.rules;
  return Array.isArray(rules) ? rules.filter((r) => typeof r?.path === 'string') : [];
}

/**
 * Minimum level to read or write a path under the artifact's declared rules.
 * Returns null when the path is a sibling's private `{self}` subtree nobody opened.
 */
export function requiredLevel(capabilities: unknown, segs: string[], action: 'read' | 'write', viewer: string): Level | null {
  const rules = rulesOf(capabilities);
  // Every prefix that holds per-viewer subtrees: data/users, plus any rule ending in /{self}.
  const selfPrefixes = new Set<string>(['data/users']);
  for (const r of rules) if (r.path.endsWith('/{self}')) selfPrefixes.add(r.path.slice(0, -'/{self}'.length));

  for (const prefix of selfPrefixes) {
    const p = prefix.split('/');
    if (segs.length > p.length && p.every((s, i) => s === segs[i]) && segs[p.length] !== viewer) {
      // A sibling's subtree: only a rule declared exactly at the prefix opens it.
      const opener = rules.find((r) => r.path === prefix);
      if (!opener) return null;
      return (action === 'read' ? opener.read : opener.write) ?? null;
    }
  }

  let level: Level = action === 'read' ? 'view' : 'interact';
  let readFloor: Level = 'view';
  const matching = rules
    .map((r) => ({ r, segs: r.path === '' ? [] : r.path.split('/') }))
    .filter(({ segs: rs }) => rs.length <= segs.length && rs.every((s, i) => (s === '{self}' ? segs[i] === viewer : s === segs[i])))
    .sort((a, b) => a.segs.length - b.segs.length);
  for (const { r } of matching) {
    if (action === 'read' && r.read) level = r.read;
    if (action === 'write' && r.write) level = r.write;
    if (r.read) readFloor = r.read;
  }
  // Writing implies reading.
  if (action === 'write' && RANK[readFloor] > RANK[level]) level = readFloor;
  return level;
}

function canAccess(capabilities: unknown, path: string, action: 'read' | 'write', viewer: string, level: Level) {
  const need = requiredLevel(capabilities, path.split('/'), action, viewer);
  return need !== null && atLeast(level, need);
}

export interface DocOut { id: string; path: string; exists: boolean; data?: Record<string, unknown>; version?: number }

type Where = [string, string, unknown];
export interface QuerySpec { where?: Where[]; orderBy?: { field: string; dir?: 'asc' | 'desc' }; limit?: number }

function cmp(a: any, b: any) {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return a < b ? -1 : 1;
}

function matches(data: Record<string, any>, [field, op, value]: Where) {
  const v = data[field];
  switch (op) {
    case '==': return JSON.stringify(v) === JSON.stringify(value);
    case '!=': return JSON.stringify(v) !== JSON.stringify(value);
    case '<': return v !== undefined && v < (value as any);
    case '<=': return v !== undefined && v <= (value as any);
    case '>': return v !== undefined && v > (value as any);
    case '>=': return v !== undefined && v >= (value as any);
    case 'in': return Array.isArray(value) && value.some((x) => JSON.stringify(x) === JSON.stringify(v));
    case 'not-in': return Array.isArray(value) && !value.some((x) => JSON.stringify(x) === JSON.stringify(v));
    case 'array-contains': return Array.isArray(v) && v.some((x) => JSON.stringify(x) === JSON.stringify(value));
    default: throw new DbError('invalid_argument', `unknown operator ${op}`);
  }
}

function deepMerge(base: any, patch: any): any {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function checkBody(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new DbError('invalid_argument', 'document body must be an object');
  if (Buffer.byteLength(JSON.stringify(data)) > 256 * 1024) throw new DbError('invalid_argument', 'document over 256 KiB');
  return data as Record<string, unknown>;
}

const MAX_DOCS = 25_000;

export interface DbCtx { artifactId: string; capabilities: unknown; viewer: string; level: Level }

export async function dbGet(ctx: DbCtx, path: string): Promise<DocOut> {
  const segs = checkPath(path, 'doc');
  const id = segs[segs.length - 1];
  if (!canAccess(ctx.capabilities, path, 'read', ctx.viewer, ctx.level)) return { id, path, exists: false };
  const row = await prisma.artifactDoc.findUnique({ where: { artifactId_path: { artifactId: ctx.artifactId, path } } });
  return row ? { id, path, exists: true, data: row.data as Record<string, unknown>, version: row.version } : { id, path, exists: false };
}

export async function dbQuery(ctx: DbCtx, collection: string, q: QuerySpec = {}): Promise<DocOut[]> {
  checkPath(collection, 'collection');
  if ((q.where?.length ?? 0) > 10) throw new DbError('invalid_argument', 'at most 10 filters');
  const limit = q.limit ?? 1000;
  if (limit < 1 || limit > 1000) throw new DbError('invalid_argument', 'limit must be 1-1000');
  const rows = await prisma.artifactDoc.findMany({
    where: { artifactId: ctx.artifactId, collection },
    orderBy: { docId: 'asc' },
    take: 5000,
  });
  let docs = rows
    .filter((r) => canAccess(ctx.capabilities, r.path, 'read', ctx.viewer, ctx.level))
    .filter((r) => (q.where ?? []).every((w) => matches(r.data as any, w)));
  if (q.orderBy) {
    const { field, dir } = q.orderBy;
    docs = docs.sort((a, b) => cmp((a.data as any)[field], (b.data as any)[field]) * (dir === 'desc' ? -1 : 1));
  }
  return docs.slice(0, limit).map((r) => ({ id: r.docId, path: r.path, exists: true, data: r.data as Record<string, unknown>, version: r.version }));
}

export async function dbSet(ctx: DbCtx, path: string, data: unknown, mode: 'set' | 'update') {
  const segs = checkPath(path, 'doc');
  if (!canAccess(ctx.capabilities, path, 'write', ctx.viewer, ctx.level)) throw new DbError('invalid_argument', 'not allowed to write this path');
  const body = checkBody(data);
  const where = { artifactId_path: { artifactId: ctx.artifactId, path } };
  const existing = await prisma.artifactDoc.findUnique({ where });
  if (mode === 'update') {
    if (!existing) throw new DbError('invalid_argument', 'update needs an existing document');
    const merged = checkBody(deepMerge(existing.data, body));
    await prisma.artifactDoc.update({ where, data: { data: merged as Prisma.InputJsonValue, version: { increment: 1 } } });
    return;
  }
  if (!existing) {
    const count = await prisma.artifactDoc.count({ where: { artifactId: ctx.artifactId } });
    if (count >= MAX_DOCS) throw new DbError('quota_exceeded', `this artifact's database is full (${MAX_DOCS} documents)`);
  }
  await prisma.artifactDoc.upsert({
    where,
    update: { data: body as Prisma.InputJsonValue, version: { increment: 1 } },
    create: {
      artifactId: ctx.artifactId, path, data: body as Prisma.InputJsonValue,
      collection: segs.slice(0, -1).join('/'), docId: segs[segs.length - 1],
    },
  });
}

export async function dbDelete(ctx: DbCtx, path: string) {
  checkPath(path, 'doc');
  if (!canAccess(ctx.capabilities, path, 'write', ctx.viewer, ctx.level)) throw new DbError('invalid_argument', 'not allowed to write this path');
  await prisma.artifactDoc.deleteMany({ where: { artifactId: ctx.artifactId, path } });
}

export async function dbAcquire(ctx: DbCtx, path: string, opts: { holder: string; ttlMs?: number; data?: unknown }) {
  const segs = checkPath(path, 'doc');
  if (!canAccess(ctx.capabilities, path, 'write', ctx.viewer, ctx.level)) throw new DbError('invalid_argument', 'not allowed to write this path');
  const ttl = Math.min(600_000, Math.max(1000, opts.ttlMs || 30_000));
  const now = new Date();
  const where = { artifactId_path: { artifactId: ctx.artifactId, path } };
  const existing = await prisma.artifactDoc.findUnique({ where });
  if (existing?.leaseUntil && existing.leaseUntil > now && existing.leaseHolder !== opts.holder) {
    return { acquired: false, expiresAt: existing.leaseUntil.toISOString() };
  }
  const leaseUntil = new Date(now.getTime() + ttl);
  const merged = opts.data ? deepMerge(existing?.data ?? {}, checkBody(opts.data)) : (existing?.data ?? {});
  const row = await prisma.artifactDoc.upsert({
    where,
    update: { data: merged as Prisma.InputJsonValue, leaseHolder: opts.holder, leaseUntil, version: { increment: 1 } },
    create: {
      artifactId: ctx.artifactId, path, data: merged as Prisma.InputJsonValue, leaseHolder: opts.holder, leaseUntil,
      collection: segs.slice(0, -1).join('/'), docId: segs[segs.length - 1],
    },
  });
  return { acquired: true, version: row.version, expiresAt: leaseUntil.toISOString(), holder: opts.holder };
}
