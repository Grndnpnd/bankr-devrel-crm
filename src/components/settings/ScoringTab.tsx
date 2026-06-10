'use client';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Info, RotateCcw, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import DataCard from '@/components/DataCard';
import { useSubmissionStore } from '@/store/useSubmissionStore';

// UI slider keys <-> scoring-engine keys
const UI_TO_ENGINE: Record<string, 'fees' | 'launched' | 'traction' | 'founder' | 'completeness'> = {
  onchain: 'fees',
  launched: 'launched',
  traction: 'traction',
  founder: 'founder',
  effort: 'completeness',
};
const toEngineWeights = (w: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const k of Object.keys(w)) out[UI_TO_ENGINE[k]] = w[k];
  return out as { fees: number; launched: number; traction: number; founder: number; completeness: number };
};
const fromEngineWeights = (e: Record<string, number>) => ({
  onchain: e.fees,
  launched: e.launched,
  traction: e.traction,
  founder: e.founder,
  effort: e.completeness,
});

interface PreviewRow { id: string; project: string; current: number; next: number; delta: number }
interface PreviewSummary { total: number; changed: number; avgAbsDelta: number; maxUp: number; maxDown: number }

interface ScoreComponent {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  maxSlider: number;
  color: string;
}

const components: ScoreComponent[] = [
  {
    key: 'onchain',
    label: 'Onchain Volume',
    description: 'log-scaled 24h trading volume',
    defaultValue: 40,
    maxSlider: 60,
    color: '#F5A623',
  },
  {
    key: 'launched',
    label: 'Launched',
    description: 'Token matched on Bankr',
    defaultValue: 15,
    maxSlider: 25,
    color: '#10B981',
  },
  {
    key: 'traction',
    label: 'Traction',
    description: 'Detected metrics in submission',
    defaultValue: 15,
    maxSlider: 25,
    color: '#3B82F6',
  },
  {
    key: 'founder',
    label: 'Founder',
    description: 'Pedigree keywords detected',
    defaultValue: 15,
    maxSlider: 25,
    color: '#F59E0B',
  },
  {
    key: 'effort',
    label: 'Effort / Completeness',
    description: 'Submission completeness',
    defaultValue: 15,
    maxSlider: 25,
    color: '#F59E0B',
  },
];

interface ScoringTabProps {
  onUnsavedChange?: (hasUnsaved: boolean) => void;
}

const ScoringTab: React.FC<ScoringTabProps> = ({ onUnsavedChange }) => {
  const subs = useSubmissionStore((s) => s.submissions);
  const reloadSubs = useSubmissionStore((s) => s.load);

  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    components.forEach((c) => (init[c.key] = c.defaultValue));
    return init;
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; summary: PreviewSummary } | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  // Load persisted weights on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/score-config');
        if (res.ok && alive) {
          const { weights: w } = await res.json();
          setWeights(fromEngineWeights(w));
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Notify parent of unsaved changes
  useEffect(() => {
    onUnsavedChange?.(hasChanges);
  }, [hasChanges, onUnsavedChange]);

  const total = useMemo(() => {
    return Object.values(weights).reduce((sum, v) => sum + v, 0);
  }, [weights]);

  const exceeds100 = total > 100;
  const under100 = total < 100;

  const handleSliderChange = useCallback((key: string, value: number) => {
    setWeights((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
    setHasChanges(true);
    setApplied(null);
  }, []);

  const handleReset = useCallback(() => {
    const reset: Record<string, number> = {};
    components.forEach((c) => (reset[c.key] = c.defaultValue));
    setWeights(reset);
    setHasChanges(true);
    setApplied(null);
  }, []);

  // Debounced server-side dry-run preview whenever dirty weights change.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasChanges || loading) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/score-config/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weights: toEngineWeights(weights) }),
        });
        if (res.ok) setPreview(await res.json());
      } catch {
        /* ignore preview errors */
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [weights, hasChanges, loading]);

  const handleSave = useCallback(async () => {
    if (exceeds100 || applying) return;
    setApplying(true);
    try {
      const res = await fetch('/api/score-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: toEngineWeights(weights) }),
      });
      if (res.ok) {
        const r = await res.json();
        setHasChanges(false);
        setPreview(null);
        setApplied(`Re-scored ${r.total} submissions · ${r.changed} changed`);
        reloadSubs(); // refresh dashboard/queue with new scores
      }
    } finally {
      setApplying(false);
    }
  }, [exceeds100, applying, weights, reloadSubs]);

  // Score badge color helper
  const getScoreColor = (score: number): string => {
    if (score >= 81) return '#34D399';
    if (score >= 61) return '#10B981';
    if (score >= 31) return '#F59E0B';
    return '#EF4444';
  };

  // Preview rows: real dry-run results when dirty, else current top submissions.
  const previewRows: PreviewRow[] = useMemo(() => {
    if (preview?.rows?.length) return preview.rows.slice(0, 8);
    return [...subs]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((s) => ({ id: s.id, project: s.project, current: s.score, next: s.score, delta: 0 }));
  }, [preview, subs]);

  return (
    <div className="max-w-[720px] mx-auto flex flex-col gap-6">
      {/* Score Configuration Card */}
      <DataCard title="Score Configuration" delay={0}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Info size={14} style={{ color: '#525252' }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: '#525252' }}>
              Each component contributes to the total developer project score (max 100)
            </span>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-150"
            style={{
              backgroundColor: 'transparent',
              color: '#8A8A8A',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#222222';
              e.currentTarget.style.color = '#F0F0F0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#8A8A8A';
            }}
          >
            <RotateCcw size={12} />
            Reset to Defaults
          </button>
        </div>

        {/* Formula display */}
        <div
          className="rounded-md p-3 mb-4"
          style={{
            backgroundColor: '#141414',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            color: '#8A8A8A',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          Score ={' '}
          {components.map((c, i) => (
            <span key={c.key}>
              <span style={{ color: c.color }}>{c.label}</span>
              {i < components.length - 1 && <span style={{ color: '#525252' }}> + </span>}
            </span>
          ))}
        </div>

        {/* Total indicator */}
        <div className="flex items-center justify-between">
          <span
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: '16px',
              fontWeight: 600,
              color: '#F0F0F0',
            }}
          >
            Max: {total} points
          </span>
          {exceeds100 && (
            <span
              className="px-3 py-1 rounded-md"
              style={{
                backgroundColor: 'rgba(245,158,11,0.12)',
                color: '#F59E0B',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Total exceeds 100 — scores will be normalized
            </span>
          )}
          {under100 && total === 100 === false && exceeds100 === false && (
            <span style={{ fontSize: '12px', color: '#525252' }}>
              Total: {total}/100
            </span>
          )}
          {total === 100 && (
            <span
              className="px-3 py-1 rounded-md"
              style={{
                backgroundColor: 'rgba(16,185,129,0.12)',
                color: '#10B981',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              Total: 100/100
            </span>
          )}
        </div>
      </DataCard>

      {/* Weight Sliders Card */}
      <DataCard title="Component Weights" delay={0.08}>
        <div className="flex flex-col gap-6">
          {components.map((comp, index) => (
            <motion.div
              key={comp.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                delay: index * 0.08,
                ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
              }}
              className="flex flex-col gap-2"
            >
              {/* Label row */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#F0F0F0',
                    }}
                  >
                    {comp.label}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '11px',
                      color: '#525252',
                    }}
                  >
                    {comp.description}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: '14px',
                    fontWeight: 600,
                    color: comp.color,
                  }}
                >
                  {weights[comp.key]} pts
                </span>
              </div>

              {/* Slider */}
              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={comp.maxSlider}
                  value={weights[comp.key]}
                  onChange={(e) => handleSliderChange(comp.key, Number(e.target.value))}
                  className="w-full scoring-slider"
                  style={{
                    '--track-color': '#222222',
                    '--fill-color': comp.color,
                    '--thumb-border': 'rgba(255,255,255,0.14)',
                    '--fill-percent': `${(weights[comp.key] / comp.maxSlider) * 100}%`,
                  } as React.CSSProperties}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={handleSave}
            disabled={!hasChanges || exceeds100 || applying}
            className="px-4 py-2 rounded-md transition-all duration-150"
            style={{
              backgroundColor: hasChanges && !exceeds100 ? '#F5A623' : '#2A2A2A',
              color: hasChanges && !exceeds100 ? '#0D0D0D' : '#525252',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
              cursor: hasChanges && !exceeds100 ? 'pointer' : 'not-allowed',
              opacity: hasChanges && !exceeds100 ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (hasChanges && !exceeds100) {
                e.currentTarget.style.backgroundColor = '#E8941A';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(245,166,35,0.15)';
              }
            }}
            onMouseLeave={(e) => {
              if (hasChanges && !exceeds100) {
                e.currentTarget.style.backgroundColor = '#F5A623';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {applying ? 'Applying…' : 'Save Changes'}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-md transition-all duration-150"
            style={{
              backgroundColor: 'transparent',
              color: '#8A8A8A',
              border: '1px solid rgba(255,255,255,0.1)',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#222222';
              e.currentTarget.style.color = '#F0F0F0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#8A8A8A';
            }}
          >
            Reset to Defaults
          </button>
          {hasChanges && (
            <span className="flex items-center gap-1.5" style={{ fontSize: '11px', color: '#F5A623' }}>
              <span
                className="block rounded-full"
                style={{ width: '6px', height: '6px', backgroundColor: '#F5A623' }}
              />
              Unsaved changes
            </span>
          )}
          {!hasChanges && applied && (
            <span style={{ fontSize: '11px', color: '#10B981' }}>{applied}</span>
          )}
        </div>
      </DataCard>

      {/* Live Preview Card */}
      <DataCard title="Live Preview" delay={0.16}>
        <p className="mb-4" style={{ fontSize: '12px', color: '#525252' }}>
          {preview
            ? `${preview.summary.changed} of ${preview.summary.total} scores change · avg \u00b1${preview.summary.avgAbsDelta} · top movers shown`
            : 'Adjust a weight to preview its impact on the live submissions'}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th
                  className="text-left py-2 px-3"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Project
                </th>
                <th
                  className="text-center py-2 px-3"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Current
                </th>
                <th
                  className="text-center py-2 px-3"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  New Score
                </th>
                <th
                  className="text-center py-2 px-3"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Delta
                </th>
                <th
                  className="text-center py-2 px-3"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#525252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Badge
                </th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                  className="transition-colors duration-150"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    backgroundColor: i % 2 === 0 ? '#141414' : '#1A1A1A',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222222';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#141414' : '#1A1A1A';
                  }}
                >
                  <td
                    className="py-3 px-3"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: '#F0F0F0',
                      fontWeight: 600,
                    }}
                  >
                    {row.project}
                  </td>
                  <td
                    className="text-center py-3 px-3"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: '#8A8A8A',
                    }}
                  >
                    {row.current}
                  </td>
                  <td
                    className="text-center py-3 px-3"
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: '14px',
                      fontWeight: 700,
                      color: getScoreColor(row.next),
                    }}
                  >
                    {row.next}
                  </td>
                  <td className="text-center py-3 px-3">
                    {row.delta > 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#10B981', fontSize: '12px' }}>
                        <ArrowUp size={12} />+{row.delta}
                      </span>
                    ) : row.delta < 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: '#EF4444', fontSize: '12px' }}>
                        <ArrowDown size={12} />
                        {row.delta}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ color: '#525252', fontSize: '12px' }}>
                        <Minus size={12} />0
                      </span>
                    )}
                  </td>
                  <td className="text-center py-3 px-3">
                    <span
                      className="inline-block rounded-full"
                      style={{
                        padding: '4px 10px',
                        backgroundColor: getScoreColor(row.next) + '22',
                        color: getScoreColor(row.next),
                        fontFamily: "'Manrope', sans-serif",
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {row.next}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataCard>
    </div>
  );
};

export default ScoringTab;
