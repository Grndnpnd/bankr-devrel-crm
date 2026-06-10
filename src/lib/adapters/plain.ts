import type { SourceAdapter } from "./index";
import type { CanonicalSubmission } from "../types";

/**
 * Plain is the long-term intake funnel. Plain does not yet support more than one
 * form, so this adapter is FRAMEWORK-ONLY for now and stays disabled in production
 * (see PLAIN_ENABLED). The wiring exists so that the moment Plain ships multi-form
 * support, only the field mapping below needs finishing — no schema or pipeline change.
 *
 * Expected env once live: PLAIN_API_KEY, PLAIN_FORM_ID.
 * Reference: Plain's submission/thread API. Map their submission fields onto
 * CanonicalSubmission exactly as normalizeFormRow does for Google.
 */
export class PlainAdapter implements SourceAdapter {
  source = "PLAIN" as const;

  constructor(
    private apiKey = process.env.PLAIN_API_KEY,
    private enabled = process.env.PLAIN_ENABLED === "true"
  ) {}

  async fetch(_since?: Date): Promise<CanonicalSubmission[]> {
    if (!this.enabled) return []; // intentionally inert until Plain multi-form is ready
    if (!this.apiKey) throw new Error("PlainAdapter: PLAIN_API_KEY not set.");

    // TODO(plain): replace with the real Plain submissions query once multi-form lands.
    // const res = await fetch("https://api.plain.com/...", {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ /* query */ }),
    // });
    // const data = await res.json();
    // return data.submissions.map(mapPlainSubmission);
    return [];
  }
}

/** Placeholder mapper — fill in field paths when Plain's payload is finalized. */
// function mapPlainSubmission(p: any): CanonicalSubmission { ... }
