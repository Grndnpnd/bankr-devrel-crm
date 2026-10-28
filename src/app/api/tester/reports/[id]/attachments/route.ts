import { NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { attachmentTypeOk, contentMatches, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, PROGRAM_QUOTA_BYTES, programOpen, rateLimited, TESTER_QUOTA_BYTES } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';
import { noteAttachmentInPlain } from '@/lib/plainBeta';

export const dynamic = 'force-dynamic';

const used = (where: object) => prisma.testerAttachment.aggregate({ where, _sum: { size: true } }).then((x) => x._sum.size ?? 0);

/** Attach a screenshot, recording, PDF or text log to one of the tester's reports (multipart field "file"). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (!programOpen(r.tester.program)) return NextResponse.json({ error: 'This beta has ended, so files can’t be added any more.' }, { status: 403 });
  if (await rateLimited(`upload:${r.tester.id}`, 40, 3600_000)) return NextResponse.json({ error: 'Too many uploads — wait a bit.' }, { status: 429 });
  const report = await prisma.testerReport.findFirst({ where: { id, testerId: r.tester.id }, include: { _count: { select: { attachments: true } } } });
  if (!report) return NextResponse.json({ error: 'This report was withdrawn.', gone: true }, { status: 404 });
  if (report._count.attachments >= MAX_ATTACHMENTS) return NextResponse.json({ error: `Up to ${MAX_ATTACHMENTS} files per report.` }, { status: 400 });
  if (Number(req.headers.get('content-length') || 0) > MAX_ATTACHMENT_BYTES + 512 * 1024) return NextResponse.json({ error: 'Files can be up to 10 MB.' }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file received.' }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'Files can be up to 10 MB.' }, { status: 413 });
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  const type = file.type || 'application/octet-stream';
  if (!attachmentTypeOk(type)) return NextResponse.json({ error: 'Attach an image (PNG, JPEG, GIF, WebP), a video (MP4, WebM, MOV), a PDF or a text log.' }, { status: 415 });
  if ((await used({ report: { testerId: r.tester.id } })) + file.size > TESTER_QUOTA_BYTES) {
    return NextResponse.json({ error: 'You’ve uploaded a lot already — put a link to anything bigger (a shared drive or video link) in your report instead.' }, { status: 413 });
  }
  if ((await used({ report: { programId: r.tester.programId } })) + file.size > PROGRAM_QUOTA_BYTES) {
    console.warn('[beta] program file quota reached', r.tester.programId);
    return NextResponse.json({ error: 'This beta can’t take more files right now — paste a link to the file in your report instead.' }, { status: 413 });
  }
  const data = Buffer.from(await file.arrayBuffer());
  if (!contentMatches(type, data)) return NextResponse.json({ error: `${file.name || 'That file'} isn’t really a ${type.split('/')[1].toUpperCase()} file. It may be renamed or damaged` }, { status: 415 });
  const filename = (file.name || 'attachment').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, '_').trim().slice(0, 120) || 'attachment';
  // Lock the report row so parallel uploads take turns and can't slip past the per-report cap.
  const a = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TesterReport" WHERE "id" = ${id} FOR UPDATE`;
    if ((await tx.testerAttachment.count({ where: { reportId: id } })) >= MAX_ATTACHMENTS) return null;
    return tx.testerAttachment.create({
      data: { reportId: id, filename, contentType: type, size: data.length, data },
      select: { id: true, filename: true, contentType: true, size: true },
    });
  }, { timeout: 30_000 });
  if (!a) return NextResponse.json({ error: `Up to ${MAX_ATTACHMENTS} files per report.` }, { status: 400 });
  after(() => noteAttachmentInPlain(id, a.filename).catch(() => {}));
  return NextResponse.json({ attachment: a }, { status: 201 });
}
