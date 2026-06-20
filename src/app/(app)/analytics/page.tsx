import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { can } from '@/lib/access';
import Analytics from '@/components/pages/Analytics';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getSession();
  if (session && !can(session.role, 'devrel.view')) {
    redirect('/');
  }
  return <Analytics />;
}
