'use client';
import React from 'react';
import type { DashboardWidget } from '@/store/useSubmissionStore';

import KPIStrip from '@/components/dashboard/widgets/KPIStripWidget';
import ScoreDistributionChart from '@/components/dashboard/widgets/ScoreDistributionWidget';
import PipelineFunnel from '@/components/dashboard/widgets/PipelineWidget';
import TopTargetsTable from '@/components/dashboard/widgets/TopTargetsWidget';
import QuickActions from '@/components/dashboard/widgets/QuickActionsWidget';
import {
  DonutChart, FeeLeadersChart, SubmissionTrendChart, OutreachTable,
} from '@/components/pages/Analytics';

/** Span presets on a 12-column grid. */
export const SPAN_PRESETS = { S: 4, M: 6, L: 12 } as const;
export const HEIGHT_PRESETS = { S: 240, M: 380, L: 560 } as const;
export const MIN_HEIGHT = 160;
export const MAX_HEIGHT = 900;
export const MIN_SPAN = 3;
export const MAX_SPAN = 12;

export interface WidgetDef {
  id: string;
  label: string;
  description: string;
  defaultSpan: number;
  defaultVisible: boolean;
  Component: React.FC;
}

/**
 * The catalog of available dashboard widgets.
 * Order here = the factory default top-to-bottom order. `defaultVisible` controls
 * what's on the dashboard out of the box; everything else lives in the picker.
 */
export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── Factory default dashboard (top to bottom) ──
  { id: 'kpi-strip', label: 'Key Metrics', description: 'Top-line counts: submissions, live, score, new this week', defaultSpan: 12, defaultVisible: true, Component: KPIStrip },
  { id: 'score-distribution', label: 'Score Distribution', description: 'How submissions spread across score ranges', defaultSpan: 7, defaultVisible: true, Component: ScoreDistributionChart },
  { id: 'pipeline', label: 'Pipeline', description: 'Submissions by stage', defaultSpan: 5, defaultVisible: true, Component: PipelineFunnel },
  { id: 'top-targets', label: 'Top Targets', description: 'Highest-scoring projects to act on', defaultSpan: 12, defaultVisible: true, Component: TopTargetsTable },
  // ── Available in the picker, hidden by default ──
  { id: 'quick-actions', label: 'Quick Actions', description: 'Import, add a submission, and shortcuts', defaultSpan: 12, defaultVisible: false, Component: QuickActions },
  { id: 'an-needs-help', label: 'Needs-Help Distribution', description: 'Breakdown of what projects need help with', defaultSpan: 6, defaultVisible: false, Component: DonutChart },
  { id: 'an-top-volume', label: 'Top Projects by 24h Volume', description: 'Highest onchain volume right now', defaultSpan: 6, defaultVisible: false, Component: FeeLeadersChart },
  { id: 'an-trend', label: 'Submissions Over Time', description: 'Submission volume trend', defaultSpan: 6, defaultVisible: false, Component: SubmissionTrendChart },
  { id: 'an-outreach', label: 'Outreach Activity', description: 'Recent outreach across the team', defaultSpan: 12, defaultVisible: false, Component: OutreachTable },
];

export const widgetById = (id: string): WidgetDef | undefined =>
  WIDGET_REGISTRY.find((w) => w.id === id);

/** The default layout, used when a user has none saved yet. */
export const defaultLayout = (): DashboardWidget[] =>
  WIDGET_REGISTRY.map((w, i) => ({ id: w.id, visible: w.defaultVisible, span: w.defaultSpan, order: i, height: null }));

/**
 * Merge a saved layout against the registry so newly-added widgets appear
 * (default visible at the end) and removed widgets are dropped.
 *
 * `panelIds` are dynamic, user-created saved-panel ids (prefix `panel_`). They
 * are treated as first-class widgets: included if present, defaulted to visible
 * at the end if newly saved, and dropped if the panel was deleted.
 */
export const reconcileLayout = (
  saved: DashboardWidget[] | null,
  panelIds: string[] = [],
): DashboardWidget[] => {
  const validIds = new Set<string>([...WIDGET_REGISTRY.map((w) => w.id), ...panelIds]);
  if (!saved || !saved.length) {
    // default: static widgets in order, then saved panels (half-width) after.
    const base = defaultLayout();
    panelIds.forEach((id, i) => base.push({ id, visible: false, span: 6, order: base.length + i, height: null }));
    return base;
  }
  const known = new Map(saved.filter((w) => validIds.has(w.id)).map((w) => [w.id, w]));
  const merged: DashboardWidget[] = [];
  let maxOrder = saved.reduce((m, w) => Math.max(m, w.order ?? 0), 0);
  for (const def of WIDGET_REGISTRY) {
    const existing = known.get(def.id);
    merged.push(existing
      ? { id: def.id, visible: existing.visible !== false, span: Math.min(MAX_SPAN, Math.max(MIN_SPAN, existing.span || def.defaultSpan)), order: existing.order ?? maxOrder, height: existing.height ?? null }
      : { id: def.id, visible: def.defaultVisible, span: def.defaultSpan, order: ++maxOrder, height: null });
  }
  for (const id of panelIds) {
    const existing = known.get(id);
    merged.push(existing
      ? { id, visible: existing.visible !== false, span: Math.min(MAX_SPAN, Math.max(MIN_SPAN, existing.span || 6)), order: existing.order ?? maxOrder, height: existing.height ?? null }
      : { id, visible: false, span: 6, order: ++maxOrder, height: null });
  }
  return merged.sort((a, b) => a.order - b.order);
};
