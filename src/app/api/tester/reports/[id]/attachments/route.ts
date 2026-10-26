import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { attachmentTypeOk, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, rateLimited } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';

export const dynamic = 'force-dynamic';

/** Attach a screenshot, recording, PDF or text log to one of the tester's reports (multipart field "file"). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (rateLimited(`upload:${r.tester.id}`, 40, 3600_000)) return NextResponse.json({ error: 'Too many uploads — wait a bit.' }, { status: 429 });
  const report = await prisma.testerReport.findFirst({ where: { id, testerId: r.tester.id }, include: { _count: { select: { attachments: true } } } });
  if (!report) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (report._count.attachments >= MAX_ATTACHMENTS) return NextResponse.json({ error: `Up to ${MAX_ATTACHMENTS} files per report.` }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'Files can be up to 10 MB.' }, { status: 413 });
  const type = file.type || 'application/octet-stream';
  if (!attachmentTypeOk(type)) return NextResponse.json({ error: 'Attach an image (PNG, JPEG, GIF, WebP), a video (MP4, WebM, MOV), a PDF or a text log.' }, { status: 415 });
  const data = Buffer.from(await file.arrayBuffer());
  const a = await prisma.testerAttachment.create({
    data: { reportId: id, filename: (file.name || 'attachment').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120), contentType: type, size: data.length, data },
    select: { id: true, filename: true, contentType: true, size: true },
  });
  return NextResponse.json({ attachment: a }, { status: 201 });
}
