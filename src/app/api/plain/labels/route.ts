import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { plainConfigured, plainLabelTypes } from '@/lib/plain';

export const dynamic = 'force-dynamic';

/** Plain's label types, for routing rules and beta program labels. */
export async function GET() {
  const session = await getSession();
  if (!session || !(can(session.role, 'support.view') || can(session.role, 'beta.manage'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!plainConfigured()) return NextResponse.json({ labels: [], configured: false });
  try {
    return NextResponse.json({ labels: await plainLabelTypes(), configured: true });
  } catch (e: any) {
    return NextResponse.json({ labels: [], configured: true, error: e?.message ?? 'failed' });
  }
}
