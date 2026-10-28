'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { accent, type Ctx, day, faint, field, ink, line, muted, panel, plural, programEnded, type ProgramData, type ReportLite, STAFF_CSS, type TesterLite } from '@/components/beta/staff/ui';
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

  /** Save program settings. Returns the server's answer so Settings can show errors next to the field. */
  async function patch(body: object, msg?: string): Promise<{ ok: boolean; error?: string; warning?: string | null }> {
    const res = await fetch(`/api/beta/programs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    if (!res?.ok) { const error = d?.error ?? 'Could not save — check your connection.'; toast.error(error); return { ok: false, error }; }
    if (d?.warning) toast.warning(d.warning);
    else if (msg) toast.success(msg);
    await load(); setVer((v) => v + 1); loadLists();
    return { ok: true, warning: d?.warning ?? null };
  }

  if (!data || !ctx) return <Skeleton />;
  const p = data.program;
  const ended = programEnded(p);
  const o = data.overview;
  const badge: Partial<Record<Tab, number>> = {
    reports: data.counts.new ?? 0,
    outreach: (o?.outreach.awaitingApproval ?? 0) + (o?.outreach.toSend ?? 0),
    payouts: o?.funds.waiting ?? 0,
  };
  const tabLabel: Record<Tab, string> = { overview: 'Overview', reports: 'Reports', outreach: 'Messages to testers', testers: `Testers (${data.testers})`, payouts: 'Payouts', calls: 'Calls', settings: 'Settings' };

  return (
    <div style={{ minWidth: 0 }}>
      <style>{STAFF_CSS}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/beta" aria-label="All programs" className="bp-sq" style={{ color: faint, display: 'flex' }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: ink, overflowWrap: 'anywhere' }}>{p.name}</h1>
          <div style={{ fontSize: 12.5, color: faint }}>
            {p.maxTesters ? `${data.testers}/${p.maxTesters} testers` : plural(data.testers, 'tester')} · {plural(o?.bugs.open ?? 0, 'open bug')} · {data.counts.new ?? 0} new
            {p.leadId && <> · lead {data.people.find((x) => x.id === p.leadId)?.name ?? '—'}</>}
          </div>
        </div>
        {ended && p.status === 'open' && <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 999, padding: '3px 9px' }}>Ended</span>}
        {data.canManage ? (
          <select value={p.status} onChange={(e) => patch({ status: e.target.value }, 'Status changed')} aria-label="Program status" style={{ ...field, width: 'auto', maxWidth: '100%' }}>
            <option value="open">Open — taking testers and reports</option>
            <option value="closed">Closed — no new joins or reports</option>
            <option value="draft">Draft — link doesn’t work yet</option>
          </select>
        ) : <span style={{ fontSize: 12, color: muted, textTransform: 'uppercase' }}>{p.status}</span>}
      </div>

      {ended && (
        <div className="rounded-xl" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)', padding: '10px 14px', marginBottom: 12, fontSize: 13, color: ink }}>
          Sign-ups and new reports closed on {day(p.endsAt)}. Change the end date in Settings to reopen.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl" style={{ background: panel, border: `1px solid ${line}`, padding: '10px 14px', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: faint, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Join link</span>
        <code style={{ fontSize: 12.5, color: ink, flex: '1 1 160px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.joinUrl}</code>
        <button onClick={() => navigator.clipboard.writeText(p.joinUrl).then(() => toast.success('Join link copied — paste it where your testers are'))} className="bp-tap inline-flex items-center gap-1" style={{ fontSize: 12.5, color: accent, fontWeight: 600 }}><Copy size={13} /> Copy link</button>
        <a href={p.joinUrl} target="_blank" rel="noreferrer" className="bp-tap inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><ExternalLink size={13} /> Open</a>
        {data.canManage && (
          <button onClick={() => { if (window.confirm('Make a new join link? The current link stops working for people who haven’t joined yet. Testers who joined keep their access.')) patch({ regenerateLink: true }, 'New link made'); }}
            className="bp-tap inline-flex items-center gap-1" style={{ fontSize: 12.5, color: muted }}><RefreshCw size={13} /> New link</button>
        )}
      </div>

      <div className="bp-tabs" role="tablist" style={{ borderBottom: `1px solid ${line}`, marginBottom: 16 }}>
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
      {tab === 'settings' && <Settings key={p.updatedAt} ctx={ctx} teams={teams} onSave={(b) => patch(b, 'Saved')} onDelete={async () => {
        if (!window.confirm(`Delete ${p.name} with all its testers, reports, messages, payouts and calls? Their report tasks are removed from the task board too, and so are the team’s notifications about it. Rows already on connected Notion boards stay in Notion (delete them there if you want), and Plain keeps its copy of the testers’ contact details, reports and messages. Testers will be told the beta has ended. This can’t be undone.`)) return;
        await fetch(`/api/beta/programs/${id}`, { method: 'DELETE' }); toast.success('Program deleted'); router.push('/beta');
      }} />}

      {openReport && <ReportDrawer key={openReport} ctx={ctx} id={openReport} onClose={closeReport} />}
      {form?.kind === 'outreach' && <OutreachForm ctx={ctx} prefill={form.prefill} onClose={() => setForm(null)} />}
      {form?.kind === 'payout' && <PayoutForm ctx={ctx} prefill={form.prefill} onClose={() => setForm(null)} />}
      {form?.kind === 'report' && <LogReportForm ctx={ctx} prefill={form.prefill} onClose={() => setForm(null)} />}
    </div>
  );
}

/** First load: the page's shape right away instead of a bare "Loading…" (slow connections take seconds). */
function Skeleton() {
  const bar = (w: number | string, h = 12, mb = 0): React.CSSProperties => ({ width: w, height: h, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginBottom: mb });
  return (
    <div aria-busy="true" aria-label="Loading the program" style={{ minWidth: 0 }}>
      <style>{'@keyframes bpPulse{0%,100%{opacity:1}50%{opacity:.45}} .bp-sk{animation:bpPulse 1.4s ease-in-out infinite}'}</style>
      <div className="bp-sk">
        <div style={bar('min(320px, 70%)', 22, 8)} />
        <div style={bar('min(220px, 50%)', 12, 18)} />
        <div style={{ ...bar('100%', 44, 16), borderRadius: 12 }} />
        <div className="flex gap-3" style={{ marginBottom: 18, overflow: 'hidden' }}>{[70, 64, 120, 70, 60].map((w, i) => <div key={i} style={bar(w, 14)} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ ...bar('100%', 92), borderRadius: 12 }} />)}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: faint, marginTop: 12 }}>Loading the program…</div>
    </div>
  );
}
