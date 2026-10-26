import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import BetaProgramView from '@/components/pages/BetaProgramView';

export const dynamic = 'force-dynamic';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ report?: string }> }) {
  const session = await getSession();
  if (session && !can(session.role, 'tasks.use')) redirect('/');
  const { id } = await params;
  const { report } = await searchParams;
  return <BetaProgramView id={id} initialReport={report ?? null} />;
}
