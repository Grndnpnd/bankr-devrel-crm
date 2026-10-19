import { prisma } from '@/lib/prisma';
import { verifyView } from '@/lib/artifactFiles';
import { injectShim, SANDBOX } from '@/lib/artifactShim';

export const dynamic = 'force-dynamic';

// Every response here is sandboxed: an opaque origin even if opened directly.
const SANDBOXED = { 'Content-Security-Policy': `sandbox ${SANDBOX}; frame-ancestors 'self'`, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

/** The page (index.html, with the window.claude shim) and its supporting files, by signed token. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; token: string; path: string[] }> }) {
  const { id, token, path } = await ctx.params;
  const grant = verifyView(token, id);
  if (!grant) return new Response('link expired — reopen the artifact', { status: 403 });
  const rel = path.map((p) => decodeURIComponent(p)).join('/');

  if (rel === 'index.html') {
    let html: string | null = null;
    if (grant.version) {
      const v = await prisma.artifactVersion.findUnique({ where: { artifactId_version: { artifactId: id, version: grant.version } }, select: { html: true } });
      html = v?.html ?? null;
    } else {
      const a = await prisma.artifact.findUnique({ where: { id }, select: { html: true } });
      html = a?.html ?? null;
    }
    if (html === null) return new Response('not found', { status: 404 });
    return new Response(injectShim(html), {
      headers: { ...SANDBOXED, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  }

  const file = await prisma.artifactFile.findUnique({ where: { artifactId_path: { artifactId: id, path: rel } } });
  if (!file) return new Response('not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (req.headers.get('if-none-match') === `"${file.sha256}"`) {
    return new Response(null, { status: 304, headers: { ETag: `"${file.sha256}"`, 'Access-Control-Allow-Origin': '*' } });
  }

  // Byte ranges, so video can seek.
  const body = Buffer.from(file.data);
  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  const common = {
    ...SANDBOXED,
    'Content-Type': file.contentType,
    'Accept-Ranges': 'bytes',
    ETag: `"${file.sha256}"`,
    'Cache-Control': 'private, max-age=3600',
    // The page's own fetch() comes from an opaque origin.
    'Access-Control-Allow-Origin': '*',
  };
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    if (start >= body.length || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${body.length}` } });
    return new Response(new Uint8Array(body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...common, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(body), { headers: { ...common, 'Content-Length': String(body.length) } });
}
