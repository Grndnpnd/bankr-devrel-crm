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
import { prisma } from '@/lib/prisma';
import { EDITABLE_FIELDS, NEEDS_HELP_TAGS, isEditableField, allTrivial, snapshotCurrent, applyChangesToSubmission, type Change } from '@/lib/proposedEdits';
import { createSubmissionFromFields, findProjectMatch, type NewSubmissionFields } from '@/lib/ingest';
import { can } from '@/lib/access';
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
    create_submission: 'submissions.edit',
    propose_edit: 'submissions.edit',
    create_scheduled_job: 'cron.manage',
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
        message: `A project named "${match.project}" already exists. Do NOT create a duplicate — if the user wants to add info to it, use propose_edit instead. Tell the user it already exists and ask if they want to update it. DO NOT call more tools until they confirm.`,
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
      changes: changes.map((c) => ({ field: c.field, op: c.op })),
      message: `Done. This is a destructive edit, so it was queued for human review (not applied). Tell the user it's in the Review inbox awaiting approval, and DO NOT call any more tools — just report this back.`,
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
