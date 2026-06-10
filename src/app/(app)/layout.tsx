import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppShell from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return <AppShell me={session}>{children}</AppShell>;
}
