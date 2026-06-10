import crypto from "crypto";
import type { CanonicalSubmission, Founder, SourceKind } from "./types";

/** Raw Google Form column headers (exact strings from the export). */
export const FORM_COLS = {
  ts: "Timestamp",
  name: "Project Name",
  px: "Project X / Twitter Account",
  web: "Project Website or Demo",
  one: "Project One-Liner",
  f1n: "Founder 1 Name",
  f1x: "Founder 1 X / Twitter Account",
  f1e: "Founder 1 Email",
  f2: "Founder 2 Name and X / Twitter Account",
  f3: "Founder 3 Name and X / Twitter Account",
  f4: "Founder 4 Name and X / Twitter Account",
  loc: "Where is the team based? (City/country for each founder is enough.)",
  acc: "Founder accomplishments (Share previous projects, startups, GitHub repos, open source work, communities built, products shipped, or anything you are proud of.)",
  prob: "What problem are you solving?",
  sol: "What is your current solution? (What have you built or are building today?)",
  trac: "Current traction or accomplishments (Include users, revenue, volume, community size, waitlist, GitHub stars, partnerships, token activity, onchain usage, or anything else meaningful.)",
  fund: "Funding and runway (How much funding do you have now, if any? How many months of runway do you have? If bootstrapped, say so.)",
  plan: "What is your plan for the next 3 to 6 months?",
  help: "Where do you need the most help?",
  why: "Why Bankr? (Why do you want to work with Bankr, and how do you think Bankr can help?)",
  links: "Relevant Links (Add website, demo, deck, GitHub, docs, X account, Telegram, Discord, Dune dashboard, contract address, product video, or anything else useful.)",
  else: "Anything else we should know?",
  wallet: "Bankr Wallet (creator_recipient)",
  token: "Matched Token",
  via: "Matched Via",
  fees: "24h Fees (USD)",
} as const;

const HELP_TAGS = [
  "Community growth", "Partnerships", "GTM / distribution", "Fundraising",
  "Product strategy", "Token launch strategy", "Technical architecture",
  "Security", "Hiring", "Other",
];

const str = (v: unknown): string =>
  v == null ? "" : String(v).replace(/\\n/g, "\n").trim();

export function handle(v: unknown): string {
  const s = str(v);
  if (!s) return "";
  const m = s.match(/(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]+)/);
  if (m) return "@" + m[1];
  if (s.startsWith("@")) return s;
  if (/^[A-Za-z0-9_]+$/.test(s)) return "@" + s;
  return s;
}

function parseFounders(g: (h: string) => unknown): Founder[] {
  const out: Founder[] = [];
  const n = str(g(FORM_COLS.f1n));
  const x = handle(g(FORM_COLS.f1x));
  const e = str(g(FORM_COLS.f1e));
  if (n || x) out.push({ name: n, x, email: e });
  for (const key of [FORM_COLS.f2, FORM_COLS.f3, FORM_COLS.f4]) {
    const v = str(g(key));
    if (!v) continue;
    const xh = handle(v);
    const nm = v
      .replace(/(?:https?:\/\/)?(?:x\.com|twitter\.com)\/@?[A-Za-z0-9_]+/g, "")
      .replace(/^[\s\-,|]+|[\s\-,|]+$/g, "");
    out.push({ name: nm, x: xh.startsWith("@") ? xh : "", email: "" });
  }
  return out;
}

function parseHelp(v: unknown): string[] {
  const s = str(v).toLowerCase();
  return HELP_TAGS.filter((t) => s.includes(t.toLowerCase()));
}

function parseFees(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Normalize a header for tolerant matching (case/whitespace drift in live sheets). */
function normHeader(h: string): string {
  return String(h).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Stable dedup id derived from immutable identity (project + founder identity).
 * Crucially format-INDEPENDENT: the seed file and the live Google Sheet both
 * produce the same id, so re-importing never duplicates rows. (The old
 * project+timestamp scheme couldn't survive the Sheets API's timestamp format.)
 */
export function stableExternalId(project: string, founderKey: string): string {
  // Project case is preserved (a form cell never changes across re-imports, and
  // case-only variants are distinct submissions); emails are case-insensitive.
  const key = (project || "").trim() + "|" + (founderKey || "").toLowerCase().trim();
  return "sub_" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

/** @deprecated legacy project+timestamp id — kept for reference only. */
export function externalIdFor(project: string, ts: string): string {
  return "sub_" + crypto.createHash("md5").update(project + ts).digest("hex").slice(0, 8);
}

export function normalizeFormRow(
  row: Record<string, unknown>,
  source: SourceKind = "GOOGLE_FORM"
): CanonicalSubmission {
  // Tolerant lookup: exact header first, then normalized (handles whitespace/case drift).
  const idx = new Map<string, unknown>();
  for (const k of Object.keys(row)) idx.set(normHeader(k), row[k]);
  const g = (h: string): unknown => (h in row ? row[h] : idx.get(normHeader(h)) ?? "");

  const project = str(g(FORM_COLS.name));
  const ts = str(g(FORM_COLS.ts));
  const founders = parseFounders(g);
  const founderKey = founders[0]?.email || founders[0]?.x || "";

  const textFields = [
    FORM_COLS.one, FORM_COLS.acc, FORM_COLS.prob, FORM_COLS.sol, FORM_COLS.trac,
    FORM_COLS.fund, FORM_COLS.plan, FORM_COLS.why, FORM_COLS.links, FORM_COLS.else,
  ];
  const textLen = textFields.reduce((a, c) => a + str(g(c)).length, 0);

  return {
    externalId: stableExternalId(project, founderKey),
    source,
    submittedAt: ts ? new Date(ts).toISOString() : new Date().toISOString(),
    project,
    projectX: handle(g(FORM_COLS.px)),
    website: str(g(FORM_COLS.web)),
    oneLiner: str(g(FORM_COLS.one)),
    founders,
    location: str(g(FORM_COLS.loc)),
    accomplishments: str(g(FORM_COLS.acc)),
    problem: str(g(FORM_COLS.prob)),
    solution: str(g(FORM_COLS.sol)),
    traction: str(g(FORM_COLS.trac)),
    funding: str(g(FORM_COLS.fund)),
    plan: str(g(FORM_COLS.plan)),
    needsHelp: parseHelp(g(FORM_COLS.help)),
    whyBankr: str(g(FORM_COLS.why)),
    links: str(g(FORM_COLS.links)),
    notesField: str(g(FORM_COLS.else)),
    wallet: str(g(FORM_COLS.wallet)),
    token: str(g(FORM_COLS.token)),
    matchedVia: str(g(FORM_COLS.via)),
    fees24h: parseFees(g(FORM_COLS.fees)),
    vol24h: null,
    lowEffort: textLen < 200,
  };
}
