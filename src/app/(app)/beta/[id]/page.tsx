import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import BetaProgramView from '@/components/pages/BetaProgramView';

export const dynamic = 'force-dynamic';

/** ?tab=outreach&o=<id>, ?report=<id>, ?tab=reports&waiting=me … deep-link into the program. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (session && !can(session.role, 'tasks.use')) redirect('/');
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rest: Record<string, string> = {};
  for (const k of ['view', 'o', 'waiting', 'status', 'kind', 'area', 'severity', 'tester']) { const v = one(sp[k]); if (v) rest[k] = v.slice(0, 100); }
  return <BetaProgramView id={id} initialReport={one(sp.report) ?? null} initialTab={one(sp.tab) ?? null} initialParams={rest} />;
}
