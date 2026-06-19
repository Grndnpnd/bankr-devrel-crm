import { Prisma } from '@prisma/client';
import type { Submission } from '@/types';
import {
  validateSpec, executeSpec,
  GROUPABLE_FIELDS, NUMERIC_FIELDS, FILTERABLE_FIELDS, TABLE_COLUMNS,
  type AnalyticsSpec,
} from '@/lib/analyticsSpec';
import { toChatRows, capRows } from '@/lib/chatData';
import type { ToolDef } from '@/lib/llm';
import { fetchTokenData, isContractAddress } from '@/lib/discover';
import { enrichSubmission } from '@/lib/enrich';
import { prisma } from '@/lib/prisma';
import { EDITABLE_FIELDS, NEEDS_HELP_TAGS, isEditableField, allTrivial, snapshotCurrent, applyChangesToSubmission, resolveProposal, type Change } from '@/lib/proposedEdits';
import { createSubmissionFromFields, findProjectMatch, type NewSubmissionFields, ingestText } from '@/lib/ingest';
import { can } from '@/lib/access';
import { REPORT_SECTION_KINDS, REPORT_COLUMNS, SORT_FIELDS, validateReportSpec } from '@/lib/reports';
import { resolveUserWebhook } from '@/lib/slack';
import { getWeights } from '@/lib/scoreConfig';
import { validateSchedule, nextRunFrom, JOB_HANDLERS, SCHEDULE_PRESETS, CORE_TYPES } from '@/lib/scheduler';

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
      name: 'get_submission_detail',
      description:
        'Get the FULL record for one project by name — including the narrative fields (problem, solution, traction, plan, why Bankr, accomplishments, one-liner, website, links). Use when the user asks about a specific project in depth ("tell me about X", "what is X building", "summarize X\'s pitch").',
      parameters: {
        type: 'object',
        properties: { project: { type: 'string', description: 'project name (exact or close match)' } },
        required: ['project'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_submissions',
      description:
        'Free-text search across project name, one-liner, and narrative fields (problem/solution/plan/etc.). Use for thematic questions the structured filters can\'t answer ("find projects working on RWAs", "who mentioned a points program", "anything about prediction markets").',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'words/phrase to search for' },
          limit: { type: 'number', description: 'max results (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_team_workload',
      description:
        'Get how submissions are distributed across owners — total per owner and a stage breakdown each. Use for team-management questions ("who has the most on their plate", "how is work split", "what is <owner> working on").',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_data',
      description:
        'Fetch LIVE onchain data for a project\'s token from the Bankr discover API (current 24h volume, market cap, price change). Provide either a project name (we look up its stored contract address) or a contract address directly. Use for "what is X\'s volume right now" — this is real-time, not the cached snapshot.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'project name (we resolve its contract address)' },
          contractAddress: { type: 'string', description: '0x… address, if known directly' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ingest_project',
      description:
        'Take a chunk of UNSTRUCTURED text about a project (a pasted blurb, a forwarded message, raw notes) and turn it into CRM data automatically — it extracts the fields, then creates a new card OR updates a matching existing one. Use this when the user dumps freeform info ("here\'s a project: ...", "add this: ...", "log this from our convo: ..."), as opposed to a precise single-field edit (use propose_edit) or an explicit create with known fields (create_submission). If the text is too vague, it returns what to clarify — ASK the user, don\'t guess. Never sets score.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'the raw unstructured text to ingest' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_submission',
      description:
        'Create a NEW project card from (possibly partial) info — use when the user wants to ADD a project that does not exist yet ("create a project called X", "add a new submission for Y"). Only the project name is required; fill any other fields you can extract and leave the rest blank (the user can fill them later, or a later enrich pass will). If a project with that name already EXISTS, this returns a duplicate notice — in that case do NOT create; use propose_edit to update the existing one instead. Founders, one-liner, etc. are all optional.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'project name (required)' },
          oneLiner: { type: 'string' },
          problem: { type: 'string' }, solution: { type: 'string' },
          traction: { type: 'string' }, funding: { type: 'string' },
          plan: { type: 'string', description: 'plan / goals' },
          whyBankr: { type: 'string' }, accomplishments: { type: 'string' },
          links: { type: 'string' }, notesField: { type: 'string', description: 'freeform notes' },
          projectX: { type: 'string', description: 'X/Twitter handle' },
          website: { type: 'string' }, location: { type: 'string' },
          needsHelp: { type: 'array', items: { type: 'string' }, description: 'needs-help flags; must be from the allowed set: ' + NEEDS_HELP_TAGS.join(', ') },
          founderName: { type: 'string' }, founderEmail: { type: 'string' }, founderX: { type: 'string' },
        },
        required: ['project'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_proposals',
      description:
        'List edits currently queued for review (pending approval). Optionally filter by project name. Use this to see what needs approval, or to find the proposal a user wants to approve/reject in conversation ("approve that change", "what\'s pending for Acme").',
      parameters: {
        type: 'object',
        properties: { project: { type: 'string', description: 'optional project name filter' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_proposal',
      description:
        'Approve or reject a pending queued edit. Use when the user says to approve/reject a change (e.g. replies "approve" after you showed a queued diff). Identify the proposal by its id (from list_pending_proposals) or by project name if there is exactly one pending edit for that project. Approving applies the change immediately and clears it from the review queue (web + Slack share the same queue).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['approve', 'reject'] },
          proposalId: { type: 'string', description: 'the proposal id (preferred)' },
          project: { type: 'string', description: 'project name — used only if proposalId is not given and there is exactly one pending edit for it' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_note',
      description:
        'Add an outreach note / contact-log entry to an existing project (e.g. "add a note to Solvr: just got off a call, need to follow up Thursday about GTM"). This logs a communication or reminder on the project timeline and is attributed to you. Use this for notes/reminders/call logs — NOT for editing the project\'s data fields (use propose_edit for field changes).',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'the project name' },
          note: { type: 'string', description: 'the note text to log' },
        },
        required: ['project', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_contract_address',
      description:
        'Set (or refresh) the onchain token contract address for an existing project, then pull its live token data from Bankr (volume, market cap, price). Use when the user gives a specific 0x… address (e.g. "set Acme\'s contract to 0x123…"). This attaches real onchain data and re-scores the project, so report back the matched token (symbol + volume + market cap) so the user can confirm it\'s the right token.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'the project name' },
          contractAddress: { type: 'string', description: 'the 0x… token contract address to set' },
        },
        required: ['project', 'contractAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_edit',
      description:
        'Propose changes to a project card from a natural-language instruction (e.g. "update Solvr goals: add looking for partnerships; add flags Partnerships and GTM"). You resolve the project, the target field(s), and the operation. Trivial additive edits (append text / add flags) APPLY IMMEDIATELY; destructive (replace/remove) or multi-field or ambiguous edits are filed for human review. Always confirm your interpretation to the user in your reply. Editable fields: ' + Object.keys(EDITABLE_FIELDS).join(', ') + '. Needs-help flags must be one of: ' + NEEDS_HELP_TAGS.join(', ') + '.',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'project name to edit (exact or close match)' },
          changes: {
            type: 'array',
            description: 'one or more field changes',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', enum: Object.keys(EDITABLE_FIELDS), description: 'canonical field key' },
                op: { type: 'string', enum: ['replace', 'append', 'add', 'remove'], description: 'append/add are additive (auto-apply); replace/remove are destructive (queued)' },
                value: { description: 'text for replace/append; a flag or array of flags for add/remove on needsHelp' },
              },
              required: ['field', 'op'],
            },
          },
          rationale: { type: 'string', description: 'brief why — how you interpreted the instruction' },
        },
        required: ['project', 'changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_slack_report',
      description:
        'Schedule a recurring report delivered to the user\'s Slack channel. You translate the request into a structured spec, then it runs deterministically on schedule (no AI at run time) and delivers via the user\'s Slack webhook (must be set in Settings → Slack). ' +
        'The flexible workhorse section is "query_table" — use it for any ranked list like "top 10 by 24h volume with ticker and market cap". For query_table set: sortBy (one of ' + SORT_FIELDS.join('/') + '), direction (desc/asc), limit, and columns (any of ' + REPORT_COLUMNS.join('/') + '), plus optional stageFilter and onlyWithToken. ' +
        'Named shortcut sections also exist: top_candidates, team_workload, pipeline_summary, new_this_week. ' +
        'IMPORTANT: build the report the user actually asked for — if they ask for "top 10 by volume with ticker and market cap", produce a query_table with sortBy=vol24h, limit=10, columns=[project,ticker,vol24h,marketCap]. Give it an accurate title. Schedule is a preset (15m/30m/hourly/6h/12h/daily) or a cron expression (e.g. "*/10 * * * *" for every 10 min).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'a short name for the scheduled report' },
          title: { type: 'string', description: 'the report title shown in Slack' },
          sections: {
            type: 'array',
            description: 'ordered report sections — usually one query_table built to match the request',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: [...REPORT_SECTION_KINDS] },
                title: { type: 'string', description: 'section heading (query_table)' },
                sortBy: { type: 'string', enum: [...SORT_FIELDS], description: 'query_table sort field' },
                direction: { type: 'string', enum: ['desc', 'asc'] },
                limit: { type: 'number', description: 'how many rows (default 10; top_candidates default 5)' },
                columns: { type: 'array', items: { type: 'string', enum: [...REPORT_COLUMNS] }, description: 'query_table columns to show' },
                stageFilter: { type: 'array', items: { type: 'string' }, description: 'optional: restrict to these pipeline stages' },
                onlyWithToken: { type: 'boolean', description: 'optional: only projects that have a token' },
              },
              required: ['kind'],
            },
          },
          schedule: { type: 'string', description: 'preset token or cron expression' },
        },
        required: ['name', 'title', 'sections', 'schedule'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_scheduled_job',
      description:
        'Create a scheduled (cron) job that runs automatically on a recurring schedule. Use when the user asks to "schedule", "automate", or "run X every …". Available job types come from get_scheduled_jobs/the system. Confirm the details with the user before creating if there is any ambiguity. Schedule can be a preset (15m, 30m, hourly, 6h, 12h, daily) or a standard cron expression.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'human name for the job' },
          type: { type: 'string', description: 'job type key, e.g. refresh_onchain' },
          schedule: { type: 'string', description: 'preset token (15m/30m/hourly/6h/12h/daily) or a cron expression' },
        },
        required: ['name', 'type', 'schedule'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_scheduled_jobs',
      description: 'List existing scheduled jobs and the available job types, so you know what can be scheduled and what already is.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_saved_panels',
      description:
        'List the analytics panels that already exist (the current user\'s own panels plus team-shared ones), with their titles and what they show. Use BEFORE building a new panel to avoid duplicating one that exists, or when the user asks what panels they have.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_score_config',
      description:
        'Get the current scoring weights (how each component contributes to a project\'s 0-100 score: onchain volume, token launched, traction, founder, completeness). Use to explain why a project scored what it did or how scoring works.',
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

const findProject = (submissions: Submission[], q: string): Submission | undefined => {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return undefined;
  return submissions.find((s) => s.project?.toLowerCase() === needle)
    || submissions.find((s) => s.project?.toLowerCase().includes(needle));
};

/** Execute a tool call by name. Async because some tools hit external APIs. */
export interface ToolContext { userId: string; userEmail?: string; role?: string }

export async function runTool(name: string, args: any, submissions: Submission[], ctx: ToolContext): Promise<ToolExecResult> {
  // Capability gate for write tools (the route only checks analytics.use).
  const WRITE_TOOLS: Record<string, Parameters<typeof can>[1]> = {
    ingest_project: 'submissions.edit',
    create_submission: 'submissions.edit',
    propose_edit: 'submissions.edit',
    resolve_proposal: 'submissions.edit',
    add_note: 'submissions.edit',
    set_contract_address: 'submissions.enrich',
    create_scheduled_job: 'cron.manage',
    create_slack_report: 'cron.manage',
  };
  if (WRITE_TOOLS[name] && !can(ctx.role, WRITE_TOOLS[name])) {
    return { result: JSON.stringify({ error: `You don't have permission to ${name.replace('_', ' ')}.` }) };
  }
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

  if (name === 'get_submission_detail') {
    const s = findProject(submissions, args?.project);
    if (!s) return { result: JSON.stringify({ error: `no project matching "${args?.project}"` }) };
    // Full detail incl. narrative fields (per scope). Founder PII still omitted.
    const { founders, ...rest } = s as any;
    return { result: JSON.stringify({ project: rest }) };
  }

  if (name === 'search_submissions') {
    const q = String(args?.query || '').toLowerCase().trim();
    if (!q) return { result: JSON.stringify({ error: 'empty query' }) };
    const limit = Math.min(25, Math.max(1, Number(args?.limit) || 10));
    const fields = ['project', 'one_liner', 'problem', 'solution', 'plan', 'traction', 'why_bankr', 'accomplishments'];
    const hits = submissions
      .map((s) => {
        const hay = fields.map((f) => String((s as any)[f] ?? '')).join(' ').toLowerCase();
        return { s, match: hay.includes(q) };
      })
      .filter((x) => x.match)
      .slice(0, limit)
      .map(({ s }) => ({ project: s.project, stage: s.stage, owner: s.owner || '(unassigned)', score: s.score, one_liner: s.one_liner }));
    return { result: JSON.stringify({ query: args.query, count: hits.length, results: hits }) };
  }

  if (name === 'get_team_workload') {
    const byOwner = new Map<string, { total: number; stages: Record<string, number> }>();
    for (const s of submissions) {
      const owner = s.owner || '(unassigned)';
      if (!byOwner.has(owner)) byOwner.set(owner, { total: 0, stages: {} });
      const rec = byOwner.get(owner)!;
      rec.total += 1;
      rec.stages[s.stage] = (rec.stages[s.stage] || 0) + 1;
    }
    const workload = Array.from(byOwner.entries())
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => b.total - a.total);
    return { result: JSON.stringify({ owners: workload }) };
  }

  if (name === 'get_token_data') {
    let ca: string | undefined = args?.contractAddress?.trim();
    let projName = args?.project;
    if (!ca && projName) {
      const s = findProject(submissions, projName);
      ca = (s as any)?.contract_address?.trim();
      if (!ca) return { result: JSON.stringify({ error: `no stored contract address for "${projName}" — provide one or enrich the project first` }) };
    }
    if (!ca || !isContractAddress(ca)) {
      return { result: JSON.stringify({ error: 'need a valid contract address or a project with one on file' }) };
    }
    try {
      const t = await fetchTokenData(ca);
      if (!t) return { result: JSON.stringify({ found: false, note: 'no live token data for that address' }) };
      return { result: JSON.stringify({ found: true, live: true, token: t }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'discover API error' }) };
    }
  }

  if (name === 'list_scheduled_jobs') {
    try {
      const jobs = await prisma.cronJob.findMany({ orderBy: { createdAt: 'asc' } });
      const types = Object.values(JOB_HANDLERS).filter((h) => !CORE_TYPES.includes(h.type)).map((h) => ({ type: h.type, label: h.label, description: h.description }));
      const presets = Object.entries(SCHEDULE_PRESETS).map(([k, v]) => ({ token: k, label: v.label }));
      return { result: JSON.stringify({
        availableTypes: types,
        schedulePresets: presets,
        jobs: jobs.map((j: any) => ({ name: j.name, type: j.type, schedule: j.schedule, enabled: j.enabled, nextRunAt: j.nextRunAt, lastStatus: j.lastStatus })),
      }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'could not list jobs' }) };
    }
  }

  if (name === 'create_slack_report') {
    const spec = validateReportSpec({ title: args?.title, sections: args?.sections });
    if (!spec) return { result: JSON.stringify({ error: `invalid report spec — need at least one valid section from: ${REPORT_SECTION_KINDS.join(', ')}` }) };
    const sched = validateSchedule(String(args?.schedule || ''));
    if (!sched.ok) return { result: JSON.stringify({ error: sched.error }) };

    // Resolve the user's Slack webhook (their own, or team fallback).
    const webhook = await resolveUserWebhook(ctx.userEmail);
    if (!webhook) return { result: JSON.stringify({ error: 'No Slack webhook configured. Set one in Settings → Slack first.' }) };

    const job = await prisma.cronJob.create({
      data: {
        name: String(args?.name || spec.title),
        type: 'slack_report',
        schedule: String(args.schedule),
        enabled: true,
        nextRunAt: nextRunFrom(String(args.schedule)),
        createdBy: ctx.userEmail || 'agent',
        config: { spec, webhook } as unknown as Prisma.InputJsonValue,
      },
    });
    return { result: JSON.stringify({
      ok: true,
      created: true,
      jobName: job.name,
      schedule: String(args.schedule),
      sections: spec.sections.map((s: any) => s.kind),
      message: `Scheduled "${job.name}" to deliver to your Slack ${String(args.schedule)}. DO NOT call more tools — confirm this to the user.`,
    }) };
  }

  if (name === 'create_scheduled_job') {
    const jobName = String(args?.name || '').trim();
    const jobType = String(args?.type || '').trim();
    const schedule = String(args?.schedule || '').trim();
    if (!jobName) return { result: JSON.stringify({ error: 'name required' }) };
    if (!JOB_HANDLERS[jobType]) {
      return { result: JSON.stringify({ error: `unknown job type "${jobType}". Available: ${Object.keys(JOB_HANDLERS).filter((t) => !CORE_TYPES.includes(t)).join(', ')}` }) };
    }
    if (CORE_TYPES.includes(jobType)) {
      return { result: JSON.stringify({ error: `"${jobType}" runs automatically as a core system job and cannot be scheduled manually.` }) };
    }
    const sched = validateSchedule(schedule);
    if (!sched.ok) return { result: JSON.stringify({ error: sched.error }) };
    try {
      const job = await prisma.cronJob.create({
        data: { name: jobName, type: jobType, schedule, enabled: true, nextRunAt: nextRunFrom(schedule), createdBy: ctx.userEmail || 'agent' },
      });
      return { result: JSON.stringify({ ok: true, created: { name: job.name, type: job.type, schedule: job.schedule, nextRunAt: job.nextRunAt } }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'could not create job' }) };
    }
  }

  if (name === 'list_saved_panels') {
    try {
      const rows = await prisma.sharedPanel.findMany({
        where: { OR: [{ ownerId: ctx.userId }, { isPublic: true }] },
        include: { owner: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      });
      const panels = rows.map((r: any) => ({
        title: r.title,
        type: r.spec?.type,
        shows: r.spec?.groupBy ? `${r.spec?.metric || 'count'} by ${r.spec.groupBy}` : (r.spec?.metric || 'count'),
        mine: r.ownerId === ctx.userId,
        shared: r.isPublic,
        owner: r.owner?.name || r.owner?.email || 'teammate',
      }));
      return { result: JSON.stringify({ count: panels.length, panels }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'could not list panels' }) };
    }
  }

  if (name === 'get_score_config') {
    try {
      const w = await getWeights();
      return { result: JSON.stringify({
        max: 100,
        weights: { onchain_volume: w.fees, token_launched: w.launched, traction: w.traction, founder: w.founder, completeness: w.completeness },
        note: 'Onchain volume is scored on a log scale capped at its weight; the others are awarded in full when present.',
      }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'could not read score config' }) };
    }
  }

  if (name === 'ingest_project') {
    const text = (args?.text || '').trim();
    if (!text) return { result: JSON.stringify({ error: 'no text to ingest' }) };
    try {
      const outcome = await ingestText(text, 'AGENT', ctx.userEmail || 'agent');
      if (outcome.status === 'needs_clarification') {
        return { result: JSON.stringify({
          ok: false, needsClarification: true, message: outcome.message,
          missing: outcome.missing,
          instruction: 'ASK the user this clarifying question. Do NOT call more tools until they answer.',
        }) };
      }
      return { result: JSON.stringify({
        ok: outcome.status !== 'error',
        status: outcome.status,
        project: outcome.project,
        changes: outcome.changes,
        message: outcome.message,
        instruction: 'Report this outcome to the user plainly. DO NOT call more tools — just summarize what happened.',
      }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'ingest failed' }) };
    }
  }

  if (name === 'create_submission') {
    const project = (args?.project || '').trim();
    if (!project) return { result: JSON.stringify({ error: 'project name is required' }) };

    // Validate any needs-help flags up front.
    if (Array.isArray(args?.needsHelp)) {
      const bad = args.needsHelp.filter((v: string) => !NEEDS_HELP_TAGS.includes(v));
      if (bad.length) return { result: JSON.stringify({ error: `invalid flag(s): ${bad.join(', ')}. Allowed: ${NEEDS_HELP_TAGS.join(', ')}` }) };
    }

    // Dedup: if a same-named project exists, don't create — tell the model to edit instead.
    const match = await findProjectMatch(project);
    if (match) {
      return { result: JSON.stringify({
        ok: false,
        duplicate: true,
        existingProject: match.project,
        message: `A project named "${match.project}" already exists. Do NOT create a duplicate. Tell the user it already exists and ask if they want to update it with the new info instead. REMEMBER the field values from their request — if they confirm ("yeah update it"), call propose_edit on "${match.project}" with those values. DO NOT call more tools until they confirm.`,
      }) };
    }

    try {
      const res = await createSubmissionFromFields(args as NewSubmissionFields, 'AGENT');
      if (res.status === 'duplicate') {
        return { result: JSON.stringify({ ok: false, duplicate: true, existingProject: res.existingProject, message: `"${res.existingProject}" already exists — use propose_edit to update it instead.` }) };
      }
      return { result: JSON.stringify({
        ok: true,
        created: true,
        project: res.project,
        message: `Created new project "${res.project}". Tell the user it's been added and that they can fill in the rest anytime. DO NOT call more tools — just report this back.`,
      }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'create failed' }) };
    }
  }

  if (name === 'list_pending_proposals') {
    const where: any = { status: 'pending' };
    if (args?.project) {
      const match = await findProjectMatch(String(args.project));
      if (!match) return { result: JSON.stringify({ pending: [], note: `No project matching "${args.project}".` }) };
      where.submissionId = match.id;
    }
    const rows = await prisma.proposedEdit.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 20,
      include: { submission: { select: { project: true } } },
    });
    const pending = rows.map((r: any) => ({
      id: r.id,
      project: r.submission?.project ?? '(unknown)',
      changes: (r.changes as any[])?.map((c: any) => ({ field: c.field, op: c.op, value: c.value, from: c.currentValue })) ?? [],
      proposedBy: r.proposedBy,
      createdAt: r.createdAt,
    }));
    return { result: JSON.stringify({ pending, count: pending.length }) };
  }

  if (name === 'resolve_proposal') {
    const action = args?.action;
    if (action !== 'approve' && action !== 'reject') return { result: JSON.stringify({ error: 'action must be approve or reject' }) };
    let proposalId = args?.proposalId ? String(args.proposalId) : '';

    // Resolve by project if no id given — only if exactly one pending edit exists.
    if (!proposalId && args?.project) {
      const match = await findProjectMatch(String(args.project));
      if (!match) return { result: JSON.stringify({ error: `No project matching "${args.project}".` }) };
      const pendings = await prisma.proposedEdit.findMany({ where: { status: 'pending', submissionId: match.id }, select: { id: true } });
      if (pendings.length === 0) return { result: JSON.stringify({ error: `No pending edits for "${match.project}".` }) };
      if (pendings.length > 1) return { result: JSON.stringify({ error: `There are ${pendings.length} pending edits for "${match.project}" — ask which one (list_pending_proposals to see them).` }) };
      proposalId = pendings[0].id;
    }
    if (!proposalId) return { result: JSON.stringify({ error: 'need a proposalId or a project with exactly one pending edit' }) };

    const res = await resolveProposal(proposalId, action, ctx.userEmail || 'agent');
    if (!res.ok) return { result: JSON.stringify({ error: res.error }) };
    return { result: JSON.stringify({
      ok: true,
      status: res.status,
      message: `Proposal ${res.status}. ${action === 'approve' ? 'The change has been applied.' : 'The change was discarded.'} DO NOT call more tools — confirm to the user.`,
    }) };
  }

  if (name === 'set_contract_address') {
    const project = (args?.project || '').trim();
    const ca = (args?.contractAddress || '').trim();
    if (!project || !ca) return { result: JSON.stringify({ error: 'need both project and contractAddress' }) };
    if (!isContractAddress(ca)) return { result: JSON.stringify({ error: `"${ca}" is not a valid contract address (expected 0x… format)` }) };
    const match = await findProjectMatch(project);
    if (!match) return { result: JSON.stringify({ error: `no project matching "${project}"` }) };
    try {
      await enrichSubmission(match.id, ca);
      // Read back what token actually got attached so the user can sanity-check it.
      const tm = await prisma.tokenMatch.findUnique({ where: { submissionId: match.id } });
      return { result: JSON.stringify({
        ok: true,
        project: match.project,
        contractAddress: ca,
        token: tm ? { symbol: tm.token, vol24h: tm.vol24h, marketCapUsd: tm.marketCapUsd, priceChange24h: tm.priceChange24h } : null,
        message: `Set the contract address on "${match.project}" and pulled live data. Tell the user which token matched (symbol + volume + market cap) so they can confirm it's correct, then DO NOT call more tools.`,
      }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'could not set contract address (no token found for that address?)' }) };
    }
  }

  if (name === 'add_note') {
    const project = (args?.project || '').trim();
    const note = (args?.note || '').trim();
    if (!project || !note) return { result: JSON.stringify({ error: 'need both project and note' }) };
    if (!ctx.userId || ctx.role === 'GUEST') {
      return { result: JSON.stringify({ error: 'notes must be added by a mapped CRM user; your account is not linked.' }) };
    }
    const match = await findProjectMatch(project);
    if (!match) return { result: JSON.stringify({ error: `no project matching "${project}"` }) };
    try {
      await prisma.outreachActivity.create({
        data: { submissionId: match.id, authorId: ctx.userId, body: note, kind: 'note' },
      });
      return { result: JSON.stringify({
        ok: true,
        project: match.project,
        message: `Logged a note on "${match.project}". Confirm to the user and DO NOT call more tools.`,
      }) };
    } catch (e: any) {
      return { result: JSON.stringify({ error: e?.message ?? 'failed to add note' }) };
    }
  }

  if (name === 'propose_edit') {
    const projectQuery = (args?.project || '').trim();
    if (!projectQuery) return { result: JSON.stringify({ error: 'no project given' }) };
    const rawChanges: Change[] = Array.isArray(args?.changes) ? args.changes : [];
    if (!rawChanges.length) return { result: JSON.stringify({ error: 'no changes given' }) };

    // Validate fields + needs-help values.
    for (const c of rawChanges) {
      if (!isEditableField(c.field)) return { result: JSON.stringify({ error: `field "${c.field}" is not editable. Allowed: ${Object.keys(EDITABLE_FIELDS).join(', ')}` }) };
      if (c.field === 'needsHelp') {
        const vals = Array.isArray(c.value) ? c.value : [c.value];
        const bad = vals.filter((v: string) => !NEEDS_HELP_TAGS.includes(v));
        if (bad.length) return { result: JSON.stringify({ error: `invalid flag(s): ${bad.join(', ')}. Allowed: ${NEEDS_HELP_TAGS.join(', ')}` }) };
      }
    }

    // Resolve the real submission from the DB by project name (the trimmed chat
    // slice the agent sees has no id). Exact match first, then contains.
    const full =
      (await prisma.submission.findFirst({ where: { project: { equals: projectQuery, mode: 'insensitive' } } }))
      || (await prisma.submission.findFirst({ where: { project: { contains: projectQuery, mode: 'insensitive' } } }));
    if (!full) return { result: JSON.stringify({ error: `no project matching "${projectQuery}"` }) };

    const changes = snapshotCurrent(rawChanges, full as any);
    const trivial = allTrivial(changes);

    if (trivial) {
      // Auto-apply additive edits immediately; record as auto_applied for audit.
      await applyChangesToSubmission(full.id, changes);
      await prisma.proposedEdit.create({
        data: {
          submissionId: full.id,
          changes: changes as unknown as Prisma.InputJsonValue,
          rationale: args?.rationale ?? null,
          status: 'auto_applied',
          source: 'agent',
          proposedBy: ctx.userEmail ?? 'agent',
          reviewedAt: new Date(),
        },
      });
      return { result: JSON.stringify({
        ok: true,
        applied: true,
        project: full.project,
        changes: changes.map((c) => ({ field: c.field, op: c.op })),
        message: `Applied immediately (additive edit). Tell the user what changed on ${full.project} and DO NOT call any more tools — just report this back.`,
      }) };
    }

    // Otherwise file a pending proposal for human review.
    const pe = await prisma.proposedEdit.create({
      data: {
        submissionId: full.id,
        changes: changes as unknown as Prisma.InputJsonValue,
        rationale: args?.rationale ?? null,
        status: 'pending',
        source: 'agent',
        proposedBy: ctx.userEmail ?? 'agent',
      },
    });
    return { result: JSON.stringify({
      ok: true,
      applied: false,
      queuedForReview: true,
      proposalId: pe.id,
      project: full.project,
      changes: changes.map((c) => ({ field: c.field, op: c.op, to: c.value, from: (c as any).currentValue })),
      message: `This is a destructive edit, so it was queued (NOT applied). Show the user a clear before → after diff of each change on "${full.project}", then ask them to reply "approve" or "reject". If they approve, call resolve_proposal with this proposalId. It's also in the web Review inbox. DO NOT call more tools now — just show the diff and ask.`,
    }) };
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
