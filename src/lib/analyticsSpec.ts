import type { Submission } from '@/types';

/**
 * Analytics panel query spec. The LLM emits one of these from a natural-language
 * question; our code validates and executes it deterministically against the real
 * submissions. The LLM never does arithmetic — it only chooses the shape of the query.
 */

export type PanelType = 'stat' | 'bar' | 'pie' | 'table';
export type Metric = 'count' | 'sum' | 'avg' | 'min' | 'max';

// Fields the spec may group by or display (categorical / short).
export const GROUPABLE_FIELDS = [
  'stage', 'source', 'owner', 'needs_help', 'low_effort', 'needs_review', 'location',
] as const;
// Numeric fields available for metrics.
export const NUMERIC_FIELDS = ['score', 'vol_24h', 'market_cap', 'fees_24h', 'price_change_24h'] as const;
// Fields usable in filters (categorical + numeric + a few flags).
export const FILTERABLE_FIELDS = [
  ...GROUPABLE_FIELDS, ...NUMERIC_FIELDS, 'token', 'contract_address',
] as const;
// Columns a table panel may show.
export const TABLE_COLUMNS = [
  'project', 'stage', 'owner', 'score', 'vol_24h', 'market_cap', 'token',
  'source', 'needs_help', 'submitted_at', 'one_liner', 'location',
] as const;

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

const getField = (s: Submission, field: string): unknown => (s as any)[field];

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
