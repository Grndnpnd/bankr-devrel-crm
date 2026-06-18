import { prisma } from '@/lib/prisma';

/**
 * Proposed-edits engine. The agent (or an ingest source) produces a list of
 * proposed Changes against a project; humans approve them via the review inbox
 * — EXCEPT trivial additive edits, which auto-apply (non-destructive, logged).
 */

export type EditOp = 'replace' | 'append' | 'add' | 'remove';

export interface Change {
  field: string;          // canonical field key (see EDITABLE_FIELDS)
  op: EditOp;
  value?: any;            // text for replace/append; string|string[] for add/remove
  currentValue?: any;     // snapshot at proposal time (for diff + staleness check)
}

// Canonical editable fields + their kind. Natural-language → field mapping lives
// in the agent skill; this is the authoritative allow-list.
export const EDITABLE_FIELDS: Record<string, { kind: 'text' | 'set'; label: string; aliases: string[] }> = {
  oneLiner:        { kind: 'text', label: 'One-liner', aliases: ['one liner', 'tagline', 'summary'] },
  problem:         { kind: 'text', label: 'Problem', aliases: ['problem'] },
  solution:        { kind: 'text', label: 'Solution', aliases: ['solution', 'product'] },
  traction:        { kind: 'text', label: 'Traction', aliases: ['traction', 'metrics'] },
  funding:         { kind: 'text', label: 'Funding', aliases: ['funding', 'runway', 'raise'] },
  plan:            { kind: 'text', label: 'Plan / Goals', aliases: ['plan', 'goals', 'roadmap', 'next steps'] },
  whyBankr:        { kind: 'text', label: 'Why Bankr', aliases: ['why bankr'] },
  accomplishments: { kind: 'text', label: 'Accomplishments', aliases: ['accomplishments', 'achievements'] },
  links:           { kind: 'text', label: 'Links', aliases: ['links'] },
  notesField:      { kind: 'text', label: 'Notes', aliases: ['notes', 'note'] },
  website:         { kind: 'text', label: 'Website', aliases: ['website', 'site', 'url'] },
  projectX:        { kind: 'text', label: 'Project X/Twitter', aliases: ['twitter', 'x account', 'x handle'] },
  location:        { kind: 'text', label: 'Location', aliases: ['location', 'based', 'where'] },
  needsHelp:       { kind: 'set',  label: 'Needs-help flags', aliases: ['flags', 'needs help', 'help', 'asks', 'tags'] },
};

// Valid needs-help tag values (must match the intake vocabulary).
export const NEEDS_HELP_TAGS = [
  'Community growth', 'Partnerships', 'GTM / distribution', 'Fundraising',
  'Product strategy', 'Token launch strategy', 'Technical architecture',
  'Security', 'Hiring', 'Other',
];

export const isEditableField = (f: string): boolean => f in EDITABLE_FIELDS;

/** A change is trivial (auto-applies) iff: single additive op on a known field. */
export function isTrivialChange(c: Change): boolean {
  if (!isEditableField(c.field)) return false;
  return c.op === 'append' || c.op === 'add';
}

export function allTrivial(changes: Change[]): boolean {
  return changes.length > 0 && changes.every(isTrivialChange);
}

/** Apply a single change to an in-memory field value, returning the new value. */
export function applyOp(kind: 'text' | 'set', current: any, op: EditOp, value: any): any {
  if (kind === 'text') {
    const cur = (current ?? '') as string;
    if (op === 'replace') return value ?? null;
    if (op === 'append') return cur ? `${cur}\n${value}` : (value ?? null);
    if (op === 'remove') return null; // clear the field
    return cur;
  }
  // set (string[])
  const arr: string[] = Array.isArray(current) ? [...current] : [];
  const vals: string[] = Array.isArray(value) ? value : (value != null ? [value] : []);
  if (op === 'add') return Array.from(new Set([...arr, ...vals]));
  if (op === 'remove') return arr.filter((x) => !vals.includes(x));
  if (op === 'replace') return vals;
  return arr;
}

/** Build the DB update payload for a set of changes against a submission row. */
export function buildUpdateData(changes: Change[], current: Record<string, any>): Record<string, any> {
  const data: Record<string, any> = {};
  for (const c of changes) {
    const def = EDITABLE_FIELDS[c.field];
    if (!def) continue;
    data[c.field] = applyOp(def.kind, current[c.field], c.op, c.value);
  }
  return data;
}

/** Snapshot the current values for the fields a change set touches. */
export function snapshotCurrent(changes: Change[], submission: Record<string, any>): Change[] {
  return changes.map((c) => ({ ...c, currentValue: submission[c.field] ?? null }));
}

/**
 * Apply a set of changes to the submission. The audit trail is the ProposedEdit
 * record itself (status, proposedBy, timestamps) — we don't synthesize an
 * OutreachActivity (that requires a real User author; agent edits have none).
 * Returns nothing; throws if the submission is missing.
 */
export async function applyChangesToSubmission(
  submissionId: string,
  changes: Change[],
): Promise<void> {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!sub) throw new Error('submission not found');
  const data = buildUpdateData(changes, sub as any);
  if (Object.keys(data).length === 0) return;
  await prisma.submission.update({ where: { id: submissionId }, data });
}

/**
 * Shared approve/reject for a pending proposal. Used by the web API route AND
 * the agent's resolve_proposal tool (Slack inline approval), so the logic lives
 * in one place. Returns a result object; callers adapt the response.
 */
export async function resolveProposal(
  id: string,
  action: 'approve' | 'reject',
  reviewedBy: string,
): Promise<{ ok: boolean; error?: string; status?: string }> {
  const { prisma } = await import('@/lib/prisma');
  const pe = await prisma.proposedEdit.findUnique({ where: { id } });
  if (!pe) return { ok: false, error: 'proposal not found' };
  if (pe.status !== 'pending') return { ok: false, error: 'that proposal was already resolved' };

  if (action === 'approve') {
    const changes = (pe.changes as unknown as Change[]) || [];
    try {
      await applyChangesToSubmission(pe.submissionId, changes);
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'apply failed' };
    }
    await prisma.proposedEdit.update({ where: { id }, data: { status: 'approved', reviewedBy, reviewedAt: new Date() } });
    return { ok: true, status: 'approved' };
  }
  if (action === 'reject') {
    await prisma.proposedEdit.update({ where: { id }, data: { status: 'rejected', reviewedBy, reviewedAt: new Date() } });
    return { ok: true, status: 'rejected' };
  }
  return { ok: false, error: 'action must be approve or reject' };
}
