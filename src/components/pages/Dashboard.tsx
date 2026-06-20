'use client';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Check, RotateCcw, EyeOff, GripVertical, BookmarkPlus, Users, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useSubmissionStore, type DashboardWidget } from '@/store/useSubmissionStore';
import { SupportDataProvider } from '@/components/dashboard/widgets/SupportWidgets';
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
const DashboardInner: React.FC = () => {
  const { dashboardLayout, dashboardDefault, loadDashboardLayout, saveDashboardLayout, saveDashboardDefault, savedPanels, togglePanelVisibility, removeSavedPanel, dashboardLayouts, activeLayoutId, saveNamedLayout, renameLayout, deleteLayout, userCapabilities } = useSubmissionStore();
  const capsSet = useMemo(() => new Set(userCapabilities), [userCapabilities]);
  const activeLayout = dashboardLayouts.find((l) => l.id === activeLayoutId) || null;
  const panelIds = useMemo(() => savedPanels.map((p) => p.id), [savedPanels]);
  const panelById = useMemo(() => new Map(savedPanels.map((p) => [p.id, p])), [savedPanels]);
  const myPanels = useMemo(() => savedPanels.filter((p) => p.mine), [savedPanels]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardWidget[]>(defaultLayout());

  // Load the saved layout once on mount.
  useEffect(() => { loadDashboardLayout(); }, [loadDashboardLayout]);
  // Keep the working copy in sync with the store (reconciled against the registry).
  useEffect(() => { setDraft(reconcileLayout(dashboardLayout, panelIds, capsSet)); }, [dashboardLayout, panelIds]);

  const ordered = useMemo(() => [...draft].sort((a, b) => a.order - b.order), [draft]);

  // Pillar view filter — only meaningful for users who can see BOTH pillars (e.g. admin,
  // engineering, or someone granted both). Lets them focus the dashboard on one pillar or
  // see everything. Doesn't alter the saved layout — it's a view filter only.
  const hasDevrel = capsSet.has('devrel.view');
  const hasSupport = capsSet.has('support.view');
  const bothPillars = hasDevrel && hasSupport;
  const [pillarView, setPillarView] = useState<'all' | 'devrel' | 'support'>('all');
  const widgetPillar = (id: string): 'devrel' | 'support' | undefined => widgetById(id)?.pillar;

  const visible = useMemo(() => {
    if (pillarView === 'all') return ordered.filter((w) => w.visible);
    // Focused on one pillar: show that pillar's widgets that are visible in the layout OR
    // default-visible (so a stale saved layout that predates support widgets still shows
    // them when you switch to the Support view). Other-pillar widgets are hidden.
    return ordered.filter((w) => {
      const p = widgetPillar(w.id);
      if (p && p !== pillarView) return false;
      if (!p) return w.visible; // pillar-less (saved panels): respect layout
      const def = widgetById(w.id);
      return w.visible || !!def?.defaultVisible;
    });
  }, [ordered, pillarView]);
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
  const cancel = () => { setDraft(reconcileLayout(dashboardLayout, panelIds, capsSet)); setEditing(false); };
  const reset = () => setDraft(reconcileLayout(dashboardDefault, panelIds, capsSet));
  const saveAsDefault = async () => {
    const snapshot = resequence(visible).concat(hidden.map((h, i) => ({ ...h, order: visible.length + i })));
    await saveDashboardDefault(snapshot);
    toast.success('Saved as your default', { description: 'Reset will now return to this layout.' });
  };
  const snapshotNow = () => resequence(visible).concat(hidden.map((h, i) => ({ ...h, order: visible.length + i })));
  const saveAsLayout = async () => {
    const name = window.prompt('Name this layout:', activeLayout ? `${activeLayout.name} copy` : 'My layout');
    if (name === null) return; // cancelled
    const entry = await saveNamedLayout(name, snapshotNow());
    if (entry) { setEditing(false); toast.success(`Saved layout "${entry.name}"`, { description: 'Find it under Dashboard in the sidebar.' }); }
  };
  const updateActiveLayout = async () => {
    if (!activeLayout) return;
    await saveNamedLayout(activeLayout.name, snapshotNow(), activeLayout.id);
    setEditing(false);
    toast.success(`Updated "${activeLayout.name}"`);
  };

  return (
    <div>
      {/* Header / edit toggle */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 700, color: '#F0F0F0' }}>
            Dashboard
          </h1>
          {/* Pillar view toggle — only for users with both pillars */}
          {bothPillars && !editing && (
            <div className="flex items-center" style={{ backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 2 }}>
              {([['all', 'All'], ['devrel', 'DevRel'], ['support', 'Support']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setPillarView(key)}
                  style={{
                    padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
                    backgroundColor: pillarView === key ? '#F5A623' : 'transparent',
                    color: pillarView === key ? '#0D0D0D' : '#8A8A8A',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-2">
            {activeLayout && (
              <button onClick={updateActiveLayout} title={`Update the "${activeLayout.name}" layout`} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(245,166,35,0.3)', color: '#F5A623' }}>
                <Save size={14} /> Update “{activeLayout.name}”
              </button>
            )}
            <button onClick={saveAsLayout} title="Save the current arrangement as a named layout" className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}>
              <LayoutGrid size={14} /> Save as layout
            </button>
            <button onClick={saveAsDefault} title="Save current layout as your reset point" className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}>
              <BookmarkPlus size={14} /> Save as default
            </button>
            <button onClick={reset} title={dashboardDefault ? 'Reset to your saved default' : 'Reset to factory layout'} className="inline-flex items-center gap-1.5 rounded-md" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 600, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8A8A8A' }}>
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
              {hidden.some((w) => panelById.get(w.id)?.mine) && (
                <optgroup label="My panels">
                  {hidden.filter((w) => panelById.get(w.id)?.mine).map((w) => (
                    <option key={w.id} value={w.id}>
                      {panelById.get(w.id)?.title || panelById.get(w.id)?.spec?.title || 'Saved panel'}
                      {panelById.get(w.id)?.isPublic ? ' · shared' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {hidden.some((w) => { const p = panelById.get(w.id); return p && !p.mine; }) && (
                <optgroup label="Shared by team">
                  {hidden.filter((w) => { const p = panelById.get(w.id); return p && !p.mine; }).map((w) => (
                    <option key={w.id} value={w.id}>
                      {panelById.get(w.id)?.title || 'Panel'} · {panelById.get(w.id)?.ownerName}
                    </option>
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

      {/* Layout manager (edit mode) — rename / delete saved named layouts */}
      {editing && dashboardLayouts.length > 0 && (
        <div className="mb-5" style={{ padding: 12, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            Saved layouts
          </div>
          <div className="flex flex-col gap-1.5">
            {dashboardLayouts.map((l) => (
              <div key={l.id} className="flex items-center justify-between" style={{ padding: '6px 10px', borderRadius: 8, backgroundColor: l.id === activeLayoutId ? 'rgba(245,166,35,0.1)' : '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13, color: '#F0F0F0' }}>{l.name}{l.id === activeLayoutId ? ' · active' : ''}</span>
                <div className="flex items-center gap-1">
                  <button onClick={async () => { const n = window.prompt('Rename layout:', l.name); if (n) await renameLayout(l.id, n); }} title="Rename" className="rounded p-1" style={{ color: '#8A8A8A', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    Rename
                  </button>
                  <button onClick={async () => { if (window.confirm(`Delete layout "${l.name}"?`)) await deleteLayout(l.id); }} title="Delete" className="rounded p-1" style={{ color: '#E5544B', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panel manager (edit mode) — toggle sharing / delete your own LLM panels */}
      {editing && myPanels.length > 0 && (
        <div className="mb-5" style={{ padding: 12, borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#525252', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            Manage my panels
          </div>
          <div className="flex flex-col gap-1.5">
            {myPanels.map((p) => (
              <div key={p.id} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                <span style={{ flex: 1, color: '#C9C9C9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title || p.spec?.title || 'Saved panel'}
                </span>
                <button
                  onClick={() => togglePanelVisibility(p.id, !p.isPublic)}
                  title={p.isPublic ? 'Shared with team — click to make private' : 'Private — click to share with team'}
                  className="inline-flex items-center gap-1 rounded-md"
                  style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px',
                    backgroundColor: p.isPublic ? 'rgba(245,166,35,0.18)' : 'transparent',
                    border: p.isPublic ? '1px solid rgba(245,166,35,0.4)' : '1px solid rgba(255,255,255,0.12)',
                    color: p.isPublic ? '#F5A623' : '#8A8A8A' }}>
                  <Users size={12} /> {p.isPublic ? 'Shared' : 'Private'}
                </button>
                <button onClick={() => removeSavedPanel(p.id)} title="Delete panel"
                  className="flex items-center justify-center rounded-md" style={{ width: 26, height: 26, color: '#525252', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
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
                  label={def?.label ?? (panel?.title || panel?.spec?.title || 'Saved panel')}
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
                  <DataCard title={panel!.title || panel!.spec?.title || 'Panel'}>
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

const Dashboard: React.FC = () => (
  <SupportDataProvider>
    <DashboardInner />
  </SupportDataProvider>
);

export default Dashboard;
