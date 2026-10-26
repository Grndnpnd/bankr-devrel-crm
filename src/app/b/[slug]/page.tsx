import JoinPage from '@/components/beta/JoinPage';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Join the beta', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const { k } = await searchParams;
  return <JoinPage slug={slug} k={k ?? ''} />;
}
