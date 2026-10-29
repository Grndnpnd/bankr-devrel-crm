import type { Submission } from '@/types';
import { type Opt, KINDS, SEVERITY, BUG_OPEN, BUG_CLOSED, NOTE_STATUSES, DEVICES, ENVIRONMENTS, STAGES, USAGE, SEND_FUNDS, CHANNELS, OUTREACH_TYPES, OUTREACH_STATUSES, OUTCOMES, PAYOUT_REASONS } from '@/lib/betaModel';

/**
 * Analytics panel query spec. The LLM emits one of these from a natural-language
 * question; our code validates and executes it deterministically against the real
 * rows. The LLM never does arithmetic — it only chooses the shape of the query.
 *
 * A spec reads one data source: the pipeline (submissions, the default), a beta program's
 * reports / testers / messages / payouts, or the artifacts the viewer can open. Pipeline
 * panels run in the browser on the loaded submissions; every other source runs on the server
 * as the person looking at it, so a shared panel never shows a program they can't see.
 */

export type PanelType = 'stat' | 'bar' | 'pie' | 'line' | 'table';
export type Metric = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type Bucket = 'day' | 'week' | 'month';

/**
 * CANONICAL FIELD CATALOG — the single source of truth for what can be paneled.
 * Each entry declares a field on the row plus how it can be used. The allowlists
 * are DERIVED from this, so exposing a new field = one catalog entry.
 * `derived` fields are computed in getField.
 *
 * kind: 'categorical' (group/filter as text) | 'numeric' (metrics + compare) |
 *       'date' (filter/column, group by day/week/month) | 'array' (group/has-filter/column) |
 *       'text' (filter/column) | 'bool' (filter/column)
 * options: the stored value → label pairs; rows hold the label, filters accept either.
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
  options?: readonly Opt[];
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
  { key: 'submitted_at',       label: 'Submitted',         kind: 'date',        groupable: true, filterable: true, columnable: true },
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

// Shorthands for the other sources' catalogs.
const cat = (key: string, label: string, options?: readonly Opt[]): FieldDef => ({ key, label, kind: 'categorical', groupable: true, filterable: true, columnable: true, options });
const txt = (key: string, label: string): FieldDef => ({ key, label, kind: 'text', filterable: true, columnable: true });
const num = (key: string, label: string): FieldDef => ({ key, label, kind: 'numeric', filterable: true, columnable: true, metric: true });
const day = (key: string, label: string): FieldDef => ({ key, label, kind: 'date', groupable: true, filterable: true, columnable: true });
const yes = (key: string, label: string): FieldDef => ({ key, label, kind: 'bool', groupable: true, filterable: true, columnable: true });
const arr = (key: string, label: string, options?: readonly Opt[]): FieldDef => ({ key, label, kind: 'array', groupable: true, filterable: true, columnable: true, options });

const REPORT_STATUSES: Opt[] = [...BUG_OPEN, ...BUG_CLOSED, ...NOTE_STATUSES.filter(([v]) => v !== 'new' && v !== 'duplicate')];

export interface SourceDef {
  key: string;
  label: string;
  /** What one row is, for the agent ("one bug report or piece of feedback"). */
  row: string;
  fields: FieldDef[];
  defaultColumns: string[];
  /** Table order when the spec doesn't pick one. */
  defaultSort: string;
  /** Scoped to beta programs (accepts `program`). */
  beta?: boolean;
}

export const SOURCES: Record<string, SourceDef> = {
  submissions: {
    key: 'submissions', label: 'Pipeline', row: 'one project submission', fields: FIELD_CATALOG,
    defaultColumns: ['project', 'stage', 'score'], defaultSort: 'score',
  },
  beta_reports: {
    key: 'beta_reports', label: 'Beta reports', row: 'one report a tester sent (bug, UX feedback, feature request, question or praise)', beta: true,
    fields: [
      cat('program', 'Program'), txt('title', 'Title'), cat('kind', 'Kind', KINDS), cat('status', 'Status', REPORT_STATUSES),
      yes('open', 'Open'), cat('severity', 'Severity', SEVERITY), cat('claimed_severity', 'Tester’s severity', SEVERITY),
      cat('test_area', 'Test area'), cat('device', 'Device', DEVICES), cat('environment', 'Environment', ENVIRONMENTS),
      cat('tester', 'Tester'), cat('waiting_on', 'Waiting on'), yes('overdue', 'Overdue'), yes('tracked', 'Has issue link'),
      yes('has_fix_pr', 'Has fix PR'), num('replies', 'Replies'), num('age_days', 'Age (days)'),
      day('created_at', 'Reported'), day('updated_at', 'Updated'), day('next_action_due', 'Next action due'),
    ],
    defaultColumns: ['title', 'kind', 'severity', 'status', 'tester', 'created_at'], defaultSort: 'created_at',
  },
  beta_testers: {
    key: 'beta_testers', label: 'Beta testers', row: 'one tester in a beta program', beta: true,
    fields: [
      cat('program', 'Program'), txt('name', 'Name'), cat('stage', 'Stage', STAGES), cat('status', 'Status'),
      cat('usage', 'Usage', USAGE), cat('send_funds', 'Send funds', SEND_FUNDS), cat('channel', 'Channel', CHANNELS),
      arr('types', 'Tester types'), arr('test_areas', 'Test areas'), cat('wave', 'Wave'),
      num('reports', 'Reports'), num('bugs', 'Bugs'), num('open_bugs', 'Open bugs'), num('payouts', 'Payouts'),
      num('days_since_check_in', 'Days since check-in'), yes('has_wallet', 'Has wallet'), yes('email_verified', 'Email verified'),
      day('joined_at', 'Joined'), day('last_check_in', 'Last check-in'), day('last_seen', 'Last seen'),
    ],
    defaultColumns: ['name', 'stage', 'usage', 'reports', 'open_bugs', 'last_check_in'], defaultSort: 'reports',
  },
  beta_outreach: {
    key: 'beta_outreach', label: 'Beta messages', row: 'one message (outreach) to a tester', beta: true,
    fields: [
      cat('program', 'Program'), txt('title', 'What we need'), cat('type', 'Type', OUTREACH_TYPES), cat('status', 'Status', OUTREACH_STATUSES),
      yes('open', 'Open'), cat('outcome', 'Outcome', OUTCOMES), cat('tester', 'Tester'), cat('sent_via', 'Sent via'), cat('waiting_on', 'Waiting on'),
      yes('auto', 'Suggested by the CRM'), yes('overdue', 'Overdue'), num('hours_to_answer', 'Hours to answer'),
      day('created_at', 'Created'), day('sent_at', 'Sent'), day('answered_at', 'Answered'), day('next_action_due', 'Next action due'),
    ],
    defaultColumns: ['title', 'type', 'status', 'tester', 'next_action_due'], defaultSort: 'created_at',
  },
  beta_payouts: {
    key: 'beta_payouts', label: 'Beta payouts', row: 'one payout to a tester', beta: true,
    fields: [
      cat('program', 'Program'), cat('tester', 'Tester'), num('amount', 'Amount'), cat('token', 'Token'),
      cat('reason', 'Reason', PAYOUT_REASONS), yes('has_tx', 'Has tx'), day('sent_at', 'Sent'),
    ],
    defaultColumns: ['tester', 'amount', 'token', 'reason', 'sent_at'], defaultSort: 'sent_at',
  },
  artifacts: {
    key: 'artifacts', label: 'Artifacts', row: 'one artifact (page, dashboard, doc) the viewer can open',
    fields: [
      txt('title', 'Title'), cat('kind', 'Kind'), cat('owner', 'Owner'), cat('relation', 'Relation'), yes('team_visible', 'Shared with team'),
      arr('tags', 'Tags'), num('version', 'Version'), day('created_at', 'Created'), day('updated_at', 'Updated'),
    ],
    defaultColumns: ['title', 'kind', 'owner', 'updated_at'], defaultSort: 'updated_at',
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES);
export const sourceOf = (spec: { source?: string }) => SOURCES[spec.source ?? 'submissions'] ?? SOURCES.submissions;
/** Sources that run on the server (everything but the pipeline). */
export const isServerSource = (spec: { source?: string }) => !!spec.source && spec.source !== 'submissions';

const byCap = (pred: (f: FieldDef) => boolean | undefined) => FIELD_CATALOG.filter(pred).map((f) => f.key);

export const GROUPABLE_FIELDS = byCap((f) => f.groupable) as readonly string[];
export const NUMERIC_FIELDS = byCap((f) => f.metric) as readonly string[];
export const FILTERABLE_FIELDS = byCap((f) => f.filterable) as readonly string[];
export const TABLE_COLUMNS = byCap((f) => f.columnable) as readonly string[];
/** For surfacing to the agent/UI: every field + its label + kind. */
export const PANEL_FIELDS = FIELD_CATALOG.map((f) => ({ key: f.key, label: f.label, kind: f.kind }));

/** A compact field guide per source, for the agent's tool descriptions and the crm capability. */
export function describeSources(keys: string[] = SOURCE_KEYS) {
  return keys.map((k) => {
    const s = SOURCES[k];
    return {
      source: s.key, label: s.label, row: s.row, program_scoped: !!s.beta,
      fields: s.fields.map((f) => ({
        key: f.key, kind: f.kind,
        ...(f.groupable ? { group: true } : {}), ...(f.metric ? { metric: true } : {}),
        ...(f.options ? { values: f.options.map(([, l]) => l) } : {}),
      })),
    };
  });
}

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'contains_any' | 'has' | 'is_empty' | 'not_empty';
const OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'contains_any', 'has', 'is_empty', 'not_empty'];

export interface SpecFilter {
  field: string;
  op: FilterOp;
  value?: string | number | boolean;
}

export interface AnalyticsSpec {
  type: PanelType;
  title: string;
  /** Data source (default: submissions). */
  source?: string;
  /** Beta sources: the program's id (resolved from a name when the panel is built). Unset = every program the viewer can see. */
  program?: string;
  // stat: metric over (optional) metricField. bar/pie/line: groupBy + metric. table: columns.
  metric?: Metric;
  metricField?: string;     // required for sum/avg/min/max
  groupBy?: string;         // required for bar/pie/line
  bucket?: Bucket;          // when groupBy is a date
  columns?: string[];       // for table
  filters?: SpecFilter[];
  sortBy?: string;          // table order (default: the source's)
  sort?: 'asc' | 'desc';
  limit?: number;
}

export interface SpecValidation {
  ok: boolean;
  errors: string[];
  spec?: AnalyticsSpec;
}

const keysOf = (src: SourceDef, pred: (f: FieldDef) => boolean | undefined) => src.fields.filter(pred).map((f) => f.key);

/** A filter value given as a stored option value ("feedback") becomes the label rows hold ("UX Feedback"). */
function optionLabel(f: FieldDef | undefined, v: unknown) {
  if (!f?.options || typeof v !== 'string') return v;
  return v.split(',').map((part) => {
    const t = part.trim();
    const hit = f.options!.find(([val, lab]) => val.toLowerCase() === t.toLowerCase() || lab.toLowerCase() === t.toLowerCase());
    return hit ? hit[1] : t;
  }).join(',');
}

/** Validate + normalize a spec coming from the LLM. Rejects anything off-vocabulary. */
export function validateSpec(raw: any): SpecValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['spec is not an object'] };

  if (raw.source !== undefined && raw.source !== null && !SOURCES[raw.source]) errors.push(`invalid source: ${raw.source} (use one of ${SOURCE_KEYS.join(', ')})`);
  const src = SOURCES[raw.source] ?? SOURCES.submissions;
  const field = (k: unknown) => src.fields.find((f) => f.key === k);
  const groupable = keysOf(src, (f) => f.groupable);
  const numeric = keysOf(src, (f) => f.metric);
  const filterable = keysOf(src, (f) => f.filterable);
  const columnable = keysOf(src, (f) => f.columnable);

  const type = raw.type;
  if (!['stat', 'bar', 'pie', 'line', 'table'].includes(type)) errors.push(`invalid type: ${type}`);

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : 'Untitled panel';
  const metric: Metric = ['count', 'sum', 'avg', 'min', 'max'].includes(raw.metric) ? raw.metric : 'count';

  const grouped = type === 'bar' || type === 'pie' || type === 'line';
  if (grouped && !groupable.includes(raw.groupBy)) errors.push(`${type} needs a groupBy from: ${groupable.join(', ')} (got: ${raw.groupBy})`);
  if (metric !== 'count' && !numeric.includes(raw.metricField)) errors.push(`metric '${metric}' needs a numeric metricField from: ${numeric.join(', ') || '(none in this source)'}`);
  let columns: string[] | undefined;
  if (type === 'table') {
    columns = Array.isArray(raw.columns) ? raw.columns.filter((c: any) => columnable.includes(c)) : [];
    if (!columns || columns.length === 0) columns = src.defaultColumns;
  }
  const badFilters: string[] = [];
  const filters: SpecFilter[] = Array.isArray(raw.filters)
    ? raw.filters
        .filter((f: any) => {
          const okay = f && filterable.includes(f.field) && OPS.includes(f.op);
          if (!okay && f) badFilters.push(`${f.field} ${f.op}`);
          return okay;
        })
        .map((f: any) => ({ field: f.field, op: f.op, value: optionLabel(field(f.field), f.value) }))
    : [];
  if (badFilters.length) errors.push(`unknown filter(s): ${badFilters.join('; ')} — filterable fields here: ${filterable.join(', ')}`);
  const groupDef = grouped ? field(raw.groupBy) : undefined;
  const sortBy = typeof raw.sortBy === 'string' && (columnable.includes(raw.sortBy) || numeric.includes(raw.sortBy)) ? raw.sortBy : undefined;

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    spec: {
      type, title, metric,
      ...(raw.source && raw.source !== 'submissions' ? { source: raw.source } : {}),
      ...(src.beta && typeof raw.program === 'string' && raw.program.trim() ? { program: raw.program.trim() } : {}),
      metricField: metric !== 'count' ? raw.metricField : undefined,
      groupBy: grouped ? raw.groupBy : undefined,
      ...(groupDef?.kind === 'date' ? { bucket: (['day', 'week', 'month'].includes(raw.bucket) ? raw.bucket : 'week') as Bucket } : {}),
      columns,
      filters,
      ...(type === 'table' && sortBy ? { sortBy } : {}),
      sort: raw.sort === 'asc' ? 'asc' : 'desc',
      limit: Number.isFinite(raw.limit) ? Math.min(type === 'line' ? 120 : 50, Math.max(1, Math.floor(raw.limit))) : undefined,
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

const DAY_MS = 86_400_000;
/** A date filter value: an ISO date, or "7d" / "-7d" for that many days ago. */
function dateValue(v: unknown): number | null {
  const m = String(v ?? '').trim().match(/^-?(\d+)\s*d$/i);
  if (m) return Date.now() - Number(m[1]) * DAY_MS;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}
const timeOf = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};
const boolOf = (v: unknown) => (typeof v === 'boolean' ? v : ['true', 'yes', '1'].includes(String(v).toLowerCase()));

function applyFilters(subs: Submission[], filters: SpecFilter[], src: SourceDef = SOURCES.submissions): Submission[] {
  return subs.filter((s) =>
    filters.every((f) => {
      const v = getField(s, f.field);
      const kind = src.fields.find((d) => d.key === f.field)?.kind;
      if (kind === 'date' && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(f.op)) {
        const t = timeOf(v), want = dateValue(f.value);
        if (want === null) return true;
        if (t === null) return f.op === 'neq';
        const sameDay = new Date(t).toISOString().slice(0, 10) === new Date(want).toISOString().slice(0, 10);
        switch (f.op) {
          case 'eq': return sameDay;
          case 'neq': return !sameDay;
          case 'gt': return t > want;
          case 'gte': return t >= want;
          case 'lt': return t < want;
          case 'lte': return t <= want;
        }
      }
      if (kind === 'bool' && (f.op === 'eq' || f.op === 'neq')) return (!!v === boolOf(f.value)) === (f.op === 'eq');
      switch (f.op) {
        case 'eq': return String(v).toLowerCase() === String(f.value).toLowerCase();
        case 'neq': return String(v).toLowerCase() !== String(f.value).toLowerCase();
        case 'gt': return typeof v === 'number' && v > Number(f.value);
        case 'gte': return typeof v === 'number' && v >= Number(f.value);
        case 'lt': return typeof v === 'number' && v < Number(f.value);
        case 'lte': return typeof v === 'number' && v <= Number(f.value);
        case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value).toLowerCase());
        case 'contains_any': {
          // value is a comma-separated list; match if the field contains ANY of them.
          const needles = String(f.value ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
          const hay = (Array.isArray(v) ? v.join(' ') : String(v ?? '')).toLowerCase();
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
    case 'sum': return Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
    case 'avg': return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
    case 'min': return Math.min(...nums);
    case 'max': return Math.max(...nums);
    default: return 0;
  }
}

/** The bucket a date falls in: its day, the Monday of its week, or its month (UTC). */
function bucketOf(t: number, bucket: Bucket): string {
  const d = new Date(t);
  if (bucket === 'month') return d.toISOString().slice(0, 7);
  if (bucket === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
/** Every bucket between two (so a quiet week shows as 0, not a gap). */
function bucketRange(first: string, last: string, bucket: Bucket): string[] {
  const out: string[] = [];
  const d = new Date(bucket === 'month' ? `${first}-01T00:00:00Z` : `${first}T00:00:00Z`);
  for (let i = 0; i < 400; i++) {
    const k = bucketOf(d.getTime(), bucket);
    out.push(k);
    if (k >= last) break;
    if (bucket === 'month') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCDate(d.getUTCDate() + (bucket === 'week' ? 7 : 1));
  }
  return out;
}

export interface PanelResult {
  type: PanelType;
  title: string;
  // stat
  value?: number;
  metricLabel?: string;
  matched?: number; // rows after filters
  // bar/pie/line
  series?: { label: string; value: number }[];
  // table
  columns?: string[];
  rows?: Record<string, unknown>[];
}

const PALETTE = ['#F5A623', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444', '#F59E0B', '#6B7280', '#64748B'];

/** Execute a validated spec against the rows of its source, returning render-ready data. */
export function executeSpec(spec: AnalyticsSpec, submissions: Submission[]): PanelResult {
  const src = sourceOf(spec);
  const rows = applyFilters(submissions, spec.filters ?? [], src);
  const metricLabel = spec.metric === 'count' || !spec.metric ? 'count' : `${spec.metric} of ${spec.metricField}`;

  if (spec.type === 'stat') {
    return { type: 'stat', title: spec.title, value: aggregate(rows, spec.metric ?? 'count', spec.metricField), metricLabel, matched: rows.length };
  }

  if (spec.type === 'table') {
    const cols = spec.columns ?? src.defaultColumns;
    const by = spec.sortBy ?? src.defaultSort;
    const kind = src.fields.find((f) => f.key === by)?.kind;
    const dir = spec.sortBy && spec.sort === 'asc' ? 1 : -1;
    const key = (s: Submission) => {
      const v = getField(s, by);
      return kind === 'date' ? timeOf(v) ?? -Infinity : typeof v === 'number' ? v : kind === 'numeric' ? -Infinity : String(v ?? '').toLowerCase();
    };
    const sorted = [...rows].sort((a, b) => {
      const x = key(a), y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
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

  // bar / pie / line — group + aggregate
  const groupBy = spec.groupBy!;
  const isDate = src.fields.find((f) => f.key === groupBy)?.kind === 'date';
  const bucket: Bucket = spec.bucket ?? 'week';
  const buckets = new Map<string, Submission[]>();
  for (const s of rows) {
    const raw = getField(s, groupBy);
    let keys: string[];
    if (isDate) {
      const t = timeOf(raw);
      if (t === null) continue;
      keys = [bucketOf(t, bucket)];
    } else {
      keys = Array.isArray(raw) ? (raw.length ? raw.map(String) : ['(none)']) : [String(raw ?? '(none)')];
    }
    for (const k of keys) {
      const key = k === '' ? '(none)' : k;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(s);
    }
  }
  if (isDate) {
    // Time series: in date order, quiet buckets as 0, the latest `limit` buckets.
    const known = Array.from(buckets.keys()).sort();
    const labels = known.length ? bucketRange(known[0], known[known.length - 1], bucket) : [];
    let series = labels.map((label) => ({ label, value: aggregate(buckets.get(label) ?? [], spec.metric ?? 'count', spec.metricField) }));
    if (spec.limit) series = series.slice(-spec.limit);
    return { type: spec.type, title: spec.title, series, metricLabel, matched: rows.length };
  }
  let series = Array.from(buckets.entries()).map(([label, group]) => ({
    label, value: aggregate(group, spec.metric ?? 'count', spec.metricField),
  }));
  series.sort((a, b) => (spec.sort === 'asc' ? a.value - b.value : b.value - a.value));
  if (spec.limit) series = series.slice(0, spec.limit);
  return { type: spec.type, title: spec.title, series, metricLabel, matched: rows.length };
}

export const colorAt = (i: number): string => PALETTE[i % PALETTE.length];

