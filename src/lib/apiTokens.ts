/**
 * Personal access tokens: how a person's Claude (the MCP connector, scripts, scheduled
 * tasks) acts as them. Only a SHA-256 of each token is stored; the token is shown once.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { SessionUser, Role } from '@/lib/auth';

export const TOKEN_PREFIX = 'ahub_';
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export async function createApiToken(userId: string, name: string) {
  const token = TOKEN_PREFIX + randomBytes(24).toString('base64url');
  const row = await prisma.apiToken.create({
    data: { userId, name: name.trim().slice(0, 80) || 'Claude', prefix: token.slice(0, 12), tokenHash: hash(token) },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  return { ...row, token };
}

/** Resolve a bearer token to its active user, or null. */
export async function userFromToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, active: true } } },
  });
  if (!row || row.revokedAt || !row.user.active) return null;
  // Touch at most once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role as Role };
}

export function bearerFrom(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** The caller: a bearer token (Claude, scripts) or the session cookie. */
export async function requestUser(req: Request): Promise<SessionUser | null> {
  const bearer = bearerFrom(req);
  if (bearer) return userFromToken(bearer);
  const { getSession } = await import('@/lib/auth');
  return getSession();
}
