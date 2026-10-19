export const dynamic = 'force-static';

/**
 * claude.ai pages load a few platform libraries from /_runtime/<name>-<version>.min.js
 * (next.config rewrites /_runtime/* here). Map each known one to its npm build on jsDelivr.
 */
const LIBS: Record<string, (v: string) => string> = {
  mermaid: (v) => `https://cdn.jsdelivr.net/npm/mermaid@${v}/dist/mermaid.min.js`,
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = file.match(/^([a-z0-9-]+?)-(\d+\.\d+\.\d+)\.min\.js$/);
  const to = m && LIBS[m[1]]?.(m[2]);
  if (!to) return new Response('unknown runtime file', { status: 404 });
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'public, max-age=86400' } });
}
