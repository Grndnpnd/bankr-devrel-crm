'use client';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Check, RotateCcw, EyeOff, GripVertical } from 'lucide-react';
import { useSubmissionStore, type DashboardWidget } from '@/store/useSubmissionStore';
import AnalyticsPanel from '@/components/analytics/AnalyticsPanel';
import DataCard from '@/components/DataCard';

import {
  WIDGET_REGISTRY, widgetById, defaultLayout, reconcileLayout,
  SPAN_PRESETS, MIN_SPAN, MAX_SPAN,
  HEIGHT_PRESETS, MIN_HEIGHT, MAX_HEIGHT,
} from '@/components/dashboard/widgetRegistry';

/* ─── Edit-mode controls overlaid on each widget ─── */
const WidgetControls: React.FC<{
  widget: DashboardWidget;
  label: string;
  onSpan: (span: number) => void;
  onHeight: (h: number | null) => void;
  onHide: () => void;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
  };
}> = ({ widget, label, onSpan, onHeight, onHide, dragHandlers }) => {
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
      <span style={{ fontSize: 10, color: '#525252', fontWeight: 600 }}>W</span>
      <button style={btn(presetActive(SPAN_PRESETS.S))} onClick={() => onSpan(SPAN_PRESETS.S)}>S</button>
      <button style={btn(presetActive(SPAN_PRESETS.M))} onClick={() => onSpan(SPAN_PRESETS.M)}>M</button>
      <button style={btn(presetActive(SPAN_PRESETS.L))} onClick={() => onSpan(SPAN_PRESETS.L)}>L</button>
      <span style={{ fontSize: 10, color: '#525252', fontWeight: 600, marginLeft: 4 }}>H</span>
      <button style={btn(widget.height === HEIGHT_PRESETS.S)} onClick={() => onHeight(HEIGHT_PRESETS.S)}>S</button>
      <button style={btn(widget.height === HEIGHT_PRESETS.M)} onClick={() => onHeight(HEIGHT_PRESETS.M)}>M</button>
      <button style={btn(widget.height === HEIGHT_PRESETS.L)} onClick={() => onHeight(HEIGHT_PRESETS.L)}>L</button>
      <button style={btn(widget.height == null)} onClick={() => onHeight(null)} title="Auto height (fit content)">Auto</button>
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

  // ── Drag-to-resize height (bottom edge) ──
  const vResizeRef = useRef<{ id: string; startY: number; startH: number } | null>(null);
  const onVResizeStart = (id: string, currentH: number | null) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest('[data-widget-body]') as HTMLElement | null;
    const startH = currentH ?? (el?.offsetHeight ?? MIN_HEIGHT);
    vResizeRef.current = { id, startY: e.clientY, startH };
    window.addEventListener('pointermove', onVResizeMove);
    window.addEventListener('pointerup', onVResizeEnd);
  };
  const onVResizeMove = useCallback((e: PointerEvent) => {
    const r = vResizeRef.current;
    if (!r) return;
    const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, r.startH + (e.clientY - r.startY)));
    setDraft((prev) => prev.map((w) => (w.id === r.id ? { ...w, height: h } : w)));
  }, []);
  const onVResizeEnd = useCallback(() => {
    vResizeRef.current = null;
    window.removeEventListener('pointermove', onVResizeMove);
    window.removeEventListener('pointerup', onVResizeEnd);
  }, [onVResizeMove]);

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

      {/* Add container picker (edit mode) — scales past a handful of saved panels */}
      {editing && (
        <div className="mb-5 flex items-center gap-3" style={{ padding: 12, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Add container
          </span>
          {hidden.length > 0 ? (
            <select
              value=""
              onChange={(e) => { if (e.target.value) update(e.target.value, { visible: true }); }}
              style={{ flex: 1, maxWidth: 360, height: 34, padding: '0 10px', fontSize: 13, color: '#F0F0F0', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer' }}
            >
              <option value="" style={{ color: '#525252' }}>Choose a container to add…</option>
              {hidden.some((w) => widgetById(w.id)) && (
                <optgroup label="Built-in">
                  {hidden.filter((w) => widgetById(w.id)).map((w) => (
                    <option key={w.id} value={w.id}>{widgetById(w.id)!.label}</option>
                  ))}
                </optgroup>
              )}
              {hidden.some((w) => panelById.get(w.id)) && (
                <optgroup label="Saved panels">
                  {hidden.filter((w) => panelById.get(w.id)).map((w) => (
                    <option key={w.id} value={w.id}>{panelById.get(w.id)?.spec?.title || 'Saved panel'}</option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : (
            <span style={{ fontSize: 13, color: '#525252' }}>Everything's already on your dashboard.</span>
          )}
          <span style={{ fontSize: 12, color: '#525252' }}>{hidden.length} available</span>
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
                  onHeight={(height) => update(w.id, { height })}
                  onHide={() => update(w.id, { visible: false })}
                  dragHandlers={{ onPointerDown: onDragStart(w.id) }}
                />
              )}
              <div
                data-widget-body
                style={{
                  outline: editing ? '1px dashed rgba(245,166,35,0.25)' : 'none',
                  borderRadius: 12, position: 'relative',
                  height: w.height ? `${w.height}px` : undefined,
                  overflow: w.height ? 'auto' : undefined,
                }}
              >
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
                {editing && (
                  <div
                    onPointerDown={onVResizeStart(w.id, w.height ?? null)}
                    title="Drag to resize height"
                    style={{ position: 'absolute', left: 0, bottom: -3, width: '100%', height: 8, cursor: 'ns-resize' }}
                  >
                    <div style={{ position: 'absolute', left: '50%', bottom: 1, transform: 'translateX(-50%)', width: 36, height: 3, borderRadius: 2, backgroundColor: 'rgba(245,166,35,0.5)' }} />
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
