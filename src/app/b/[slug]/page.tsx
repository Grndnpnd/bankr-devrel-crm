import { cookies } from 'next/headers';
import JoinPage from '@/components/beta/JoinPage';
import { joinInfo, testerFromCookies } from '@/lib/betaPortal';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Join the beta', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const { k } = await searchParams;
  // Rendered with its data, so a slow phone doesn't wait on a second request before showing anything.
  const initial = await joinInfo(slug, k ?? '', await testerFromCookies(slug, await cookies()));
  return <JoinPage slug={slug} k={k ?? ''} initial={JSON.parse(JSON.stringify(initial))} />;
}
