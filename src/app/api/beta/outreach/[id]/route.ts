import { outreachAction } from '@/lib/betaFlow';
import { body, run, staffRecord } from '@/lib/betaHttp';

export const dynamic = 'force-dynamic';

/** { action: approve | edit | sent | nudged | answer | close | no_reply | cancel, message?, title?, answer?, outcome?, nextActionDue? } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffRecord('outreach', id);
  if ('error' in s) return s.error;
  const b = await body(req);
  return run(async () => ({ outreach: await outreachAction(s.session, id, String(b.action ?? ''), b) }));
}
