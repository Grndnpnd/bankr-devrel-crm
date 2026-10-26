import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import Wallets from '@/components/pages/Wallets';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getSession();
  if (session && !can(session.role, 'tasks.use')) redirect('/');
  return <Wallets />;
}
