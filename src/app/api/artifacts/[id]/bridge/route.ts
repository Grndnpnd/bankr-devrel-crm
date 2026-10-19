import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  atLeast, dbAcquire, dbDelete, dbGet, dbQuery, dbSet, DbError, openArtifact, updateArtifact, viewerKey,
  type DbCtx,
} from '@/lib/artifacts';
import { chatMessages, extractJson, llmConfigured, type ChatMessage } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Capabilities the shim serves. */
const SUPPORTED = ['artifact', 'db', 'downloads', 'sample', 'user'];

function granted(capabilities: unknown): string[] {
  const declared = capabilities && typeof capabilities === 'object' ? Object.keys(capabilities as object) : null;
  // A page imported with a declaration gets what it declared (+ user, whose basics need
  // no declaration on claude.ai). A page made here gets everything the shim serves.
  const list = declared ? SUPPORTED.filter((c) => declared.includes(c) || (c === 'artifact' && declared.includes('self')) || c === 'user') : SUPPORTED;
  return list.filter((c) => c !== 'sample' || llmConfigured());
}

const COLORS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#c2255c', '#0c8599', '#e67700', '#5f3dc4'];
const colorFor = (key: string) => COLORS[parseInt(createHash('md5').update(key).digest('hex').slice(0, 2), 16) % COLORS.length];

// sample(): a small per-user budget so one page can't run up the model bill.
const sampleHits = new Map<string, number[]>();
function sampleAllowed(userId: string) {
  const now = Date.now();
  const hits = (sampleHits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= 20) return false;
  hits.push(now); sampleHits.set(userId, hits);
  return true;
}

function fail(code: string, message: string, status = 200) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * Every window.claude call from a rendered artifact lands here (relayed by the
 * parent page, which adds the session cookie). Body: { op, args }.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const session = await getSession();
  if (!session) return fail('revoked', 'signed out', 401);
  const found = await openArtifact(params.id, session);
  if (!found) return fail('revoked', 'no access', 404);
  const { artifact, level } = found;
  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? '');
  const args = body?.args ?? {};
  const me = viewerKey(artifact.id, session.id);
  const dbCtx: DbCtx = { artifactId: artifact.id, capabilities: artifact.capabilities, viewer: me, level };
  const allowed = granted(artifact.capabilities);
  const need = (cap: string) => { if (!allowed.includes(cap)) throw new DbError('not_granted', `${cap} is not granted to this page`); };

  try {
    switch (op) {
      case 'init':
        return NextResponse.json({ ok: true, result: {
          granted: allowed,
          viewer: {
            isOwner: level === 'owner',
            canEdit: atLeast(level, 'admin'),
            canWrite: atLeast(level, 'interact'),
            profile: { id: me, name: session.name || session.email, email: session.email, avatarUrl: '', color: colorFor(me), isMe: true, guest: false },
          },
        } });

      case 'db.get': need('db'); return ok(await dbGet(dbCtx, String(args.path)));
      case 'db.query': need('db'); return ok(await dbQuery(dbCtx, String(args.collection), args.query ?? {}));
      case 'db.set': need('db'); await dbSet(dbCtx, String(args.path), args.data, 'set'); return ok(null);
      case 'db.update': need('db'); await dbSet(dbCtx, String(args.path), args.data, 'update'); return ok(null);
      case 'db.delete': need('db'); await dbDelete(dbCtx, String(args.path)); return ok(null);
      case 'db.acquire': need('db'); return ok(await dbAcquire(dbCtx, String(args.path), args.opts ?? {}));

      case 'user.profiles':
      case 'user.search': {
        // Everyone who can open this artifact: owner, people shared with, and (TEAM) all users.
        const people = await prisma.user.findMany({
          where: artifact.visibility === 'TEAM' ? { active: true } : { OR: [{ id: artifact.ownerId }, { artifactShares: { some: { artifactId: artifact.id } } }] },
          select: { id: true, name: true, email: true },
        });
        const profiles = people.map((p) => {
          const id = viewerKey(artifact.id, p.id);
          return { id, name: p.name || p.email, email: p.email, avatarUrl: '', color: colorFor(id), isMe: p.id === session.id, guest: false };
        });
        if (op === 'user.search') {
          const q = String(args.q ?? '').toLowerCase();
          return ok(profiles.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)).slice(0, 20));
        }
        const want = new Set((args.ids ?? []).map(String));
        return ok(Object.fromEntries(profiles.filter((p) => want.has(p.id)).map((p) => [p.id, p])));
      }

      case 'artifact.publish': {
        need('artifact');
        if (!atLeast(level, 'admin')) return fail('not_writer', 'you can view this page but not save it');
        const html = String(args.html ?? '');
        if (!/^\s*<!doctype html|^\s*<html/i.test(html)) return fail('invalid_content', 'publish needs a whole HTML document');
        const a = await updateArtifact(artifact.id, session, level, { html, note: 'Saved from the page' });
        return ok({ version: String(a.currentVersion) });
      }

      case 'sample': {
        need('sample');
        if (!sampleAllowed(session.id)) return fail('rate_limited', 'too many requests — wait a minute');
        const input = args.input;
        const turns: ChatMessage[] = typeof input === 'string'
          ? [{ role: 'user', content: input }]
          : Array.isArray(input) ? input.map((t: any) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content ?? '') })) : [];
        if (!turns.length) return fail('invalid_argument', 'sample needs input');
        if (args.json) turns.unshift({ role: 'system', content: 'Reply with only a single JSON value. No prose, no code fences.' });
        const res = await chatMessages(turns, { task: 'report', temperature: 0.4 });
        if (!res.ok) return fail('unavailable', res.error ?? 'model error');
        if (args.json) {
          const parsed = extractJson(res.content!) ?? (() => { try { return JSON.parse(res.content!); } catch { return undefined; } })();
          if (parsed === undefined) return fail('invalid_output', 'the model did not return JSON', 200);
          return ok({ json: parsed });
        }
        return ok({ text: res.content, truncated: false });
      }

      default:
        return fail('capability_removed', `unknown call ${op}`);
    }
  } catch (e: any) {
    if (e instanceof DbError) return fail(e.code, e.message);
    console.error('[artifact bridge]', op, e);
    return fail('unavailable', 'server error');
  }
}

function ok(result: unknown) { return NextResponse.json({ ok: true, result }); }
