import { prisma } from '@/lib/prisma';
import { stableExternalId, handle } from '@/lib/normalize';
import { score } from '@/lib/scoring';
import { getWeights } from '@/lib/scoreConfig';
import type { CanonicalSubmission } from '@/lib/types';
import { Prisma } from '@prisma/client';
import { chat } from '@/lib/llm';
import { EXTRACTION_CONTRACT, validateExtraction, type ExtractedProject } from '@/lib/ingestSkill';
import { EDITABLE_FIELDS, isEditableField, snapshotCurrent, allTrivial, applyChangesToSubmission, type Change } from '@/lib/proposedEdits';

export interface NewSubmissionFields {
  project: string;
  oneLiner?: string;
  problem?: string;
  solution?: string;
  traction?: string;
  funding?: string;
  plan?: string;
  whyBankr?: string;
  accomplishments?: string;
  links?: string;
  notesField?: string;
  projectX?: string;
  website?: string;
  location?: string;
  needsHelp?: string[];
  founderName?: string;
  founderEmail?: string;
  founderX?: string;
}

export interface CreateResult {
  status: 'created' | 'duplicate';
  id?: string;
  project?: string;
  existingId?: string;
  existingProject?: string;
}

/** Find a likely existing match for a project name (case-insensitive exact, then contains). */
export async function findProjectMatch(project: string): Promise<{ id: string; project: string } | null> {
  const q = (project || '').trim();
  if (!q) return null;
  const exact = await prisma.submission.findFirst({
    where: { project: { equals: q, mode: 'insensitive' } },
    select: { id: true, project: true },
  });
  if (exact) return exact;
  const contains = await prisma.submission.findFirst({
    where: { project: { contains: q, mode: 'insensitive' } },
    select: { id: true, project: true },
  });
  return contains;
}

/**
 * Create a new submission from (possibly partial) fields. Project name is the
 * only hard requirement — founders/one-liner/etc. are optional so an ingest
 * source can create a stub card and fill it later. Dedups on a likely name
 * match: if one exists, returns { status: 'duplicate' } instead of creating,
 * so the caller can route to an edit instead.
 */
export async function createSubmissionFromFields(
  f: NewSubmissionFields,
  source: 'MANUAL' | 'AGENT' | 'SLACK' | 'TELEGRAM' = 'AGENT',
): Promise<CreateResult> {
  const project = (f.project || '').trim();
  if (!project) throw new Error('project name is required');

  // Dedup: don't create over an existing same-named project.
  const match = await findProjectMatch(project);
  if (match) {
    return { status: 'duplicate', existingId: match.id, existingProject: match.project };
  }

  const founderName = (f.founderName || '').trim();
  const founderEmail = (f.founderEmail || '').trim().toLowerCase();
  const founderX = handle(f.founderX || '');
  // Founders may be empty for a stub card; store an empty array if nothing given.
  const founders = (founderName || founderEmail || founderX)
    ? [{ name: founderName, x: founderX, email: founderEmail }]
    : [];

  const needsHelp: string[] = Array.isArray(f.needsHelp)
    ? f.needsHelp.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const canonical = {
    project,
    projectX: handle(f.projectX || ''),
    website: (f.website || '').trim(),
    location: (f.location || '').trim(),
    oneLiner: (f.oneLiner || '').trim(),
    problem: (f.problem || '').trim(),
    solution: (f.solution || '').trim(),
    traction: (f.traction || '').trim(),
    funding: (f.funding || '').trim(),
    plan: (f.plan || '').trim(),
    whyBankr: (f.whyBankr || '').trim(),
    accomplishments: (f.accomplishments || '').trim(),
    links: (f.links || '').trim(),
    notesField: (f.notesField || '').trim(),
    token: null, fees24h: null, vol24h: null,
  } as unknown as CanonicalSubmission;

  const { score: sc, breakdown } = score(canonical, await getWeights());
  // Use whatever identity we have for the externalId; fall back to the project name.
  const externalId = stableExternalId(project, founderEmail || founderX || founderName || project);

  // Guard against an externalId collision too (same project+founder).
  const collision = await prisma.submission.findFirst({ where: { externalId }, select: { id: true, project: true } });
  if (collision) return { status: 'duplicate', existingId: collision.id, existingProject: collision.project };

  const row = await prisma.submission.create({
    data: {
      source,
      externalId,
      submittedAt: new Date(),
      project,
      projectX: canonical.projectX || null,
      website: canonical.website || null,
      location: canonical.location || null,
      oneLiner: canonical.oneLiner || null,
      problem: canonical.problem || null,
      solution: canonical.solution || null,
      traction: canonical.traction || null,
      funding: canonical.funding || null,
      plan: canonical.plan || null,
      whyBankr: canonical.whyBankr || null,
      accomplishments: canonical.accomplishments || null,
      links: canonical.links || null,
      notesField: canonical.notesField || null,
      needsHelp,
      founders: founders as unknown as Prisma.InputJsonValue,
      score: sc,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      lowEffort: false,
    },
    select: { id: true, project: true },
  });
  return { status: 'created', id: row.id, project: row.project };
}

// ─────────────────────────────────────────────────────────────────────────────
// TWO-STAGE INGEST PIPELINE (the ingest skill in action)
// ─────────────────────────────────────────────────────────────────────────────

export interface IngestOutcome {
  status: 'created' | 'updated' | 'queued' | 'needs_clarification' | 'error';
  project?: string;
  message: string;
  changes?: { field: string; op: string }[];
  missing?: string[];
}

/** STAGE 1 — extract structured data from raw text (LLM, no tools). */
export async function extractProjectData(rawText: string): Promise<ExtractedProject | { error: string }> {
  const res = await chat(EXTRACTION_CONTRACT, rawText);
  if (!res.ok || !res.content) return { error: res.error || 'extraction failed' };
  // The skill says "JSON only", but be defensive and pull the object out.
  const start = res.content.indexOf('{');
  const end = res.content.lastIndexOf('}');
  if (start === -1 || end === -1) return { error: 'extractor returned no JSON' };
  try {
    const parsed = JSON.parse(res.content.slice(start, end + 1));
    return validateExtraction(parsed);
  } catch {
    return { error: 'could not parse extraction JSON' };
  }
}

/** STAGE 2 — act on a validated extraction: dedup → create or propose edits. */
export async function applyIngest(
  ex: ExtractedProject,
  source: 'AGENT' | 'SLACK' | 'TELEGRAM' = 'AGENT',
  proposedBy = 'agent',
): Promise<IngestOutcome> {
  // Vague / no project name → ask the caller to clarify before acting.
  if (ex.ambiguous || !ex.projectName) {
    return {
      status: 'needs_clarification',
      message: ex.ambiguityReason || 'The input was too vague to act on — what is the project name and a one-line description?',
      missing: ex.missing,
    };
  }

  const match = await findProjectMatch(ex.projectName);

  // NEW project → create (never sets score; onchain job owns it).
  if (!match) {
    const res = await createSubmissionFromFields(
      {
        project: ex.projectName,
        ...ex.fields,
        needsHelp: ex.needsHelp,
      } as NewSubmissionFields,
      source,
    );
    if (res.status === 'duplicate') {
      return { status: 'error', message: `"${res.existingProject}" already exists — try updating it instead.` };
    }
    return {
      status: 'created',
      project: res.project,
      message: `Created "${res.project}".${ex.missing.length ? ` Still missing: ${ex.missing.join(', ')}.` : ''}`,
      missing: ex.missing,
    };
  }

  // EXISTING project → build changes and route through the proposed-edits engine.
  const full = await prisma.submission.findUnique({ where: { id: match.id } });
  if (!full) return { status: 'error', message: 'matched project vanished' };

  const changes: Change[] = [];
  for (const [field, value] of Object.entries(ex.fields)) {
    if (!isEditableField(field)) continue;
    const def = EDITABLE_FIELDS[field];
    const current = (full as any)[field];
    if (def.kind === 'text') {
      const isBlank = !current || String(current).trim() === '';
      // Blank field → append (additive, auto-applies). Populated → replace (destructive, queues).
      changes.push({ field, op: isBlank ? 'append' : 'replace', value });
    }
  }
  if (ex.needsHelp.length) {
    changes.push({ field: 'needsHelp', op: 'add', value: ex.needsHelp });
  }

  if (!changes.length) {
    return { status: 'updated', project: match.project, message: `"${match.project}" already has everything in that input — no changes.`, changes: [] };
  }

  const snapped = snapshotCurrent(changes, full as any);
  const trivial = allTrivial(snapped);
  const summary = snapped.map((c) => ({ field: c.field, op: c.op }));

  if (trivial) {
    await applyChangesToSubmission(match.id, snapped);
    await prisma.proposedEdit.create({
      data: {
        submissionId: match.id, changes: snapped as any, status: 'auto_applied',
        source: source === 'AGENT' ? 'agent' : 'ingest', proposedBy, reviewedAt: new Date(),
      },
    });
    return { status: 'updated', project: match.project, message: `Updated "${match.project}" (filled blank fields).`, changes: summary };
  }

  // Has destructive changes (would overwrite populated fields) → queue for review.
  await prisma.proposedEdit.create({
    data: {
      submissionId: match.id, changes: snapped as any, status: 'pending',
      source: source === 'AGENT' ? 'agent' : 'ingest', proposedBy,
    },
  });
  return {
    status: 'queued',
    project: match.project,
    message: `"${match.project}" already exists with some of these fields filled — queued ${summary.length} change(s) for review.`,
    changes: summary,
  };
}

/** Full pipeline: extract → act. The single entry point sources call. */
export async function ingestText(
  rawText: string,
  source: 'AGENT' | 'SLACK' | 'TELEGRAM' = 'AGENT',
  proposedBy = 'agent',
): Promise<IngestOutcome> {
  const ex = await extractProjectData(rawText);
  if ('error' in ex) return { status: 'error', message: ex.error };
  return applyIngest(ex, source, proposedBy);
}
