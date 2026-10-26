import TesterPortal from '@/components/beta/TesterPortal';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your beta reports', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ expired?: string }> }) {
  const { slug } = await params;
  const { expired } = await searchParams;
  return <TesterPortal slug={slug} expired={expired === '1'} />;
}
