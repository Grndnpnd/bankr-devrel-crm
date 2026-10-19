import { requestUser } from '@/lib/apiTokens';
import { openArtifact } from '@/lib/artifacts';
import { signView } from '@/lib/artifactFiles';

export const dynamic = 'force-dynamic';

/**
 * Entry point for a frame: checks the viewer, then sends them to the signed path
 * (/s/<token>/index.html) that serves the page and its relative files.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const user = await requestUser(req);
  if (!user) return new Response('unauthorized', { status: 401 });
  const found = await openArtifact(params.id, user);
  if (!found) return new Response('not found', { status: 404 });
  const v = Number(new URL(req.url).searchParams.get('v')) || null;
  const token = signView(params.id, user.id, v && v !== found.artifact.currentVersion ? v : null);
  return new Response(null, {
    status: 302,
    headers: { Location: `/api/artifacts/${params.id}/s/${token}/index.html`, 'Cache-Control': 'private, no-store' },
  });
}
