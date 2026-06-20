import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { can } from '@/lib/access';
import Dashboard from '@/components/pages/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getSession();
  // Pillar routing: if the user can't see DevRel but can see Support, send them there.
  if (session && !can(session.role, 'devrel.view') && can(session.role, 'support.view')) {
    redirect('/support');
  }
  return <Dashboard />;
}
