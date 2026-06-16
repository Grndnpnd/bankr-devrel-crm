import type { Submission } from '@/types';
import {
  validateSpec, executeSpec,
  GROUPABLE_FIELDS, NUMERIC_FIELDS, FILTERABLE_FIELDS, TABLE_COLUMNS,
  type AnalyticsSpec,
} from '@/lib/analyticsSpec';
import { toChatRows, capRows } from '@/lib/chatData';
import type { ToolDef } from '@/lib/llm';

/**
 * Stage 1 agent tools — all READ-ONLY. The harness is built so write tools
 * (create_outreach, send_canned_response, …) can be added later as new entries
 * with confirmation gates; none exist yet by design.
 *
 * Tools that need pipeline data receive `submissions` from the route (already
 * loaded, never round-tripped to the model). The LLM only sees tool *results*.
 */

export const AGENT_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'query_pipeline',
      description:
        'Compute an exact aggregate or filtered list over the submissions pipeline. Returns deterministic numbers (counts, sums, averages) or rows. Use for precise questions like "how many in Onboarding", "average score by owner", "list high-volume projects".',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['stat', 'bar', 'pie', 'table'], description: 'stat=single number, bar/pie=grouped, table=rows' },
          metric: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'], description: 'default count' },
          metricField: { type: 'string', enum: [...NUMERIC_FIELDS], description: 'required unless metric=count' },
          groupBy: { type: 'string', enum: [...GROUPABLE_FIELDS], description: 'required for bar/pie' },
          columns: { type: 'array', items: { type: 'string', enum: [...TABLE_COLUMNS] }, description: 'for table' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', enum: [...FILTERABLE_FIELDS] },
                op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'has', 'is_empty', 'not_empty'] },
                value: {},
              },
              required: ['field', 'op'],
            },
          },
          sort: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'number' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_summary',
      description:
        'Get a compact, privacy-trimmed snapshot of all pipeline projects (project, stage, owner, score, volume, needs-help tags, last contact date, recent outreach). Use for judgment questions like "who should I reach out to" or "who has been contacted recently" where you need to read across projects. No founder PII, wallets, or contract addresses are included.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_panel',
      description:
        'Create a saved analytics panel (chart/stat/table) the user can pin to their dashboard. Use when the user asks to "make a panel/chart" or "add this to my dashboard". Returns a validated spec the UI offers to save. Same shape as query_pipeline.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['stat', 'bar', 'pie', 'table'] },
          title: { type: 'string', description: 'short human title for the panel' },
          metric: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
          metricField: { type: 'string', enum: [...NUMERIC_FIELDS] },
          groupBy: { type: 'string', enum: [...GROUPABLE_FIELDS] },
          columns: { type: 'array', items: { type: 'string', enum: [...TABLE_COLUMNS] } },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', enum: [...FILTERABLE_FIELDS] },
                op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'has', 'is_empty', 'not_empty'] },
                value: {},
              },
              required: ['field', 'op'],
            },
          },
          sort: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'number' },
        },
        required: ['type', 'title'],
      },
    },
  },
];

export interface ToolExecResult {
  result: string;          // JSON string fed back to the model
  panelSpec?: AnalyticsSpec; // surfaced to the client when build_panel is used
}

/** Execute a tool call by name. Pure over the provided submissions. */
export function runTool(name: string, args: any, submissions: Submission[]): ToolExecResult {
  if (name === 'query_pipeline') {
    const v = validateSpec(args);
    if (!v.ok) return { result: JSON.stringify({ error: 'invalid query', details: v.errors }) };
    const out = executeSpec(v.spec!, submissions);
    return { result: JSON.stringify(out) };
  }

  if (name === 'get_pipeline_summary') {
    const rows = capRows(toChatRows(submissions));
    return { result: JSON.stringify({ today: new Date().toISOString().slice(0, 10), count: rows.length, rows }) };
  }

  if (name === 'build_panel') {
    const v = validateSpec(args);
    if (!v.ok) return { result: JSON.stringify({ error: 'invalid panel', details: v.errors }) };
    // Compute a preview so the model can describe it, and surface the spec to the client.
    const preview = executeSpec(v.spec!, submissions);
    return {
      result: JSON.stringify({ ok: true, title: v.spec!.title, preview }),
      panelSpec: v.spec!,
    };
  }

  return { result: JSON.stringify({ error: `unknown tool: ${name}` }) };
}
