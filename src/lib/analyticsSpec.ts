import type { Submission } from '@/types';

/**
 * Analytics panel query spec. The LLM emits one of these from a natural-language
 * question; our code validates and executes it deterministically against the real
 * submissions. The LLM never does arithmetic — it only chooses the shape of the query.
 */

export type PanelType = 'stat' | 'bar' | 'pie' | 'table';
export type Metric = 'count' | 'sum' | 'avg' | 'min' | 'max';

// Fields the spec may group by or display (categorical / short).
/**
 * CANONICAL FIELD CATALOG — the single source of truth for what can be paneled.
 * Each entry declares a field on the Submission object plus how it can be used. The
 * allowlists below are DERIVED from this, so exposing a new field = one catalog entry
 * (no more patching four separate arrays). `derived` fields are computed in getField.
 *
 * kind: 'categorical' (group/filter as text) | 'numeric' (metrics + compare) |
 *       'date' (filter/column) | 'array' (group/has-filter/column) | 'text' (filter/column) |
 *       'bool' (filter/column)
 */
export interface FieldDef {
  key: string;
  label: string;
  kind: 'categorical' | 'numeric' | 'date' | 'array' | 'text' | 'bool';
  groupable?: boolean;
  filterable?: boolean;
  columnable?: boolean;
  metric?: boolean;       // usable as a numeric metricField
  derived?: boolean;      // computed in getField rather than read directly
}

export const FIELD_CATALOG: FieldDef[] = [
  { key: 'project',            label: 'Project',           kind: 'text',        filterable: true, columnable: true },
  { key: 'stage',              label: 'Stage',             kind: 'categorical', groupable: true, filterable: true, columnable: true },
  { key: 'owner',              label: 'Owner',             kind: 'categorical', groupable: true, filterable: true, columnable: true },
  { key: 'source',             label: 'Source',            kind: 'categorical', groupable: true, filterable: true, columnable: true },
  { key: 'location',           label: 'Location',          kind: 'text',        groupable: true, filterable: true, columnable: true },
  { key: 'needs_help',         label: 'Needs Help',        kind: 'array',       groupable: true, filterable: true, columnable: true },
  { key: 'score',              label: 'Score',             kind: 'numeric',     filterable: true, columnable: true, metric: true },
  { key: 'vol_24h',            label: '24h Volume',        kind: 'numeric',     filterable: true, columnable: true, metric: true },
  { key: 'market_cap',         label: 'Market Cap',        kind: 'numeric',     filterable: true, columnable: true, metric: true },
  { key: 'fees_24h',           label: '24h Fees',          kind: 'numeric',     filterable: true, columnable: true, metric: true },
  { key: 'price_change_24h',   label: '24h Price Change',  kind: 'numeric',     filterable: true, columnable: true, metric: true },
  { key: 'token',              label: 'Token',             kind: 'text',        filterable: true, columnable: true },
  { key: 'contract_address',   label: 'Contract Address',  kind: 'text',        filterable: true },
  { key: 'submitted_at',       label: 'Submitted',         kind: 'date',        filterable: true, columnable: true },
  { key: 'one_liner',          label: 'One-liner',         kind: 'text',        columnable: true },
  { key: 'low_effort',         label: 'Low Effort',        kind: 'bool',        groupable: true, filterable: true, columnable: true },
  { key: 'needs_review',       label: 'Needs Review',      kind: 'bool',        groupable: true, filterable: true, columnable: true },
  // Outreach (some direct on Submission, some derived from the outreach arrays)
  { key: 'outreach_types',     label: 'Outreach Types',    kind: 'array',       groupable: true, filterable: true, columnable: true },
  { key: 'last_outreach_type', label: 'Last Outreach Type',kind: 'categorical', groupable: true, filterable: true, columnable: true },
  { key: 'last_outreach_at',   label: 'Last Outreach Date',kind: 'date',        filterable: true, columnable: true },
  { key: 'last_contact',       label: 'Last Contact',      kind: 'date',        filterable: true, columnable: true, derived: true },
  { key: 'contact_count',      label: 'Contact Count',     kind: 'numeric',     filterable: true, columnable: true, metric: true, derived: true },
  { key: 'has_token',          label: 'Has Token',         kind: 'bool',        groupable: true, filterable: true, columnable: true, derived: true },
];

const byCap = (pred: (f: FieldDef) => boolean | undefined) => FIELD_CATALOG.filter(pred).map((f) => f.key);

export const GROUPABLE_FIELDS = byCap((f) => f.groupable) as readonly string[];
export const NUMERIC_FIELDS = byCap((f) => f.metric) as readonly string[];
export const FILTERABLE_FIELDS = byCap((f) => f.filterable) as readonly string[];
export const TABLE_COLUMNS = byCap((f) => f.columnable) as readonly string[];
/** For surfacing to the agent/UI: every field + its label + kind. */
export const PANEL_FIELDS = FIELD_CATALOG.map((f) => ({ key: f.key, label: f.label, kind: f.kind }));

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'contains_any' | 'has' | 'is_empty' | 'not_empty';

export interface SpecFilter {
  field: string;
  op: FilterOp;
  value?: string | number | boolean;
}

export interface AnalyticsSpec {
  type: PanelType;
  title: string;
  // stat: metric over (optional) metricField. bar/pie: groupBy + metric. table: columns.
  metric?: Metric;
  metricField?: string;     // required for sum/avg/min/max
  groupBy?: string;         // required for bar/pie
  columns?: string[];       // for table
  filters?: SpecFilter[];
  sort?: 'asc' | 'desc';
  limit?: number;
}

export interface SpecValidation {
  ok: boolean;
  errors: string[];
  spec?: AnalyticsSpec;
}

const inSet = (v: unknown, set: readonly string[]) => typeof v === 'string' && set.includes(v);

/** Validate + normalize a spec coming from the LLM. Rejects anything off-vocabulary. */
export function validateSpec(raw: any): SpecValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['spec is not an object'] };

  const type = raw.type;
  if (!['stat', 'bar', 'pie', 'table'].includes(type)) errors.push(`invalid type: ${type}`);

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : 'Untitled panel';
  const metric: Metric = ['count', 'sum', 'avg', 'min', 'max'].includes(raw.metric) ? raw.metric : 'count';

  if ((type === 'bar' || type === 'pie')) {
    if (!inSet(raw.groupBy, GROUPABLE_FIELDS)) errors.push(`bar/pie require a valid groupBy (got: ${raw.groupBy})`);
  }
  if (metric !== 'count') {
    if (!inSet(raw.metricField, NUMERIC_FIELDS)) errors.push(`metric '${metric}' requires a numeric metricField`);
  }
  let columns: string[] | undefined;
  if (type === 'table') {
    columns = Array.isArray(raw.columns) ? raw.columns.filter((c: any) => inSet(c, TABLE_COLUMNS)) : [];
    if (!columns || columns.length === 0) columns = ['project', 'stage', 'score'];
  }
  const filters: SpecFilter[] = Array.isArray(raw.filters)
    ? raw.filters
        .filter((f: any) => f && inSet(f.field, FILTERABLE_FIELDS) &&
          ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'contains_any', 'has', 'is_empty', 'not_empty'].includes(f.op))
        .map((f: any) => ({ field: f.field, op: f.op, value: f.value }))
    : [];

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    spec: {
      type, title, metric,
      metricField: metric !== 'count' ? raw.metricField : undefined,
      groupBy: type === 'bar' || type === 'pie' ? raw.groupBy : undefined,
      columns,
      filters,
      sort: raw.sort === 'asc' ? 'asc' : 'desc',
      limit: Number.isFinite(raw.limit) ? Math.min(50, Math.max(1, Math.floor(raw.limit))) : undefined,
    },
  };
}

// ── Execution ──────────────────────────────────────────────

const getField = (s: Submission, field: string): unknown => {
  // Derived fields computed from the Submission's nested data, so panels resolve the same
  // values whether run against chat rows or live Submission objects.
  switch (field) {
    case 'last_contact': {
      const acts = ((s as any).outreach ?? []).filter((a: any) => a?.type !== 'system');
      const dates = acts.map((a: any) => a.timestamp).filter(Boolean).sort();
      return dates.length ? dates[dates.length - 1] : null;
    }
    case 'contact_count':
      return ((s as any).outreach ?? []).filter((a: any) => a?.type !== 'system').length;
    case 'has_token':
      return !!((s as any).token || (s as any).contract_address);
    default:
      return (s as any)[field];
  }
};

const numVal = (s: Submission, field: string): number => {
  const v = getField(s, field);
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

function applyFilters(subs: Submission[], filters: SpecFilter[]): Submission[] {
  return subs.filter((s) =>
    filters.every((f) => {
      const v = getField(s, f.field);
      switch (f.op) {
        case 'eq': return String(v).toLowerCase() === String(f.value).toLowerCase();
        case 'neq': return String(v).toLowerCase() !== String(f.value).toLowerCase();
        case 'gt': return typeof v === 'number' && v > Number(f.value);
        case 'gte': return typeof v === 'number' && v >= Number(f.value);
        case 'lt': return typeof v === 'number' && v < Number(f.value);
        case 'lte': return typeof v === 'number' && v <= Number(f.value);
        case 'contains': return String(v).toLowerCase().includes(String(f.value).toLowerCase());
        case 'contains_any': {
          // value is a comma-separated list; match if the field contains ANY of them.
          const needles = String(f.value ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
          const hay = String(v).toLowerCase();
          return needles.some((n) => hay.includes(n));
        }
        case 'has': return Array.isArray(v) && v.map(String).map((x) => x.toLowerCase()).includes(String(f.value).toLowerCase());
        case 'is_empty': return v == null || v === '' || (Array.isArray(v) && v.length === 0);
        case 'not_empty': return !(v == null || v === '' || (Array.isArray(v) && v.length === 0));
        default: return true;
      }
    })
  );
}

function aggregate(rows: Submission[], metric: Metric, field?: string): number {
  if (metric === 'count') return rows.length;
  if (!field) return 0;
  const nums = rows.map((r) => numVal(r, field));
  if (nums.length === 0) return 0;
  switch (metric) {
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'avg': return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    default: return 0;
  }
}

export interface PanelResult {
  type: PanelType;
  title: string;
  // stat
  value?: number;
  metricLabel?: string;
  matched?: number; // rows after filters
  // bar/pie
  series?: { label: string; value: number }[];
  // table
  columns?: string[];
  rows?: Record<string, unknown>[];
}

const PALETTE = ['#F5A623', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444', '#F59E0B', '#6B7280', '#64748B'];

/** Execute a validated spec against the submissions, returning render-ready data. */
export function executeSpec(spec: AnalyticsSpec, submissions: Submission[]): PanelResult {
  const rows = applyFilters(submissions, spec.filters ?? []);
  const metricLabel = spec.metric === 'count' ? 'count' : `${spec.metric} of ${spec.metricField}`;

  if (spec.type === 'stat') {
    return { type: 'stat', title: spec.title, value: aggregate(rows, spec.metric ?? 'count', spec.metricField), metricLabel, matched: rows.length };
  }

  if (spec.type === 'table') {
    const cols = spec.columns ?? ['project', 'stage', 'score'];
    const sorted = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const limited = sorted.slice(0, spec.limit ?? 25);
    const tableRows = limited.map((s) => {
      const out: Record<string, unknown> = {};
      for (const c of cols) {
        const v = getField(s, c);
        out[c] = Array.isArray(v) ? v.join(', ') : v;
      }
      return out;
    });
    return { type: 'table', title: spec.title, columns: cols, rows: tableRows, matched: rows.length };
  }

  // bar / pie — group + aggregate
  const groupBy = spec.groupBy!;
  const buckets = new Map<string, Submission[]>();
  for (const s of rows) {
    const raw = getField(s, groupBy);
    const keys = Array.isArray(raw) ? (raw.length ? raw.map(String) : ['(none)']) : [String(raw ?? '(none)')];
    for (const k of keys) {
      const key = k === '' ? '(none)' : k;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(s);
    }
  }
  let series = Array.from(buckets.entries()).map(([label, group]) => ({
    label, value: aggregate(group, spec.metric ?? 'count', spec.metricField),
  }));
  series.sort((a, b) => (spec.sort === 'asc' ? a.value - b.value : b.value - a.value));
  if (spec.limit) series = series.slice(0, spec.limit);
  // attach colors by index for pie rendering
  return { type: spec.type, title: spec.title, series, metricLabel, matched: rows.length };
}

export const colorAt = (i: number): string => PALETTE[i % PALETTE.length];
