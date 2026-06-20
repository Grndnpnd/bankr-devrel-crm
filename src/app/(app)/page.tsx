import Dashboard from '@/components/pages/Dashboard';

export const dynamic = 'force-dynamic';

// Dashboard is the universal landing page; its widgets adapt to the user's pillars
// (devrel, support, or both). No redirect needed.
export default function Page() {
  return <Dashboard />;
}
