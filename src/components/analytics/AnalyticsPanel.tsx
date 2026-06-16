'use client';
import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { useSubmissionStore } from '@/store/useSubmissionStore';
import { executeSpec, colorAt, type AnalyticsSpec, type PanelResult } from '@/lib/analyticsSpec';
import { formatUsd } from '@/data/stats';

const USD_FIELDS = new Set(['vol_24h', 'market_cap', 'fees_24h']);

function fmtValue(spec: AnalyticsSpec, n: number): string {
  if (spec.metric && spec.metric !== 'count' && spec.metricField && USD_FIELDS.has(spec.metricField)) {
    return formatUsd(n);
  }
  return n.toLocaleString();
}

/** Renders a saved analytics spec by executing it live against current submissions. */
const AnalyticsPanel: React.FC<{ spec: AnalyticsSpec; compact?: boolean }> = ({ spec, compact }) => {
  const subs = useSubmissionStore((st) => st.submissions);
  const result: PanelResult = useMemo(() => executeSpec(spec, subs), [spec, subs]);

  if (result.type === 'stat') {
    return (
      <div className="flex flex-col items-center justify-center" style={{ padding: compact ? '12px 0' : '28px 0' }}>
        <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: compact ? 32 : 44, fontWeight: 700, color: '#F5A623', lineHeight: 1 }}>
          {fmtValue(spec, result.value ?? 0)}
        </span>
        <span style={{ fontSize: 12, color: '#8A8A8A', marginTop: 8 }}>{result.metricLabel}</span>
        <span style={{ fontSize: 11, color: '#525252', marginTop: 2 }}>{result.matched} project{result.matched === 1 ? '' : 's'} matched</span>
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
                    {USD_FIELDS.has(c) && typeof r[c] === 'number' ? formatUsd(r[c] as number) : String(r[c] ?? '—')}
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

  return (
    <ResponsiveContainer width="100%" height={compact ? 200 : 280}>
      <BarChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 12) + '…' : v)} />
        <YAxis tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false} />
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
