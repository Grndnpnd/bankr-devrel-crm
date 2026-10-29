/**
 * The tables inside an artifact, for panels, dashboards and the agent.
 *
 * Many artifacts carry their own data: JSON or CSV files the page loads by relative
 * path, or documents in their data store (the db capability). This turns each into
 * tables of flat rows with inferred fields, so a spec can chart them like any other
 * source (`source: 'artifact_data', artifact, table`).
 *
 * Table names: a file that is itself a table is its path ("positions.json"); a file
 * holding several is "path#key" for each list in it, plus "path" for its single values
 * (one row); a data-store collection is "db:<collection>". Files are parsed once per
 * content hash and kept in a small cache; data-store rows follow the page's read rules
 * for the viewer, so they're read fresh each time.
 */
import { prisma } from '@/lib/prisma';
import {
  dbQuery, listArtifacts, openArtifact, viewerKey, type DbCtx, type Level, type Viewer,
} from '@/lib/artifacts';
import { SOURCES, type FieldDef, type SourceDef } from '@/lib/analyticsSpec';
import { DataError } from '@/lib/dataSources';

type Row = Record<string, unknown>;
export interface FieldInfo { key: string; kind: FieldDef['kind']; distinct?: number; examples?: unknown[]; min?: unknown; max?: unknown }
export interface ArtifactTable { name: string; origin: 'file' | 'data store'; rows: Row[]; fields: FieldDef[]; info: FieldInfo[] }

const MAX_ROWS = 250_000;
const SAMPLE = 2_000;

// ── Turning parsed data into tables ──────────────────────────

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isColumnar = (v: unknown): v is { cols: unknown[]; rows: unknown[][] } =>
  isPlain(v) && Array.isArray(v.cols) && Array.isArray(v.rows) && v.cols.every((c) => typeof c === 'string');

/** Nested objects become dot keys, one level deep ("rugged.n"); deeper values stay as they are. */
function flatten(o: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(o)) {
    if (isPlain(v)) for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    else out[k] = v;
  }
  return out;
}

function rowsOf(v: unknown): Row[] | null {
  if (isColumnar(v)) {
    const cols = v.cols as string[];
    return v.rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(cols.map((c, i) => [c, Array.isArray(r) ? r[i] ?? null : null])));
  }
  if (Array.isArray(v) && v.length && v.every(isPlain)) return (v as Record<string, unknown>[]).slice(0, MAX_ROWS).map(flatten);
  return null;
}

/** The tables in one parsed JSON file. */
function tablesOfJson(path: string, data: unknown): { name: string; rows: Row[] }[] {
  const whole = rowsOf(data);
  if (whole) return [{ name: path, rows: whole }];
  if (!isPlain(data)) return [];
  const out: { name: string; rows: Row[] }[] = [];
  const singles: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const rows = rowsOf(v);
    if (rows) out.push({ name: `${path}#${k}`, rows });
    else if (!Array.isArray(v)) singles[k] = v;
  }
  if (Object.keys(singles).length) out.unshift({ name: path, rows: [flatten(singles)] });
  return out;
}

/** A small CSV reader: a header row, quoted fields, "" escapes. */
function tablesOfCsv(path: string, text: string): { name: string; rows: Row[] }[] {
  const lines: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) lines.push(row);
      row = [];
      if (lines.length > MAX_ROWS) break;
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); lines.push(row); }
  if (lines.length < 2) return [];
  const [head, ...body] = lines;
  return [{ name: path, rows: body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim() || `col${i + 1}`, r[i] === '' || r[i] === undefined ? null : r[i]]))) }];
}

// ── Field inference ──────────────────────────────────────────

const NUMERIC = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z| ?UTC|[+-]\d{2}:?\d{2})?)?$/;
const TIME_NAME = /(_at|_ts|^ts|time|date|timestamp|opened|closed|created|updated|seen|started|ended|day)$/i;
const isoOf = (s: string) => new Date(s.replace(' UTC', 'Z').replace(' ', 'T')).toISOString();

/** What each field holds, judged from a sample; values are normalized to match (numbers, ISO dates). */
function inferFields(rows: Row[]): { fields: FieldDef[]; info: FieldInfo[] } {
  const keys = Array.from(new Set(rows.slice(0, SAMPLE).flatMap((r) => Object.keys(r))));
  const step = Math.max(1, Math.floor(rows.length / SAMPLE));
  const sample = rows.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const fields: FieldDef[] = [];
  const info: FieldInfo[] = [];
  for (const key of keys) {
    const vals = sample.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== '');
    let kind: FieldDef['kind'] = 'categorical';
    let convert: ((v: unknown) => unknown) | null = null;
    if (!vals.length) kind = 'text';
    else if (vals.every((v) => typeof v === 'boolean')) kind = 'bool';
    else if (vals.every((v) => typeof v === 'number')) {
      const nums = vals as number[];
      const epochS = nums.every((n) => Number.isInteger(n) && n > 1e9 && n < 4.1e9);
      const epochMs = nums.every((n) => Number.isInteger(n) && n > 1e12 && n < 4.1e12);
      if ((epochS || epochMs) && TIME_NAME.test(key)) {
        kind = 'date';
        convert = (v) => (typeof v === 'number' ? new Date(epochS ? v * 1000 : v).toISOString() : v);
      } else kind = 'numeric';
    } else if (vals.every((v) => typeof v === 'string' && NUMERIC.test(v.trim()))) {
      kind = 'numeric';
      convert = (v) => (typeof v === 'string' && NUMERIC.test(v.trim()) ? Number(v) : v);
    } else if (vals.every((v) => typeof v === 'string' && ISO_DAY.test(v.trim()) && !Number.isNaN(Date.parse(isoOf(v.trim()))))) {
      kind = 'date';
      convert = (v) => (typeof v === 'string' && ISO_DAY.test(v.trim()) ? isoOf(v.trim()) : v);
    } else if (vals.every((v) => Array.isArray(v))) kind = 'array';
    else if (vals.some((v) => isPlain(v))) kind = 'text';

    if (convert) for (const r of rows) if (key in r) r[key] = convert(r[key]);
    const distinct = new Set(vals.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v))).size;
    const groupable = kind !== 'numeric' && kind !== 'text' && (kind !== 'categorical' || distinct <= 1000);
    fields.push({ key, label: key, kind, groupable, filterable: true, columnable: true, metric: kind === 'numeric' });
    const fi: FieldInfo = { key, kind };
    if (kind === 'numeric' || kind === 'date') {
      for (const r of rows) {
        const v = r[key] as number | string | null | undefined;
        if (v === null || v === undefined) continue;
        if (fi.min === undefined || v < (fi.min as typeof v)) fi.min = v;
        if (fi.max === undefined || v > (fi.max as typeof v)) fi.max = v;
      }
    } else {
      fi.distinct = distinct;
      fi.examples = Array.from(new Set(vals.map((v) => (typeof v === 'string' ? v.slice(0, 60) : v)))).slice(0, 8);
    }
    info.push(fi);
  }
  return { fields, info };
}

// ── Loading ──────────────────────────────────────────────────

// Parsed files, newest last; bounded by rows held so a few large files can't fill the server's memory.
const fileCache = new Map<string, ArtifactTable[]>();
const CACHE_ROWS = 600_000;
const rowsHeld = () => Array.from(fileCache.values()).reduce((n, ts) => n + ts.reduce((m, t) => m + t.rows.length, 0), 0);
function remember(key: string, tables: ArtifactTable[]) {
  fileCache.set(key, tables);
  while (fileCache.size > 1 && (fileCache.size > 12 || rowsHeld() > CACHE_ROWS)) fileCache.delete(fileCache.keys().next().value!);
}

const DATA_FILE = /\.(json|csv)$/i;

async function fileTables(artifactId: string): Promise<ArtifactTable[]> {
  const files = await prisma.artifactFile.findMany({ where: { artifactId }, select: { id: true, path: true, sha256: true, contentType: true }, orderBy: { path: 'asc' } });
  const out: ArtifactTable[] = [];
  for (const f of files.filter((x) => DATA_FILE.test(x.path) || /json|csv/.test(x.contentType))) {
    const key = `${f.id}:${f.sha256}`;
    let tables = fileCache.get(key);
    if (tables) { fileCache.delete(key); fileCache.set(key, tables); } // most recently used stays longest
    else {
      const row = await prisma.artifactFile.findUnique({ where: { id: f.id }, select: { data: true } });
      const text = Buffer.from(row!.data).toString('utf8');
      let raw: { name: string; rows: Row[] }[] = [];
      try { raw = /\.csv$/i.test(f.path) || /csv/.test(f.contentType) ? tablesOfCsv(f.path, text) : tablesOfJson(f.path, JSON.parse(text)); } catch { raw = []; }
      tables = raw.map((t) => ({ name: t.name, origin: 'file' as const, rows: t.rows, ...inferFields(t.rows) }));
      remember(key, tables);
    }
    out.push(...tables);
  }
  return out;
}

async function storeTables(artifact: { id: string; capabilities: unknown }, viewer: Viewer, level: Level): Promise<ArtifactTable[]> {
  const cols = await prisma.artifactDoc.groupBy({ by: ['collection'], where: { artifactId: artifact.id }, _count: true, orderBy: { collection: 'asc' } });
  const ctx: DbCtx = { artifactId: artifact.id, capabilities: artifact.capabilities, viewer: viewerKey(artifact.id, viewer.id), level };
  const out: ArtifactTable[] = [];
  for (const c of cols.slice(0, 20)) {
    const docs = await dbQuery(ctx, c.collection, { limit: 1000 }).catch(() => []);
    if (!docs.length) continue;
    const rows = docs.map((d) => ({ id: d.id, ...flatten((d.data ?? {}) as Record<string, unknown>) }));
    out.push({ name: `db:${c.collection}`, origin: 'data store', rows, ...inferFields(rows) });
  }
  return out;
}

/** An artifact by id or title, among the ones this person can open. */
export async function resolveArtifact(viewer: Viewer, q: string) {
  const needle = String(q ?? '').trim();
  if (!needle) throw new DataError('invalid', 'Which artifact? Give its title.');
  const direct = await openArtifact(needle, viewer);
  if (direct) return direct;
  const low = needle.toLowerCase();
  const mine = await listArtifacts(viewer, { q: needle, take: 20 });
  const hit = mine.find((a) => a.title.toLowerCase() === low) ?? mine[0];
  if (hit) return (await openArtifact(hit.id, viewer))!;
  const exists = await prisma.artifact.findFirst({ where: { OR: [{ id: needle }, { title: { contains: needle, mode: 'insensitive' } }] }, select: { id: true } });
  if (exists) throw new DataError('no_access', 'That artifact isn’t shared with you. Ask its owner to share it.');
  throw new DataError('not_found', `No artifact matching "${needle}". Use find_artifacts to see what you can open.`);
}

/** Every table in an artifact this person can open. */
export async function artifactTables(viewer: Viewer, q: string) {
  const { artifact, level } = await resolveArtifact(viewer, q);
  const tables = [...(await fileTables(artifact.id)), ...(await storeTables(artifact, viewer, level))];
  return { artifact, tables };
}

/** One table, plus the source definition its fields make (for validateSpec / executeSpec). */
export async function artifactTable(viewer: Viewer, q: string, name: string) {
  const { artifact, tables } = await artifactTables(viewer, q);
  if (!tables.length) throw new DataError('not_found', `"${artifact.title}" has no data files or stored data to chart — its numbers are built into the page.`);
  const want = String(name ?? '').trim().toLowerCase();
  const table = tables.find((t) => t.name.toLowerCase() === want)
    ?? (want ? tables.find((t) => t.name.toLowerCase().includes(want)) : tables.length === 1 ? tables[0] : undefined);
  if (!table) throw new DataError('invalid', `Which table of "${artifact.title}"? It has: ${tables.map((t) => `${t.name} (${t.rows.length} rows)`).join(', ')}.`);
  const source: SourceDef = {
    ...SOURCES.artifact_data,
    label: `${artifact.title} · ${table.name}`,
    fields: table.fields,
    defaultColumns: table.fields.slice(0, 6).map((f) => f.key),
  };
  return { artifact, table, source };
}
