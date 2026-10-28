import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDay } from '@/lib/betaModel';
import { body, staffProgram } from '@/lib/betaHttp';

export const dynamic = 'force-dynamic';

/** Feedback calls, newest first, with who was on them and what came out of them. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const calls = await prisma.betaCall.findMany({
    where: { programId: id }, orderBy: { date: 'desc' }, take: 300,
    include: {
      testers: { select: { tester: { select: { id: true, name: true } } } },
      reports: { select: { id: true, title: true, kind: true, status: true } },
      outreach: { select: { id: true, title: true, status: true } },
    },
  });
  return NextResponse.json({ calls: calls.map((c) => ({ ...c, testers: c.testers.map((x) => x.tester) })) });
}

/** Log a call: { title, date, summary?, recordingUrl?, testerIds? } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  const b = await body(req);
  const title = String(b.title ?? '').trim().slice(0, 200);
  const date = b.date ? parseDay(b.date) ?? new Date(NaN) : new Date();
  if (!title) return NextResponse.json({ error: 'Name the call.' }, { status: 400 });
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'That date isn’t a date.' }, { status: 400 });
  const rec = b.recordingUrl ? String(b.recordingUrl).trim().slice(0, 500) : null;
  if (rec && !/^https:\/\//.test(rec)) return NextResponse.json({ error: 'The recording must be an https:// link.' }, { status: 400 });
  const testerIds = Array.isArray(b.testerIds) ? b.testerIds.map(String) : [];
  const valid = await prisma.tester.findMany({ where: { id: { in: testerIds }, programId: id }, select: { id: true } });
  const call = await prisma.betaCall.create({
    data: {
      programId: id, title, date, summary: b.summary ? String(b.summary).slice(0, 20_000) : null, recordingUrl: rec,
      testers: { create: valid.map((t) => ({ testerId: t.id })) },
    },
  });
  return NextResponse.json({ call }, { status: 201 });
}
