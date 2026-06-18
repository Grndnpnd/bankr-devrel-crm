import { prisma } from '@/lib/prisma';
import { stableExternalId, handle } from '@/lib/normalize';
import { score } from '@/lib/scoring';
import { getWeights } from '@/lib/scoreConfig';
import type { CanonicalSubmission } from '@/lib/types';
import { Prisma } from '@prisma/client';

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
