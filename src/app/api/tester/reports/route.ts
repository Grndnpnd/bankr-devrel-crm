import { NextResponse, after } from 'next/server';
import { rateLimited, submitReport } from '@/lib/beta';
import { requireTester } from '@/lib/testerHttp';
import { pushReportToPlain } from '@/lib/plainBeta';

export const dynamic = 'force-dynamic';

/** File a report: { kind, title, body, severity?, steps?, expected?, actual?, platform?, pageUrl? } */
export async function POST(req: Request) {
  const r = await requireTester(req);
  if ('error' in r) return r.error;
  if (await rateLimited(`report:${r.tester.id}`, 30, 3600_000)) {
    return NextResponse.json({ error: 'That’s a lot of reports in an hour — please wait a little before sending more.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  try {
    const report = await submitReport(r.tester, body);
    // A few seconds' grace so the screenshots the portal uploads next are counted on the thread.
    // If this fails, plain_beta_sync retries it.
    after(async () => { await new Promise((ok) => setTimeout(ok, 5000)); await pushReportToPlain(report.id).catch(() => {}); });
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not send the report' }, { status: 400 });
  }
}
