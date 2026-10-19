/**
 * Supporting files and the signed view path.
 *
 * A rendered page has an opaque origin, so its requests for "gray/s01.jpg" or
 * "positions.json" carry no cookies. The render route therefore sends the viewer to
 * /api/artifacts/:id/s/<token>/index.html, where <token> is a short-lived HMAC for this
 * artifact, viewer and version; relative URLs then resolve under the same signed
 * prefix, and the token alone authorizes reading the page and its files (never data,
 * which still goes through the session-checked bridge).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const TTL_SECONDS = 12 * 60 * 60;

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

export interface ViewGrant { artifactId: string; userId: string; version: number | null; exp: number }

export function signView(artifactId: string, userId: string, version: number | null): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ a: artifactId, u: userId, v: version, e: exp })).toString('base64url');
  const mac = createHmac('sha256', key()).update(`view.${payload}`).digest('base64url').slice(0, 32);
  return `${payload}.${mac}`;
}

export function verifyView(token: string, artifactId: string): ViewGrant | null {
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const want = createHmac('sha256', key()).update(`view.${payload}`).digest('base64url').slice(0, 32);
  const a = Buffer.from(mac); const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (p.a !== artifactId || typeof p.e !== 'number' || p.e < Date.now() / 1000) return null;
    return { artifactId: p.a, userId: p.u, version: p.v ?? null, exp: p.e };
  } catch {
    return null;
  }
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Normalize a published path; null when it escapes or is malformed. */
export function cleanPath(p: string): string | null {
  if (typeof p !== 'string') return null;
  const s = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!s || s.length > 512 || s.split('/').some((seg) => !seg || seg === '.' || seg === '..')) return null;
  if (s === 'index.html') return null; // reserved for the page itself
  return s;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.glb': 'model/gltf-binary',
};

export function typeFor(p: string, given?: string | null): string {
  if (given && given !== 'application/octet-stream') return given;
  return TYPES[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
}

export const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
