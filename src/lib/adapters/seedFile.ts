import fs from "fs";
import path from "path";
import type { SourceAdapter } from "./index";
import type { CanonicalSubmission } from "../types";
import { stableExternalId } from "../normalize";

/**
 * Reads data/submissions_clean.json (already canonical from Phase 0) and emits it.
 * Lets you run the full import → score → upsert pipeline locally with zero external
 * credentials. This is the default adapter for `npm run db:seed` and local imports.
 *
 * Uses the SAME externalId scheme as the live Google Sheet adapter, so a seeded row
 * and the same submission pulled live dedup to one row instead of duplicating.
 */
export class SeedFileAdapter implements SourceAdapter {
  source = "GOOGLE_FORM" as const;
  constructor(private file = path.join(process.cwd(), "data", "submissions_clean.json")) {}

  async fetch(): Promise<CanonicalSubmission[]> {
    const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as any[];
    return raw.map((r) => {
      const founders = r.founders ?? [];
      const founderKey = founders[0]?.email || founders[0]?.x || "";
      return {
        externalId: stableExternalId(r.project, founderKey),
        source: "GOOGLE_FORM" as const,
        submittedAt: new Date(r.submitted_at).toISOString(),
        project: r.project,
        projectX: r.project_x ?? "",
        website: r.website ?? "",
        oneLiner: r.one_liner ?? "",
        founders,
        location: r.location ?? "",
        accomplishments: r.accomplishments ?? "",
        problem: r.problem ?? "",
        solution: r.solution ?? "",
        traction: r.traction ?? "",
        funding: r.funding ?? "",
        plan: r.plan ?? "",
        needsHelp: r.needs_help ?? [],
        whyBankr: r.why_bankr ?? "",
        links: r.links ?? "",
        notesField: r.notes_field ?? "",
        wallet: r.wallet ?? "",
        token: r.token ?? "",
        matchedVia: r.matched_via ?? "",
        fees24h: r.fees_24h ?? null,
        vol24h: null,
        lowEffort: !!r.low_effort,
      };
    });
  }
}
