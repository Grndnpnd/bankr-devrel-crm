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
import {
  SupportKPIWidget, SupportVolumeWidget, SupportBacklogWidget,
  SupportChannelWidget, SupportLabelsWidget, SupportAssigneeWidget,
} from '@/components/dashboard/widgets/SupportWidgets';
import type { Capability } from '@/lib/access';

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
  cap?: Capability;        // capability required to see this widget (undefined = everyone)
  pillar?: 'devrel' | 'support';  // which pillar's default layout it belongs to
}

/**
 * The catalog of available dashboard widgets.
 * Order here = the factory default top-to-bottom order. `defaultVisible` controls
 * what's on the dashboard out of the box; everything else lives in the picker.
 */
export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── DevRel factory default dashboard (top to bottom) ──
  { id: 'kpi-strip', label: 'Key Metrics', description: 'Top-line counts: submissions, live, score, new this week', defaultSpan: 12, defaultVisible: true, Component: KPIStrip, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'score-distribution', label: 'Score Distribution', description: 'How submissions spread across score ranges', defaultSpan: 7, defaultVisible: true, Component: ScoreDistributionChart, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'pipeline', label: 'Pipeline', description: 'Submissions by stage', defaultSpan: 5, defaultVisible: true, Component: PipelineFunnel, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'top-targets', label: 'Top Targets', description: 'Highest-scoring projects to act on', defaultSpan: 12, defaultVisible: true, Component: TopTargetsTable, cap: 'devrel.view', pillar: 'devrel' },
  // ── DevRel — available in the picker, hidden by default ──
  { id: 'quick-actions', label: 'Quick Actions', description: 'Import, add a submission, and shortcuts', defaultSpan: 12, defaultVisible: false, Component: QuickActions, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'an-needs-help', label: 'Needs-Help Distribution', description: 'Breakdown of what projects need help with', defaultSpan: 6, defaultVisible: false, Component: DonutChart, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'an-top-volume', label: 'Top Projects by 24h Volume', description: 'Highest onchain volume right now', defaultSpan: 6, defaultVisible: false, Component: FeeLeadersChart, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'an-trend', label: 'Submissions Over Time', description: 'Submission volume trend', defaultSpan: 6, defaultVisible: false, Component: SubmissionTrendChart, cap: 'devrel.view', pillar: 'devrel' },
  { id: 'an-outreach', label: 'Outreach Activity', description: 'Recent outreach across the team', defaultSpan: 12, defaultVisible: false, Component: OutreachTable, cap: 'devrel.view', pillar: 'devrel' },
  // ── Support factory default dashboard (visible by default for support-pillar users) ──
  { id: 'sup-kpi', label: 'Support · Key Metrics', description: 'Created, open, resolved, median response & resolution', defaultSpan: 12, defaultVisible: true, Component: SupportKPIWidget, cap: 'support.view', pillar: 'support' },
  { id: 'sup-volume', label: 'Support · Volume', description: 'Support threads created over time', defaultSpan: 12, defaultVisible: true, Component: SupportVolumeWidget, cap: 'support.view', pillar: 'support' },
  { id: 'sup-backlog', label: 'Support · Backlog', description: 'Current TODO / Snoozed / Done counts', defaultSpan: 6, defaultVisible: true, Component: SupportBacklogWidget, cap: 'support.view', pillar: 'support' },
  { id: 'sup-channel', label: 'Support · By Channel', description: 'Volume split across email / chat / slack', defaultSpan: 6, defaultVisible: true, Component: SupportChannelWidget, cap: 'support.view', pillar: 'support' },
  { id: 'sup-labels', label: 'Support · Topics', description: 'Thread volume by label', defaultSpan: 12, defaultVisible: true, Component: SupportLabelsWidget, cap: 'support.view', pillar: 'support' },
  { id: 'sup-assignee', label: 'Support · Assignee Workload', description: 'Open + total threads per agent (incl. AI)', defaultSpan: 12, defaultVisible: true, Component: SupportAssigneeWidget, cap: 'support.view', pillar: 'support' },
];

export const widgetById = (id: string): WidgetDef | undefined =>
  WIDGET_REGISTRY.find((w) => w.id === id);

/** The default layout, used when a user has none saved yet. */
/** Widgets a user can see, given their effective capabilities. */
export const widgetsForCaps = (caps: Set<string>): WidgetDef[] =>
  WIDGET_REGISTRY.filter((w) => !w.cap || caps.has(w.cap));

/**
 * The default layout for a user, given their capabilities. A widget is visible by default
 * only if (a) it's marked defaultVisible AND (b) the user has its capability. So a
 * support-only user gets support widgets visible and devrel ones hidden; a both-pillars
 * user gets both pillars' defaults; a devrel-only user gets the original devrel default.
 * Widgets the user can't see at all are omitted entirely.
 */
export const defaultLayout = (caps?: Set<string>): DashboardWidget[] => {
  const list = caps ? widgetsForCaps(caps) : WIDGET_REGISTRY;
  return list.map((w, i) => ({ id: w.id, visible: w.defaultVisible, span: w.defaultSpan, order: i, height: null }));
};

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
  caps?: Set<string>,
): DashboardWidget[] => {
  const visibleDefs = caps ? widgetsForCaps(caps) : WIDGET_REGISTRY;
  const validIds = new Set<string>([...visibleDefs.map((w) => w.id), ...panelIds]);
  if (!saved || !saved.length) {
    // default: capability-appropriate widgets in order, then saved panels after.
    const base = defaultLayout(caps);
    panelIds.forEach((id, i) => base.push({ id, visible: false, span: 6, order: base.length + i, height: null }));
    return base;
  }
  const known = new Map(saved.filter((w) => validIds.has(w.id)).map((w) => [w.id, w]));
  const merged: DashboardWidget[] = [];
  let maxOrder = saved.reduce((m, w) => Math.max(m, w.order ?? 0), 0);
  for (const def of visibleDefs) {
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
