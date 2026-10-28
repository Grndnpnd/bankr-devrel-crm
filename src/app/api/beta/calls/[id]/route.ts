import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDay } from '@/lib/betaModel';
import { body, staffRecord } from '@/lib/betaHttp';

export const dynamic = 'force-dynamic';

/** Edit a call: { title?, date?, summary?, recordingUrl?, testerIds? } */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('call', id);
  if ('error' in s) return s.error;
  const call = await prisma.betaCall.findUnique({ where: { id } });
  if (!call) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const b = await body(req);
  const data: Record<string, unknown> = {};
  if (b.title !== undefined) { const t = String(b.title).trim().slice(0, 200); if (!t) return NextResponse.json({ error: 'Name the call.' }, { status: 400 }); data.title = t; }
  if (b.date !== undefined) { const d = parseDay(b.date) ?? new Date(NaN); if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'That date isn’t a date.' }, { status: 400 }); data.date = d; }
  if (b.summary !== undefined) data.summary = b.summary ? String(b.summary).slice(0, 20_000) : null;
  if (b.recordingUrl !== undefined) {
    const rec = b.recordingUrl ? String(b.recordingUrl).trim().slice(0, 500) : null;
    if (rec && !/^https:\/\//.test(rec)) return NextResponse.json({ error: 'The recording must be an https:// link.' }, { status: 400 });
    data.recordingUrl = rec;
  }
  if (Array.isArray(b.testerIds)) {
    const valid = await prisma.tester.findMany({ where: { id: { in: b.testerIds.map(String) }, programId: call.programId }, select: { id: true } });
    await prisma.betaCallTester.deleteMany({ where: { callId: id } });
    await prisma.betaCallTester.createMany({ data: valid.map((t) => ({ callId: id, testerId: t.id })) });
    data.notionDirty = true;
  }
  await prisma.betaCall.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('call', id, 'beta.manage');
  if ('error' in s) return s.error;
  await prisma.betaCall.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
