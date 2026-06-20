'use client';
import React, { useState, useEffect, createContext, useContext } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, Cell,
} from 'recharts';
import { Tag, Users } from 'lucide-react';

/**
 * Support panels as dashboard widgets. They share one data fetch via SupportDataProvider
 * (so a dashboard with several support widgets makes a single API call). Each widget is
 * registered in the widget registry behind the support.view capability.
 */

interface SupportData {
  totals: { created: number; open: number; snoozed: number; done: number; resolvedInRange: number };
  volumeByDay: { date: string; count: number }[];
  volumeByChannel: { channel: string; count: number }[];
  responseTimes: { firstResponseMedianMin: number | null; firstResponseP90Min: number | null; resolutionMedianHours: number | null; resolutionP90Hours: number | null; measuredFirstResponse: number; measuredResolution: number };
  backlog: { todo: number; snoozed: number; done: number };
  byLabel: { label: string; count: number }[];
  byAssignee: { assignee: string; assigneeType: string; open: number; total: number }[];
}

const PURPLE = '#7c3aed';
const GOLD = '#F5A623';
const CHANNEL_COLORS = ['#7c3aed', '#F5A623', '#3b82f6', '#10b981', '#ef4444', '#6b7280'];

const SupportDataCtx = createContext<{ data: SupportData | null; loading: boolean }>({ data: null, loading: true });

// Module-level cache so multiple widgets mounting together share ONE fetch (30d default).
let _cache: { data: SupportData | null; at: number } | null = null;
let _inflight: Promise<SupportData | null> | null = null;

async function loadSupport(): Promise<SupportData | null> {
  if (_cache && Date.now() - _cache.at < 60_000) return _cache.data;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch('/api/support/dashboard');
      const data = res.ok ? await res.json() : null;
      _cache = { data, at: Date.now() };
      return data;
    } finally { _inflight = null; }
  })();
  return _inflight;
}

export const SupportDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<SupportData | null>(_cache?.data ?? null);
  const [loading, setLoading] = useState(!_cache);
  useEffect(() => { let on = true; loadSupport().then((d) => { if (on) { setData(d); setLoading(false); } }); return () => { on = false; }; }, []);
  return <SupportDataCtx.Provider value={{ data, loading }}>{children}</SupportDataCtx.Provider>;
};

function useSupport() { return useContext(SupportDataCtx); }

const cardLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 };
const Empty: React.FC = () => <div style={{ color: '#525252', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No support data in range.</div>;
const Loading: React.FC = () => <div style={{ color: '#525252', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading…</div>;

function fmtMin(m: number | null): string { if (m == null) return '—'; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); const r = m % 60; return r ? `${h}h ${r}m` : `${h}h`; }
function fmtHours(h: number | null): string { if (h == null) return '—'; if (h < 24) return `${h}h`; return `${Math.round((h / 24) * 10) / 10}d`; }

// ── Widget: Support KPIs ──
export const SupportKPIWidget: React.FC = () => {
  const { data, loading } = useSupport();
  if (loading) return <Loading />;
  if (!data) return <Empty />;
  const items = [
    { label: 'Created (30d)', value: data.totals.created, color: PURPLE },
    { label: 'Open now', value: data.totals.open, color: GOLD },
    { label: 'Resolved (30d)', value: data.totals.resolvedInRange, color: '#10b981' },
    { label: 'Median 1st response', value: fmtMin(data.responseTimes.firstResponseMedianMin), color: '#3b82f6' },
    { label: 'Median resolution', value: fmtHours(data.responseTimes.resolutionMedianHours), color: '#3b82f6' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div style={{ fontSize: 11, color: '#8A8A8A', fontWeight: 600, marginBottom: 4 }}>{it.label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
};

// ── Widget: Support volume over time ──
export const SupportVolumeWidget: React.FC = () => {
  const { data, loading } = useSupport();
  if (loading) return <Loading />;
  if (!data) return <Empty />;
  return (
    <div>
      <div style={cardLabel}>Support volume (threads created)</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data.volumeByDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs><linearGradient id="svol" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={PURPLE} stopOpacity={0.5} /><stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fill: '#8A8A8A', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis tick={{ fill: '#8A8A8A', fontSize: 11 }} allowDecimals={false} />
          <ReTooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} />
          <Area type="monotone" dataKey="count" stroke={PURPLE} strokeWidth={2} fill="url(#svol)" name="Threads" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── Widget: Backlog ──
export const SupportBacklogWidget: React.FC = () => {
  const { data, loading } = useSupport();
  if (loading) return <Loading />;
  if (!data) return <Empty />;
  const pill = (label: string, value: number, color: string) => (
    <div className="text-center"><div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 12, color: '#8A8A8A', marginTop: 2 }}>{label}</div></div>
  );
  return (
    <div>
      <div style={cardLabel}>Backlog (current status)</div>
      <div className="flex items-center justify-around" style={{ padding: '8px 0' }}>
        {pill('To do', data.backlog.todo, GOLD)}{pill('Snoozed', data.backlog.snoozed, '#6b7280')}{pill('Done', data.backlog.done, '#10b981')}
      </div>
    </div>
  );
};

// ── Widget: By channel ──
export const SupportChannelWidget: React.FC = () => {
  const { data, loading } = useSupport();
  if (loading) return <Loading />;
  if (!data || !data.volumeByChannel.length) return <Empty />;
  return (
    <div>
      <div style={cardLabel}>By channel</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data.volumeByChannel} dataKey="count" nameKey="channel" cx="50%" cy="50%" outerRadius={70} label={(e: any) => e.channel}>
            {data.volumeByChannel.map((_, i) => <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
          </Pie>
          <ReTooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── Widget: Topic breakdown ──
export const SupportLabelsWidget: React.FC = () => {
  const { data, loading } = useSupport();
  if (loading) return <Loading />;
  if (!data || !data.byLabel.length) return <Empty />;
  return (
    <div>
      <div style={cardLabel}><Tag size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Topic breakdown (labels)</div>
      <ResponsiveContainer width="100%" height={Math.max(140, data.byLabel.length * 30)}>
        <BarChart data={data.byLabel.slice(0, 12)} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#8A8A8A', fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fill: '#C8C8C8', fontSize: 12 }} width={120} />
          <ReTooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(124,58,237,0.08)' }} />
          <Bar dataKey="count" fill={PURPLE} radius={[0, 4, 4, 0]} name="Threads" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── Widget: Assignee workload ──
export const SupportAssigneeWidget: React.FC = () => {
  const { data, loading } = useSupport();
  if (loading) return <Loading />;
  if (!data || !data.byAssignee.length) return <Empty />;
  return (
    <div>
      <div style={cardLabel}><Users size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Assignee workload</div>
      <div className="flex flex-col gap-2">
        {data.byAssignee.slice(0, 12).map((a, i) => (
          <div key={i} className="flex items-center justify-between" style={{ padding: '8px 12px', backgroundColor: '#141414', borderRadius: 8 }}>
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13, color: '#F0F0F0', fontWeight: 500 }}>{a.assignee}</span>
              {a.assigneeType === 'machineUser' && <span style={{ fontSize: 10, fontWeight: 700, color: PURPLE, backgroundColor: 'rgba(124,58,237,0.15)', padding: '1px 6px', borderRadius: 4 }}>AI</span>}
            </div>
            <div className="flex items-center gap-3" style={{ fontSize: 12, color: '#8A8A8A' }}>
              <span><b style={{ color: GOLD }}>{a.open}</b> open</span><span><b style={{ color: '#C8C8C8' }}>{a.total}</b> total</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
