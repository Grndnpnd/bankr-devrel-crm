'use client';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Check, RotateCcw, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useSubmissionStore, type DashboardWidget } from '@/store/useSubmissionStore';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';
import DataCard from '@/components/DataCard';

import {
  WIDGET_REGISTRY, widgetById, defaultLayout, reconcileLayout,
  SPAN_PRESETS, MIN_SPAN, MAX_SPAN,
} from '@/components/dashboard/widgetRegistry';

/* ─── Edit-mode controls overlaid on each widget ─── */
const WidgetControls: React.FC<{
  widget: DashboardWidget;
  label: string;
  onSpan: (span: number) => void;
  onHide: () => void;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
}> = ({ widget, label, onSpan, onHide, dragHandlers }) => {
  const presetActive = (v: number) => widget.span === v;
  const btn = (active: boolean): React.CSSProperties => ({
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, cursor: 'pointer',
    backgroundColor: active ? 'rgba(245,166,35,0.18)' : 'transparent',
    color: active ? '#F5A623' : '#8A8A8A',
    border: active ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(255,255,255,0.1)',
  });
  return (
    <div
      className="flex items-center gap-1.5 mb-2"
      style={{ padding: '6px 8px', backgroundColor: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 8 }}
    >
      <button
        {...dragHandlers}
        title="Drag to reorder"
        style={{ cursor: 'grab', color: '#8A8A8A', display: 'flex', touchAction: 'none', padding: '2px' }}
      >
        <GripVertical size={15} />
      </button>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#F0F0F0', flex: 1 }}>
        {label}
      </span>
      <button style={btn(presetActive(SPAN_PRESETS.S))} onClick={() => onSpan(SPAN_PRESETS.S)}>S</button>
      <button style={btn(presetActive(SPAN_PRESETS.M))} onClick={() => onSpan(SPAN_PRESETS.M)}>M</button>
      <button style={btn(presetActive(SPAN_PRESETS.L))} onClick={() => onSpan(SPAN_PRESETS.L)}>L</button>
      <button
        onClick={onHide}
        title="Hide this widget"
        style={{ ...btn(false), display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <EyeOff size={12} /> Hide
      </button>
    </div>
  );
};

/* ─── Dashboard Page ─── */
const Dashboard: React.FC = () => {
  const { dashboardLayout, loadDashboardLayout, saveDashboardLayout, savedPanels } = useSubmissionStore();
  const panelIds = useMemo(() => savedPanels.map((p) => p.id), [savedPanels]);
  const panelById = useMemo(() => new Map(savedPanels.map((p) => [p.id, p])), [savedPanels]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardWidget[]>(defaultLayout());

  // Load the saved layout once on mount.
  useEffect(() => { loadDashboardLayout(); }, [loadDashboardLayout]);
  // Keep the working copy in sync with the store (reconciled against the registry).
  useEffect(() => { setDraft(reconcileLayout(dashboardLayout, panelIds)); }, [dashboardLayout, panelIds]);

  const ordered = useMemo(() => [...draft].sort((a, b) => a.order - b.order), [draft]);
  const visible = ordered.filter((w) => w.visible);
  const hidden = ordered.filter((w) => !w.visible);

  const update = (id: string, patch: Partial<DashboardWidget>) =>
    setDraft((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  // Resequence order values 0..n based on current visual order.
  const resequence = (list: DashboardWidget[]): DashboardWidget[] =>
    list.map((w, i) => ({ ...w, order: i }));

  // ── Drag-to-reorder (pointer-based, no dependency) ──
  const dragId = useRef<string | null>(null);
  const onDragStart = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragId.current = id;
  };
  const onDragEnterCard = (overId: string) => {
    const from = dragId.current;
    if (!from || from === overId) return;
    setDraft((prev) => {
      const vis = [...prev].filter((w) => w.visible).sort((a, b) => a.order - b.order);
      const fromIdx = vis.findIndex((w) => w.id === from);
      const toIdx = vis.findIndex((w) => w.id === overId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = vis.splice(fromIdx, 1);
      vis.splice(toIdx, 0, moved);
      const reordered = resequence(vis);
      const hiddenOnes = prev.filter((w) => !w.visible);
      const map = new Map(reordered.map((w) => [w.id, w]));
      // hidden widgets keep their relative order after the visible block
      let next = reordered.slice();
      hiddenOnes.forEach((h, i) => next.push({ ...h, order: reordered.length + i }));
      return prev.map((w) => map.get(w.id) ?? next.find((n) => n.id === w.id) ?? w);
    });
  };
  const onDragEnd = () => { dragId.current = null; };

  // ── Drag-to-resize (right edge → change span on 12-col grid) ──
  const resizeRef = useRef<{ id: string; startX: number; startSpan: number; gridW: number } | null>(null);
  const onResizeStart = (id: string, span: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = (e.currentTarget as HTMLElement).closest('[data-dash-grid]') as HTMLElement | null;
    resizeRef.current = { id, startX: e.clientX, startSpan: span, gridW: grid?.clientWidth ?? 1200 };
    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd);
  };
  const onResizeMove = useCallback((e: PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const colW = r.gridW / 12;
    const deltaCols = Math.round((e.clientX - r.startX) / colW);
    const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, r.startSpan + deltaCols));
    setDraft((prev) => prev.map((w) => (w.id === r.id ? { ...w, span } : w)));
  }, []);
  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
    window.removeEventListener('pointermove', onResizeMove);
    window.removeEventListener('pointerup', onResizeEnd);
  }, [onResizeMove]);

  const save = async () => {
    await saveDashboardLayout(resequence(visible).concat(hidden.map((h, i) => ({ ...h, order: visible.length + i }))));
    setEditing(false);
  };
  const cancel = () => { setDraft(reconcileLayout(dashboardLayout, panelIds)); setEditing(false); };
  const reset = () => setDraft(defaultLayout());

  return (
    <div>
      {/* Header / edit toggle */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>
            Dashboard
          </h1>
          {editing && (
            <p style={{ fontSize: 12, color: '#8A8A8A', marginTop: 2 }}>
              Drag the handle to reorder, pick S/M/L or drag the right edge to resize, and hide widgets you don't need.
            </p>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}>
              <RotateCcw size={14} /> Reset
            </button>
            <button onClick={cancel} className="rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}>
              Cancel
            </button>
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: '#F5A623', color: '#0D0D0D' }}>
              <Check size={14} /> Done
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#F0F0F0' }}>
            <LayoutGrid size={15} /> Customize
          </button>
        )}
      </div>

      {/* Hidden widgets tray (edit mode only) */}
      {editing && hidden.length > 0 && (
        <div className="mb-5" style={{ padding: 12, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            Hidden widgets
          </div>
          <div className="flex flex-wrap gap-2">
            {hidden.map((w) => (
              <button
                key={w.id}
                onClick={() => update(w.id, { visible: true })}
                className="inline-flex items-center gap-1.5 rounded-md"
                style={{ fontSize: 12, fontWeight: 500, padding: '5px 10px', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}
              >
                <Eye size={13} /> {widgetById(w.id)?.label ?? (panelById.get(w.id)?.spec?.title || 'Saved panel')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The grid */}
      <div
        data-dash-grid
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}
      >
        {visible.map((w) => {
          const def = widgetById(w.id);
          const panel = !def ? panelById.get(w.id) : null;
          if (!def && !panel) return null;
          const Widget = def?.Component;
          return (
            <div
              key={w.id}
              style={{ gridColumn: `span ${w.span} / span ${w.span}`, position: 'relative' }}
              onPointerEnter={() => editing && onDragEnterCard(w.id)}
              onPointerUp={onDragEnd}
            >
              {editing && (
                <WidgetControls
                  widget={w}
                  label={def?.label ?? (panel?.spec?.title || 'Saved panel')}
                  onSpan={(span) => update(w.id, { span })}
                  onHide={() => update(w.id, { visible: false })}
                  dragHandlers={{ onPointerDown: onDragStart(w.id) }}
                />
              )}
              <div style={{ outline: editing ? '1px dashed rgba(245,166,35,0.25)' : 'none', borderRadius: 12, position: 'relative' }}>
                {Widget ? <Widget /> : (
                  <DataCard title={panel!.spec?.title || 'Panel'}>
                    <AnalyticsPanel spec={panel!.spec} compact />
                  </DataCard>
                )}
                {editing && (
                  <div
                    onPointerDown={onResizeStart(w.id, w.span)}
                    title="Drag to resize"
                    style={{
                      position: 'absolute', top: 0, right: -3, width: 8, height: '100%',
                      cursor: 'ew-resize', borderRadius: 4,
                    }}
                  >
                    <div style={{ position: 'absolute', top: '50%', right: 1, transform: 'translateY(-50%)', width: 3, height: 36, borderRadius: 2, backgroundColor: 'rgba(245,166,35,0.5)' }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!editing && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center" style={{ padding: '60px 0', color: '#525252' }}>
          <p style={{ fontSize: 14, marginBottom: 12 }}>Your dashboard is empty.</p>
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 14px', fontSize: 13, fontWeight: 600, backgroundColor: '#F5A623', color: '#0D0D0D' }}>
            <LayoutGrid size={15} /> Customize dashboard
          </button>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
