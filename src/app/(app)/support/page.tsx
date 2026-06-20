import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { can } from '@/lib/access';
import SupportDashboard from '@/components/pages/SupportDashboard';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const session = await getSession();
  // Pillar guard: no support access → bounce to DevRel if they have it, else login.
  if (session && !can(session.role, 'support.view')) {
    redirect(can(session.role, 'devrel.view') ? '/' : '/login');
  }
  return <SupportDashboard />;
}
