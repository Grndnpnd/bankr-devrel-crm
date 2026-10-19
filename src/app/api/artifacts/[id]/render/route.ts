import { requestUser } from '@/lib/apiTokens';
import { prisma } from '@/lib/prisma';
import { openArtifact } from '@/lib/artifacts';
import { injectShim, SANDBOX } from '@/lib/artifactShim';

export const dynamic = 'force-dynamic';

/**
 * The page itself, with the window.claude shim injected. The CSP `sandbox` header
 * gives it an opaque origin even if someone opens this URL directly, so artifact
 * code can never read the app's cookies or call its API as the viewer.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return new Response('unauthorized', { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return new Response('not found', { status: 404 });

  let html = found.artifact.html;
  const v = Number(new URL(req.url).searchParams.get('v'));
  if (v && v !== found.artifact.currentVersion) {
    const old = await prisma.artifactVersion.findUnique({ where: { artifactId_version: { artifactId: params.id, version: v } } });
    if (!old) return new Response('version not found', { status: 404 });
    html = old.html;
  }

  return new Response(injectShim(html), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `sandbox ${SANDBOX}; frame-ancestors 'self'`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, no-store',
    },
  });
}
