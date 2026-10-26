import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import Tasks from '@/components/pages/Tasks';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getSession();
  if (session && !can(session.role, 'tasks.use')) redirect('/');
  // No <Suspense> around it: with one, Next 16's dev server reload-loops this page.
  return <Tasks />;
}
