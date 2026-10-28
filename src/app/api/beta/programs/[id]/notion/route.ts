import { NextResponse, after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { body, staffProgram } from '@/lib/betaHttp';
import { getDataSource, notionConfigured, NotionError, resolveBoard } from '@/lib/notion';
import { autoMap, fieldCatalog, KIND_LABEL, syncProgram, type Kind, type Mapping } from '@/lib/notionSync';

export const dynamic = 'force-dynamic';

const KINDS = Object.keys(KIND_LABEL) as Kind[];
const MODEL = { testers: prisma.tester, reports: prisma.testerReport, outreach: prisma.betaOutreach, payouts: prisma.betaPayout, calls: prisma.betaCall } as const;
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof NotionError && e.status >= 400 && e.status < 500 ? 400 : 502 });

/** Connected boards with their mappings; ?schema=<kind> also returns that board's live properties. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const boards = await prisma.notionBoard.findMany({ where: { programId: id } });
  const counts = Object.fromEntries(await Promise.all(KINDS.map(async (k) => [k, {
    linked: await (MODEL[k] as any).count({ where: { programId: id, notionPageId: { not: null } } }),
    waiting: await (MODEL[k] as any).count({ where: { programId: id, OR: [{ notionDirty: true }, { notionPageId: null }] } }),
    failing: await (MODEL[k] as any).count({ where: { programId: id, notionError: { not: null }, notionDirty: true } }),
  }])));
  const schemaKind = new URL(req.url).searchParams.get('schema');
  let schema = null;
  const sb = boards.find((b) => b.kind === schemaKind);
  if (sb && notionConfigured()) {
    try {
      const ds = await getDataSource(sb.dataSourceId);
      schema = Object.values(ds.properties).map((p) => ({ name: p.name, type: p.type, options: (p.select ?? p.status ?? p.multi_select)?.options.map((o) => o.name) ?? null }));
    } catch (e) { return fail(e); }
  }
  return NextResponse.json({ configured: notionConfigured(), kinds: KINDS.map((k) => ({ kind: k, label: KIND_LABEL[k] })), boards, counts, fields: fieldCatalog(), schema });
}

/** Connect a board: { kind, link, scope?: { property, value } }. Maps it, then imports and syncs in the background. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id, 'beta.manage');
  if ('error' in s) return s.error;
  if (!notionConfigured()) return NextResponse.json({ error: 'Notion isn’t connected yet (NOTION_TOKEN).' }, { status: 400 });
  const b = await body(req);
  const kind = String(b.kind) as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'kind must be one of ' + KINDS.join(', ') }, { status: 400 });
  try {
    const board = await resolveBoard(String(b.link ?? ''));
    const others = await prisma.notionBoard.findMany({ where: { programId: id } });
    const targets = Object.fromEntries(others.map((o) => [o.kind, o.dataSourceId]));
    const mapping = autoMap(kind, board.properties, targets);
    const scope = b.scope?.property && b.scope?.value ? { property: String(b.scope.property), value: String(b.scope.value) } : guessScope(board.properties, s.p.name);
    const saved = await prisma.notionBoard.upsert({
      where: { programId_kind: { programId: id, kind } },
      create: { programId: id, kind, databaseId: board.databaseId, dataSourceId: board.dataSourceId, title: board.title, url: board.url, mapping: mapping as unknown as Prisma.InputJsonValue, scope: scope ?? undefined },
      update: { databaseId: board.databaseId, dataSourceId: board.dataSourceId, title: board.title, url: board.url, mapping: mapping as unknown as Prisma.InputJsonValue, scope: scope ?? Prisma_DbNull(), pullCursor: null, lastError: null, enabled: true },
    });
    after(() => syncProgram(id).catch((e) => console.error('[notion] first sync', e)));
    const unmapped = fieldCatalog()[kind].filter((f) => !mapping[f.key]).map((f) => f.label);
    return NextResponse.json({ board: saved, unmapped }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

/** Adjust a board: { kind, mapping?, scope?, enabled? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id, 'beta.manage');
  if ('error' in s) return s.error;
  const b = await body(req);
  const board = await prisma.notionBoard.findUnique({ where: { programId_kind: { programId: id, kind: String(b.kind) } } });
  if (!board) return NextResponse.json({ error: 'not connected' }, { status: 404 });
  const data: Prisma.NotionBoardUpdateInput = {};
  if (b.mapping && typeof b.mapping === 'object') {
    const clean: Mapping = {};
    for (const [k, v] of Object.entries(b.mapping as Record<string, any>)) {
      if (v?.property && v?.type) clean[k] = { property: String(v.property), type: String(v.type), ...(v.options ? { options: Object.fromEntries(Object.entries(v.options).map(([a, c]) => [a, String(c)])) } : {}) };
    }
    data.mapping = clean as unknown as Prisma.InputJsonValue;
  }
  if (b.scope !== undefined) data.scope = b.scope?.property && b.scope?.value ? { property: String(b.scope.property), value: String(b.scope.value) } : Prisma_DbNull();
  if (b.enabled !== undefined) data.enabled = !!b.enabled;
  await prisma.notionBoard.update({ where: { id: board.id }, data });
  return NextResponse.json({ ok: true });
}

/** Disconnect a board (?kind=). Nothing is deleted on either side; records forget their Notion rows. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id, 'beta.manage');
  if ('error' in s) return s.error;
  const kind = new URL(req.url).searchParams.get('kind') as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'unknown kind' }, { status: 400 });
  await prisma.notionBoard.deleteMany({ where: { programId: id, kind } });
  await (MODEL[kind] as any).updateMany({ where: { programId: id }, data: { notionPageId: null, notionSnapshot: Prisma_DbNull(), notionEditedAt: null, notionDirty: false, notionError: null } });
  return NextResponse.json({ ok: true });
}

/** Shared boards (Outreach, Payouts) have a "Program" select; pick this program's option if one matches. */
function guessScope(props: Record<string, { name: string; type: string; select?: { options: { name: string }[] } }>, programName: string) {
  const p = Object.values(props).find((x) => x.type === 'select' && /^program$/i.test(x.name));
  if (!p) return null;
  const words = programName.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const hit = p.select?.options.find((o) => words.includes(o.name.toLowerCase()));
  return hit ? { property: p.name, value: hit.name } : null;
}

// Prisma's JSON null sentinel, imported lazily so this file stays edge-agnostic.
import { Prisma as P } from '@prisma/client';
const Prisma_DbNull = () => P.DbNull as any;
