import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanQuestions, programOpen, testerFromRequest, turnstileSiteKey } from '@/lib/beta';

export const dynamic = 'force-dynamic';

/** What the join page shows: ?slug=…&k=<join token>. Wrong or revoked link → 404. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';
  const k = url.searchParams.get('k') || '';
  const p = await prisma.betaProgram.findUnique({ where: { slug } });
  const already = p ? await testerFromRequest(req, slug) : null;
  if (!p || p.status === 'draft' || (p.joinToken !== k && !already)) {
    return NextResponse.json({ error: 'This invite link isn’t valid any more. Ask the team for a new one.' }, { status: 404 });
  }
  const full = p.maxTesters ? (await prisma.tester.count({ where: { programId: p.id, status: 'active' } })) >= p.maxTesters : false;
  return NextResponse.json({
    name: p.name, product: p.product, description: p.description,
    open: programOpen(p), full, alreadyJoined: !!already,
    questions: cleanQuestions(p.questions), turnstileSiteKey: turnstileSiteKey(),
  });
}
