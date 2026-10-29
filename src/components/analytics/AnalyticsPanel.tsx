'use client';
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { executeSpec, colorAt, isServerSource, sourceOf, type AnalyticsSpec, type PanelResult } from '@/lib/analyticsSpec';
import { formatUsd } from '@/data/stats';

const USD_FIELDS = new Set(['vol_24h', 'market_cap', 'fees_24h']);

function fmtValue(spec: AnalyticsSpec, n: number): string {
  if (spec.metric && spec.metric !== 'count' && spec.metricField && USD_FIELDS.has(spec.metricField)) {
    return formatUsd(n);
  }
  return num(n);
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T/;
// Floats from data files arrive as 0.0010890000000000001: show 6 significant digits.
const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : Number(n.toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 10 }));
const cell = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : typeof v === 'number' ? num(v) : typeof v === 'string' && ISO_TIME.test(v) ? v.slice(0, 10) : String(v ?? '—'));
const rowNoun = (spec: AnalyticsSpec, n: number) => {
  const noun = { beta_reports: 'report', beta_testers: 'tester', beta_outreach: 'message', beta_payouts: 'payout', artifacts: 'artifact', artifact_data: 'row' }[spec.source ?? ''] ?? 'project';
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
};

/** Pipeline panels run here on the loaded submissions; other sources run on the server as the viewer. */
function useRemoteResult(spec: AnalyticsSpec) {
  const key = JSON.stringify(spec);
  const [state, setState] = useState<{ result?: PanelResult; error?: string }>({});
  useEffect(() => {
    if (!isServerSource(spec)) return;
    let alive = true;
    const load = () => fetch('/api/panels/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: `{"spec":${key}}` })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (alive) setState(r.ok ? { result: d.result } : { error: d.error || 'Couldn’t load this panel.' });
      })
      .catch(() => alive && setState((s) => (s.result ? s : { error: 'Couldn’t load this panel.' })));
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
  return state;
}

/** Renders a saved analytics spec by executing it live against its data. */
const AnalyticsPanel: React.FC<{ spec: AnalyticsSpec; compact?: boolean }> = ({ spec, compact }) => {
  // A spec without `source` (every panel saved before sources existed) is a pipeline panel.
  const subs = useSubmissionStore((st) => st.submissions);
  const remote = useRemoteResult(spec);
  const local = useMemo(() => (isServerSource(spec) ? null : executeSpec(spec, subs)), [spec, subs]);
  const result = local ?? remote.result;
  if (!result) {
    return (
      <div className="flex items-center justify-center" style={{ padding: '32px 16px', color: remote.error ? '#EF4444' : '#525252', fontSize: 13, textAlign: 'center' }}>
        {remote.error ?? `Loading ${sourceOf(spec).label.toLowerCase()}…`}
      </div>
    );
  }

  if (result.type === 'stat') {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: compact ? '12px 0' : '28px 0' }}>
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: compact ? 32 : 44, fontWeight: 700, color: '#F5A623', lineHeight: 1 }}>
          {fmtValue(spec, result.value ?? 0)}
        </span>
        <span style={{ fontSize: 12, color: '#8A8A8A', marginTop: 8 }}>{result.metricLabel}</span>
        <span style={{ fontSize: 11, color: '#525252', marginTop: 2 }}>{rowNoun(spec, result.matched ?? 0)} matched</span>
      </div>
    );
  }

  if (result.type === 'table') {
    const cols = result.columns ?? [];
    const rows = result.rows ?? [];
    if (!rows.length) return <Empty />;
    return (
      <div style={{ overflowX: 'auto', maxHeight: compact ? 240 : 360, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '6px 10px', color: '#525252', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', position: 'sticky', top: 0, background: '#1A1A1A', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {c.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {cols.map((c) => (
                  <td key={c} style={{ padding: '6px 10px', color: '#C9C9C9', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {USD_FIELDS.has(c) && !isServerSource(spec) && typeof r[c] === 'number' ? formatUsd(r[c] as number) : cell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // bar / pie
  const series = result.series ?? [];
  if (!series.length) return <Empty />;

  if (result.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={compact ? 200 : 260}>
        <PieChart>
          <Pie data={series} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
            {series.map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [fmtValue(spec, v), n]} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (result.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={compact ? 200 : 280}>
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false} allowDecimals={spec.metric !== undefined && spec.metric !== 'count'} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtValue(spec, v), result.metricLabel]} />
          <Line type="monotone" dataKey="value" stroke={colorAt(0)} strokeWidth={2} dot={series.length <= 30} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={compact ? 200 : 280}>
      <BarChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 12) + '…' : v)} />
        <YAxis tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false} allowDecimals={spec.metric !== undefined && spec.metric !== 'count'} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(245,166,35,0.06)' }} formatter={(v: number) => [fmtValue(spec, v), result.metricLabel]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {series.map((_, i) => <Cell key={i} fill={colorAt(i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

const tooltipStyle: React.CSSProperties = {
  backgroundColor: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12, color: '#F0F0F0',
};

const Empty: React.FC = () => (
  <div className="flex items-center justify-center" style={{ padding: '32px 0', color: '#525252', fontSize: 13 }}>
    No matching data right now.
  </div>
);

export default AnalyticsPanel;
