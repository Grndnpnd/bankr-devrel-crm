'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, Cell,
} from 'recharts';
import { LifeBuoy, Clock, Inbox, CheckCircle2, Tag, Users } from 'lucide-react';

interface Dashboard {
  range: { from: string; to: string };
  totals: { created: number; open: number; snoozed: number; done: number; resolvedInRange: number };
  volumeByDay: { date: string; count: number }[];
  volumeByChannel: { channel: string; count: number }[];
  responseTimes: {
    firstResponseMedianMin: number | null; firstResponseP90Min: number | null;
    resolutionMedianHours: number | null; resolutionP90Hours: number | null;
    measuredFirstResponse: number; measuredResolution: number;
  };
  backlog: { todo: number; snoozed: number; done: number };
  byLabel: { label: string; count: number }[];
  byAssignee: { assignee: string; assigneeType: string; open: number; total: number }[];
}

const PURPLE = '#7c3aed';
const GOLD = '#F5A623';
const CHANNEL_COLORS = ['#7c3aed', '#F5A623', '#3b82f6', '#10b981', '#ef4444', '#6b7280'];

const card: React.CSSProperties = {
  backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 18,
};
const cardLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#8A8A8A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12,
};

function fmtMin(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
function fmtHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 24) return `${h}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

const SupportDashboard: React.FC = () => {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const [from, setFrom] = useState(isoDate(monthAgo));
  const [to, setTo] = useState(isoDate(today));
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fromIso = new Date(from + 'T00:00:00Z').toISOString();
      const toIso = new Date(to + 'T23:59:59Z').toISOString();
      const res = await fetch(`/api/support/dashboard?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Header + range picker */}
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 20 }}>
        <div className="flex items-center gap-2">
          <LifeBuoy size={20} style={{ color: PURPLE }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>Support</h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#F0F0F0' }} />
          <span style={{ color: '#525252', fontSize: 13 }}>→</span>
          <input type="date" value={to} min={from} max={isoDate(today)} onChange={(e) => setTo(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#F0F0F0' }} />
          <div className="flex items-center gap-1" style={{ marginLeft: 6 }}>
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => { setFrom(isoDate(new Date(today.getTime() - d * 864e5))); setTo(isoDate(today)); }}
                style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#8A8A8A', cursor: 'pointer' }}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ color: '#525252', fontSize: 14 }}>Loading support metrics…</div>
      ) : !data ? (
        <div style={{ color: '#525252', fontSize: 14 }}>Couldn’t load support data.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Top stat row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Stat icon={Inbox} label="Created (range)" value={data.totals.created} color={PURPLE} />
            <Stat icon={LifeBuoy} label="Open now" value={data.totals.open} color={GOLD} />
            <Stat icon={CheckCircle2} label="Resolved (range)" value={data.totals.resolvedInRange} color="#10b981" />
            <Stat icon={Clock} label="Median 1st response" value={fmtMin(data.responseTimes.firstResponseMedianMin)} color="#3b82f6" small />
            <Stat icon={Clock} label="Median resolution" value={fmtHours(data.responseTimes.resolutionMedianHours)} color="#3b82f6" small />
          </div>

          {/* Volume over time */}
          <div style={card}>
            <div style={cardLabel}>Volume over time (threads created)</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.volumeByDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PURPLE} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={PURPLE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: '#8A8A8A', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: '#8A8A8A', fontSize: 11 }} allowDecimals={false} />
                <ReTooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke={PURPLE} strokeWidth={2} fill="url(#volFill)" name="Threads" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Two-up: backlog + channels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div style={card}>
              <div style={cardLabel}>Backlog (current status)</div>
              <div className="flex items-center justify-around" style={{ padding: '8px 0' }}>
                <BacklogPill label="To do" value={data.backlog.todo} color={GOLD} />
                <BacklogPill label="Snoozed" value={data.backlog.snoozed} color="#6b7280" />
                <BacklogPill label="Done" value={data.backlog.done} color="#10b981" />
              </div>
            </div>
            <div style={card}>
              <div style={cardLabel}>By channel</div>
              {data.volumeByChannel.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={data.volumeByChannel} dataKey="count" nameKey="channel" cx="50%" cy="50%" outerRadius={70} label={(e: any) => e.channel}>
                      {data.volumeByChannel.map((_, i) => <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />)}
                    </Pie>
                    <ReTooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Labels / topic breakdown */}
          <div style={card}>
            <div style={cardLabel}><Tag size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Topic breakdown (labels)</div>
            {data.byLabel.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={Math.max(140, data.byLabel.length * 32)}>
                <BarChart data={data.byLabel.slice(0, 12)} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#8A8A8A', fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fill: '#C8C8C8', fontSize: 12 }} width={120} />
                  <ReTooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(124,58,237,0.08)' }} />
                  <Bar dataKey="count" fill={PURPLE} radius={[0, 4, 4, 0]} name="Threads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Assignee workload */}
          <div style={card}>
            <div style={cardLabel}><Users size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Assignee workload</div>
            {data.byAssignee.length === 0 ? <Empty /> : (
              <div className="flex flex-col gap-2">
                {data.byAssignee.slice(0, 12).map((a, i) => (
                  <div key={i} className="flex items-center justify-between" style={{ padding: '8px 12px', backgroundColor: '#141414', borderRadius: 8 }}>
                    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#F0F0F0', fontWeight: 500 }}>{a.assignee}</span>
                      {a.assigneeType === 'machineUser' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: PURPLE, backgroundColor: 'rgba(124,58,237,0.15)', padding: '1px 6px', borderRadius: 4 }}>AI</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3" style={{ fontSize: 12, color: '#8A8A8A' }}>
                      <span><b style={{ color: GOLD }}>{a.open}</b> open</span>
                      <span><b style={{ color: '#C8C8C8' }}>{a.total}</b> total</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Response-time detail */}
          <div style={card}>
            <div style={cardLabel}>Response & resolution (median / p90)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <TimeStat label="First response · median" value={fmtMin(data.responseTimes.firstResponseMedianMin)} n={data.responseTimes.measuredFirstResponse} />
              <TimeStat label="First response · p90" value={fmtMin(data.responseTimes.firstResponseP90Min)} n={data.responseTimes.measuredFirstResponse} />
              <TimeStat label="Resolution · median" value={fmtHours(data.responseTimes.resolutionMedianHours)} n={data.responseTimes.measuredResolution} />
              <TimeStat label="Resolution · p90" value={fmtHours(data.responseTimes.resolutionP90Hours)} n={data.responseTimes.measuredResolution} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; color: string; small?: boolean }> = ({ icon: Icon, label, value, color, small }) => (
  <div style={card}>
    <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
      <Icon size={14} style={{ color }} />
      <span style={{ fontSize: 11, color: '#8A8A8A', fontWeight: 600 }}>{label}</span>
    </div>
    <div style={{ fontSize: small ? 20 : 28, fontWeight: 700, color: '#F0F0F0' }}>{value}</div>
  </div>
);

const BacklogPill: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="text-center">
    <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 12, color: '#8A8A8A', marginTop: 2 }}>{label}</div>
  </div>
);

const TimeStat: React.FC<{ label: string; value: string; n: number }> = ({ label, value, n }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>{value}</div>
    <div style={{ fontSize: 12, color: '#8A8A8A', marginTop: 2 }}>{label}</div>
    <div style={{ fontSize: 10.5, color: '#525252', marginTop: 1 }}>n={n}</div>
  </div>
);

const Empty: React.FC = () => <div style={{ color: '#525252', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No data in this range.</div>;

export default SupportDashboard;
