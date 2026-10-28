import { cookies } from 'next/headers';
import TesterPortal from '@/components/beta/TesterPortal';
import { portalData, portalProblem, programContact, testerFromCookies, testerReportDetail } from '@/lib/betaPortal';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your beta reports', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ expired?: string; r?: string; new?: string }> }) {
  const { slug } = await params;
  const { expired, r, new: isNew } = await searchParams;
  const tester = await testerFromCookies(slug, await cookies());
  // Rendered with its data (no blank "Loading…" on a slow phone); the page refreshes itself from the API after.
  const initial = tester ? JSON.parse(JSON.stringify(await portalData(tester))) : null;
  const problem = tester ? null : expired === '1' ? 'bad_link' : await portalProblem(slug);
  const contact = tester ? null : await programContact(slug);
  // The view in the URL is rendered right away (a tap on a slow phone opens the report, not the list first).
  const initialView = r ? r : isNew ? 'new' : 'list';
  const initialReport = tester && r ? JSON.parse(JSON.stringify(await testerReportDetail(tester.id, r))) : null;
  return <TesterPortal slug={slug} initial={initial} problem={problem} contact={contact} initialView={initialView} initialReport={initialReport} />;
}
