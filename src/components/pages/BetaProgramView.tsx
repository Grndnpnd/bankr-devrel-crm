'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { accent, type Ctx, faint, field, ink, line, muted, panel, type ProgramData, type ReportLite, type TesterLite } from '@/components/beta/staff/ui';
import Overview from '@/components/beta/staff/Overview';
import Reports from '@/components/beta/staff/Reports';
import ReportDrawer from '@/components/beta/staff/ReportDrawer';
import Outreach from '@/components/beta/staff/Outreach';
import Testers from '@/components/beta/staff/Testers';
import Payouts from '@/components/beta/staff/Payouts';
import Calls from '@/components/beta/staff/Calls';
import Settings from '@/components/beta/staff/Settings';
import { LogReportForm, OutreachForm, PayoutForm } from '@/components/beta/staff/Forms';

const TABS = ['overview', 'reports', 'outreach', 'testers', 'payouts', 'calls', 'settings'] as const;
type Tab = (typeof TABS)[number];
interface Team { id: string; name: string }

export default function BetaProgramView({ id, initialReport, initialTab, initialParams }: { id: string; initialReport: string | null; initialTab?: string | null; initialParams?: Record<string, string> }) {
  const router = useRouter();
  const [data, setData] = useState<ProgramData | null>(null);
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(initialTab ?? '') ? (initialTab as Tab) : initialReport ? 'reports' : 'overview');
  const [params, setParams] = useState<Record<string, string>>(initialParams ?? {});
  const [teams, setTeams] = useState<Team[]>([]);
  const [testers, setTesters] = useState<TesterLite[]>([]);
  const [reports, setReports] = useState<ReportLite[]>([]);
  const [openReport, setOpenReport] = useState<string | null>(initialReport);
  const [ver, setVer] = useState(0);
  const [form, setForm] = useState<{ kind: 'outreach' | 'payout' | 'report'; prefill: Record<string, unknown> } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/beta/programs/${id}`);
    if (!res.ok) { toast.error('Program not found'); router.push('/beta'); return; }
    setData(await res.json());
  }, [id, router]);
  const loadLists = useCallback(async () => {
    const [t, r] = await Promise.all([
      fetch(`/api/beta/programs/${id}/testers`).then((x) => x.json()).catch(() => ({})),
      fetch(`/api/beta/programs/${id}/reports`).then((x) => x.json()).catch(() => ({})),
    ]);
    setTesters((t.testers ?? []).map((x: any) => ({ id: x.id, name: x.name, status: x.status, email: x.email, channel: x.channel, handle: x.handle, walletAddress: x.walletAddress })));
    setReports((r.reports ?? []).map((x: any) => ({ id: x.id, title: x.title, kind: x.kind, status: x.status, duplicateOfId: x.duplicateOfId, testerId: x.tester.id, tester: { name: x.tester.name } })));
  }, [id]);
  useEffect(() => { load(); loadLists(); fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teams ?? [])).catch(() => {}); }, [load, loadLists]);

  const reload = useCallback(() => { setVer((v) => v + 1); load(); loadLists(); }, [load, loadLists]);
  const goTab = useCallback((t: string, p: Record<string, string> = {}) => {
    if (!(TABS as readonly string[]).includes(t)) return;
    setTab(t as Tab); setParams(p);
    const sp = new URLSearchParams({ ...(t !== 'overview' ? { tab: t } : {}), ...p });
    router.replace(`/beta/${id}${sp.size ? `?${sp}` : ''}`, { scroll: false });
  }, [id, router]);
  const openR = useCallback((rid: string) => setOpenReport(rid), []);
  const closeReport = useCallback(() => {
    setOpenReport(null); reload();
    if (initialReport) router.replace(`/beta/${id}${tab !== 'overview' ? `?tab=${tab}` : ''}`, { scroll: false });
  }, [reload, initialReport, router, id, tab]);

  const ctx: Ctx | null = useMemo(() => data && ({
    programId: id, data, people: data.people, testers, reports, ver, reload, openReport: openR, goTab,
    newOutreach: (prefill = {}) => setForm({ kind: 'outreach', prefill }),
    newPayout: (prefill = {}) => setForm({ kind: 'payout', prefill }),
    logReport: (prefill = {}) => setForm({ kind: 'report', prefill }),
  }), [data, id, testers, reports, ver, reload, openR, goTab]);

  async function patch(body: object, msg?: string) {
    const res = await fetch(`/api/beta/programs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(d.error ?? 'Could not save'); return false; }
    if (msg) toast.success(msg);
    reload(); return true;
  }

  if (!data || !ctx) return <div style={{ color: faint, fontSize: 13, padding: 20 }}>Loading…</div>;
  const p = data.program;
  const o = data.overview;
  const badge: Partial<Record<Tab, number>> = {
    reports: data.counts.new ?? 0,
    outreach: (o?.outreach.awaitingApproval ?? 0) + (o?.outreach.toSend ?? 0),
    payouts: o?.funds.waiting ?? 0,
  };
  const tabLabel: Record<Tab, string> = { overview: 'Overview', reports: 'Reports', outreach: 'Outreach', testers: `Testers (${data.testers})`, payouts: 'Payouts', calls: 'Calls', settings: 'Settings' };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/beta" aria-label="All programs" style={{ color: faint, display: 'flex' }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: ink }}>{p.name}</h1>
          <div style={{ fontSize: 12.5, color: faint }}>
            {data.testers}{p.maxTesters ? `/${p.maxTesters}` : ''} testers · {o?.bugs.open ?? 0} open bug{o?.bugs.open === 1 ? '' : 's'} · {data.counts.new ?? 0} new
            {p.leadId && <> · lead {data.people.find((x) => x.id === p.leadId)?.name ?? '—'}</>}
          </div>
        </div>
        {data.canManage ? (
          <select value={p.status} onChange={(e) => patch({ status: e.target.value }, 'Status changed')} aria-label="Program status" style={{ ...field, width: 'auto' }}>
            <option value="open">Open — taking testers and reports</option>
            <option value="closed">Closed — no new joins or reports</option>
            <option value="draft">Draft — link doesn’t work yet</option>
          </select>
        ) : <span style={{ fontSize: 12, color: muted, textTransform: 'uppercase' }}>{p.status}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: '10px 14px', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: faint, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Join link</span>
        <code style={{ fontSize: 12.5, color: ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.joinUrl}</code>
        <button onClick={() => navigator.clipboard.writeText(p.joinUrl).then(() => toast.success('Copied'))} className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><Copy size={13} /> Copy</button>
        <a href={p.joinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><ExternalLink size={13} /> Open</a>
        {data.canManage && (
          <button onClick={() => { if (window.confirm('Make a new join link? The current link stops working for people who haven’t joined yet. Testers who joined keep their access.')) patch({ regenerateLink: true }, 'New link made'); }}
            className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><RefreshCw size={13} /> New link</button>
        )}
      </div>

      <div className="flex gap-1" role="tablist" style={{ borderBottom: `1px solid ${line}`, marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => goTab(t)} style={{ padding: '9px 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: tab === t ? accent : muted, borderBottom: tab === t ? `2px solid ${accent}` : '2px solid transparent' }}>
            {tabLabel[t]}{badge[t] ? <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 999, background: 'rgba(245,166,35,0.15)', color: accent }}>{badge[t]}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview ctx={ctx} />}
      {tab === 'reports' && <Reports key={JSON.stringify(params)} ctx={ctx} initial={params} />}
      {tab === 'outreach' && <Outreach key={JSON.stringify(params)} ctx={ctx} initial={params} />}
      {tab === 'testers' && <Testers ctx={ctx} />}
      {tab === 'payouts' && <Payouts ctx={ctx} />}
      {tab === 'calls' && <Calls ctx={ctx} />}
      {tab === 'settings' && <Settings key={ver} ctx={ctx} teams={teams} onSave={(b) => patch(b, 'Saved')} onDelete={async () => {
        if (!window.confirm(`Delete ${p.name} with all its testers, reports, outreach, payouts and calls? Their tasks stay on the board.`)) return;
        await fetch(`/api/beta/programs/${id}`, { method: 'DELETE' }); toast.success('Program deleted'); router.push('/beta');
      }} />}

      {openReport && <ReportDrawer key={openReport} ctx={ctx} id={openReport} onClose={closeReport} />}
      {form?.kind === 'outreach' && <OutreachForm ctx={ctx} prefill={form.prefill} onClose={() => setForm(null)} />}
      {form?.kind === 'payout' && <PayoutForm ctx={ctx} prefill={form.prefill} onClose={() => setForm(null)} />}
      {form?.kind === 'report' && <LogReportForm ctx={ctx} prefill={form.prefill} onClose={() => setForm(null)} />}
    </div>
  );
}
