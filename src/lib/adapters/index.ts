import { prisma } from "../prisma";
import { score } from "../scoring";
import { getWeights } from "../scoreConfig";
import type { Prisma } from "@prisma/client";
import type { CanonicalSubmission, SourceKind } from "../types";

/**
 * A source adapter pulls raw records from somewhere (Google Sheet, Plain, a file)
 * and normalizes them to CanonicalSubmission. The import pipeline below scores
 * and upserts them — adapters never touch the database directly.
 */
export interface SourceAdapter {
  source: SourceKind;
  /** Pull + normalize. `since` lets adapters do incremental syncs where supported. */
  fetch(since?: Date): Promise<CanonicalSubmission[]>;
}

export interface ImportResult {
  source: SourceKind;
  pulled: number;
  created: number;
  updated: number;
  unchanged: number;
}

/** Score + upsert a batch of canonical submissions. Dedup key = (source, externalId). */
export async function runImport(adapter: SourceAdapter, since?: Date): Promise<ImportResult> {
  const items = await adapter.fetch(since);
  const weights = await getWeights();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const s of items) {
    // Look up the existing row first so we can (a) count create vs update and
    // (b) preserve onchain enrichment that the intake form itself doesn't carry.
    const existing = await prisma.submission.findUnique({
      where: { source_externalId: { source: s.source, externalId: s.externalId } },
      select: {
        id: true,
        projectX: true, website: true, oneLiner: true, problem: true, solution: true,
        traction: true, funding: true, plan: true, whyBankr: true, accomplishments: true,
        links: true, notesField: true, location: true,
        project: true, needsHelp: true, founders: true, score: true, lowEffort: true,
        tokenMatch: { select: { token: true, fees24h: true, vol24h: true } },
      },
    });

    // The Google Form has no token/fees columns — those come from a separate
    // onchain match. When the incoming row lacks them, fall back to whatever is
    // already stored so a form re-import never tanks an onchain-scored project.
    const token = s.token || existing?.tokenMatch?.token || "";
    const fees24h = s.fees24h ?? existing?.tokenMatch?.fees24h ?? null;
    const vol24h = existing?.tokenMatch?.vol24h ?? null;
    const { score: sc, breakdown } = score({ ...s, token, fees24h, vol24h }, weights);

    // Fill-blanks-only for content fields: on an existing row, keep whatever is
    // already stored if it's non-empty (preserves in-CRM edits); only fill from
    // the incoming sheet value when the stored field is blank. New rows take the
    // incoming value directly (existing is null).
    const keep = (stored: string | null | undefined, incoming: string | null | undefined) => {
      if (existing) return (stored && String(stored).trim() !== "") ? stored : (incoming || null);
      return incoming || null;
    };

    const content = {
      projectX: keep(existing?.projectX, s.projectX),
      website: keep(existing?.website, s.website),
      oneLiner: keep(existing?.oneLiner, s.oneLiner),
      problem: keep(existing?.problem, s.problem),
      solution: keep(existing?.solution, s.solution),
      traction: keep(existing?.traction, s.traction),
      funding: keep(existing?.funding, s.funding),
      plan: keep(existing?.plan, s.plan),
      whyBankr: keep(existing?.whyBankr, s.whyBankr),
      accomplishments: keep(existing?.accomplishments, s.accomplishments),
      links: keep(existing?.links, s.links),
      notesField: keep(existing?.notesField, s.notesField),
      location: keep(existing?.location, s.location),
    };

    const base = {
      submittedAt: new Date(s.submittedAt),
      project: s.project,
      ...content,
      needsHelp: s.needsHelp,
      founders: s.founders as unknown as Prisma.InputJsonValue,
      score: sc,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      lowEffort: s.lowEffort,
    };


    // Decide if this row actually changes anything. If an existing row's
    // comparable fields all match what we'd write, skip the write entirely —
    // that keeps the "updated" count truthful and avoids pointless DB churn
    // (no more "142 updated" every cycle when nothing really changed).
    if (existing) {
      const same =
        existing.project === base.project &&
        (existing.projectX ?? null) === (base.projectX ?? null) &&
        (existing.website ?? null) === (base.website ?? null) &&
        (existing.oneLiner ?? null) === (base.oneLiner ?? null) &&
        (existing.problem ?? null) === (base.problem ?? null) &&
        (existing.solution ?? null) === (base.solution ?? null) &&
        (existing.traction ?? null) === (base.traction ?? null) &&
        (existing.funding ?? null) === (base.funding ?? null) &&
        (existing.plan ?? null) === (base.plan ?? null) &&
        (existing.whyBankr ?? null) === (base.whyBankr ?? null) &&
        (existing.accomplishments ?? null) === (base.accomplishments ?? null) &&
        (existing.links ?? null) === (base.links ?? null) &&
        (existing.notesField ?? null) === (base.notesField ?? null) &&
        (existing.location ?? null) === (base.location ?? null) &&
        existing.score === base.score &&
        existing.lowEffort === base.lowEffort &&
        JSON.stringify(existing.needsHelp ?? []) === JSON.stringify(base.needsHelp ?? []) &&
        JSON.stringify(existing.founders ?? null) === JSON.stringify(s.founders ?? null);

      // Onchain match may still need a refresh even if the submission is unchanged.
      const tokenChanged = !!s.token && (existing.tokenMatch?.token !== s.token || existing.tokenMatch?.fees24h !== s.fees24h);

      if (same && !tokenChanged) {
        unchanged++;
        continue; // nothing to do for this row
      }
    }

    const row = await prisma.submission.upsert({
      where: { source_externalId: { source: s.source, externalId: s.externalId } },
      // On re-import we refresh the intake + score but PRESERVE workflow fields
      // (stage / owner / activity) that the team has set.
      update: base,
      create: { ...base, source: s.source, externalId: s.externalId },
    });
    existing ? updated++ : created++;

    // Onchain signal lives in its own table; only (re)write it when the source
    // actually carries a token, so form imports leave existing matches intact.
    if (s.token) {
      await prisma.tokenMatch.upsert({
        where: { submissionId: row.id },
        update: { token: s.token, wallet: s.wallet || null, matchedVia: s.matchedVia || null, fees24h: s.fees24h, refreshedAt: new Date() },
        create: { submissionId: row.id, token: s.token, wallet: s.wallet || null, matchedVia: s.matchedVia || null, fees24h: s.fees24h },
      });
    }
  }

  return { source: adapter.source, pulled: items.length, created, updated, unchanged };
}
