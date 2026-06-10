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
}

/** Score + upsert a batch of canonical submissions. Dedup key = (source, externalId). */
export async function runImport(adapter: SourceAdapter, since?: Date): Promise<ImportResult> {
  const items = await adapter.fetch(since);
  const weights = await getWeights();
  let created = 0;
  let updated = 0;

  for (const s of items) {
    // Look up the existing row first so we can (a) count create vs update and
    // (b) preserve onchain enrichment that the intake form itself doesn't carry.
    const existing = await prisma.submission.findUnique({
      where: { source_externalId: { source: s.source, externalId: s.externalId } },
      select: {
        id: true,
        tokenMatch: { select: { token: true, fees24h: true } },
      },
    });

    // The Google Form has no token/fees columns — those come from a separate
    // onchain match. When the incoming row lacks them, fall back to whatever is
    // already stored so a form re-import never tanks an onchain-scored project.
    const token = s.token || existing?.tokenMatch?.token || "";
    const fees24h = s.fees24h ?? existing?.tokenMatch?.fees24h ?? null;
    const { score: sc, breakdown } = score({ ...s, token, fees24h }, weights);

    const base = {
      submittedAt: new Date(s.submittedAt),
      project: s.project,
      projectX: s.projectX || null,
      website: s.website || null,
      oneLiner: s.oneLiner || null,
      problem: s.problem || null,
      solution: s.solution || null,
      traction: s.traction || null,
      funding: s.funding || null,
      plan: s.plan || null,
      whyBankr: s.whyBankr || null,
      accomplishments: s.accomplishments || null,
      links: s.links || null,
      notesField: s.notesField || null,
      location: s.location || null,
      needsHelp: s.needsHelp,
      founders: s.founders as unknown as Prisma.InputJsonValue,
      score: sc,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      lowEffort: s.lowEffort,
    };

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

  return { source: adapter.source, pulled: items.length, created, updated };
}
