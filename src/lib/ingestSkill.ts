import { EDITABLE_FIELDS, NEEDS_HELP_TAGS } from '@/lib/proposedEdits';

/**
 * THE INGEST SKILL — the single canonical definition of how Bankr turns
 * arbitrary unstructured input (a Slack message, a forwarded email, a pasted
 * blurb, a chat instruction) into structured CRM data. Any source (agent chat,
 * Slack, Telegram, …) references THIS module so the mapping logic lives in one
 * place. The bot/source side stays dumb; the intelligence is here.
 *
 * Two-stage pipeline:
 *   Stage 1 (extract): an LLM reads the blob and emits validated JSON per the
 *     EXTRACTION_CONTRACT below — it never invents values, never sets score or
 *     token, and reports what's missing/uncertain.
 *   Stage 2 (act): deterministic code dedups + routes the extraction to
 *     create_submission (new) or propose_edit (existing). No LLM in stage 2.
 */

// Fields the extractor may populate (a superset of EDITABLE_FIELDS + founder bits).
export const INGEST_FIELDS: Record<string, { desc: string }> = {
  project: { desc: 'the project / company name (REQUIRED — without it we cannot create or match)' },
  oneLiner: { desc: 'a one-sentence description of what they do' },
  problem: { desc: 'the problem they are solving' },
  solution: { desc: 'their product / how they solve it' },
  traction: { desc: 'users, revenue, growth, metrics' },
  funding: { desc: 'funding raised, runway, investors' },
  plan: { desc: 'goals, roadmap, what they are working toward next' },
  whyBankr: { desc: 'why they want to work with Bankr' },
  accomplishments: { desc: 'notable achievements' },
  links: { desc: 'any URLs (docs, decks, repos)' },
  notesField: { desc: 'freeform context that does not fit elsewhere' },
  projectX: { desc: "the project's X/Twitter handle" },
  website: { desc: 'website URL' },
  location: { desc: 'where they are based' },
  needsHelp: { desc: `what they need help with — ONLY from this set: ${NEEDS_HELP_TAGS.join(', ')}` },
  founderName: { desc: "a founder's name" },
  founderEmail: { desc: "a founder's email" },
  founderX: { desc: "a founder's X/Twitter handle" },
};

/** The extraction contract — the exact JSON the stage-1 model must return. */
export const EXTRACTION_CONTRACT = `You extract structured project data for a crypto/DeFi DevRel CRM from unstructured text.

Return ONLY a JSON object (no prose, no markdown fences) with this exact shape:
{
  "projectName": string | null,        // best guess at the project name, or null if none is stated
  "fields": {                           // include ONLY fields you can fill from the text
    ${Object.keys(INGEST_FIELDS).filter((f) => f !== 'project').map((f) => `"${f}"?: ...`).join(', ')}
  },
  "needsHelp": string[],                // only values from the allowed set, only if clearly indicated
  "missing": string[],                  // names of important fields you could NOT determine
  "ambiguous": boolean,                 // true if the text is too vague/garbled to act on confidently
  "ambiguityReason": string | null      // if ambiguous, one sentence on what's unclear
}

FIELD MEANINGS:
${Object.entries(INGEST_FIELDS).map(([k, v]) => `- ${k}: ${v.desc}`).join('\n')}

HARD RULES:
- NEVER invent or guess values. If the text doesn't state it, omit the field (do not fill with a placeholder).
- NEVER output a score, token, contract address, or market data — those are owned by other systems.
- needsHelp values MUST be exactly from: ${NEEDS_HELP_TAGS.join(', ')}. If something doesn't map, leave it out.
- If the project name is not clearly stated, set projectName to null and ambiguous to true.
- Be conservative: it's better to leave a field out than to fill it wrong.
- Output valid JSON only.`;

export interface ExtractedProject {
  projectName: string | null;
  fields: Record<string, string>;
  needsHelp: string[];
  missing: string[];
  ambiguous: boolean;
  ambiguityReason: string | null;
}

/** Validate + normalize a raw parsed extraction into a safe ExtractedProject. */
export function validateExtraction(raw: any): ExtractedProject {
  const fields: Record<string, string> = {};
  if (raw?.fields && typeof raw.fields === 'object') {
    for (const [k, v] of Object.entries(raw.fields)) {
      // Only accept known fields with non-empty string values.
      if (k in INGEST_FIELDS && k !== 'needsHelp' && typeof v === 'string' && v.trim()) {
        fields[k] = v.trim();
      }
    }
  }
  const needsHelp: string[] = Array.isArray(raw?.needsHelp)
    ? raw.needsHelp.filter((t: any) => typeof t === 'string' && NEEDS_HELP_TAGS.includes(t))
    : [];
  return {
    projectName: typeof raw?.projectName === 'string' && raw.projectName.trim() ? raw.projectName.trim() : null,
    fields,
    needsHelp,
    missing: Array.isArray(raw?.missing) ? raw.missing.filter((m: any) => typeof m === 'string') : [],
    ambiguous: !!raw?.ambiguous || !raw?.projectName,
    ambiguityReason: typeof raw?.ambiguityReason === 'string' ? raw.ambiguityReason : null,
  };
}

// Sanity re-export so callers have the allowed flag set without a second import.
export { NEEDS_HELP_TAGS, EDITABLE_FIELDS };
