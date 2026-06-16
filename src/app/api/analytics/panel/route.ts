import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chat, extractJson, llmConfigured } from "@/lib/llm";
import {
  validateSpec, GROUPABLE_FIELDS, NUMERIC_FIELDS, FILTERABLE_FIELDS, TABLE_COLUMNS,
} from "@/lib/analyticsSpec";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYSTEM = `You translate a question about a CRM of crypto project submissions into a JSON "panel spec". You do NOT compute or invent any numbers — our code computes them from the real data. Output ONLY a JSON object, no prose.

The CRM tracks project submissions. Each has: stage (New, Reviewing, Contacted, In Convo, Onboarding, Won, Passed), source (google_form, plain, manual), owner (a team member name or empty), needs_help (array of tags like "Partnerships", "Fundraising", "Community growth", "GTM / distribution", "Product strategy", "Token launch strategy", "Technical architecture", "Security", "Hiring", "Other"), score (0-100), vol_24h (token 24h volume, USD), market_cap (USD), fees_24h, price_change_24h, low_effort (bool), needs_review (bool), token, contract_address, project, submitted_at, one_liner.

Spec shape:
{
  "type": "stat" | "bar" | "pie" | "table",
  "title": "short human title",
  "metric": "count" | "sum" | "avg" | "min" | "max",   // default count
  "metricField": one of [${NUMERIC_FIELDS.join(", ")}]   // required unless metric is count
  "groupBy": one of [${GROUPABLE_FIELDS.join(", ")}]      // required for bar/pie
  "columns": subset of [${TABLE_COLUMNS.join(", ")}]      // for table
  "filters": [ { "field": one of [${FILTERABLE_FIELDS.join(", ")}], "op": "eq|neq|gt|gte|lt|lte|contains|has|is_empty|not_empty", "value": ... } ],
  "sort": "asc" | "desc",
  "limit": number
}

Rules:
- "how many", "count of" -> type stat, metric count.
- "X by Y" / "breakdown / distribution" -> bar or pie, groupBy Y.
- "average/total/highest <numeric>" -> stat with metric avg/sum/max + metricField.
- "list / show / which projects" -> table with relevant columns.
- For needs_help tags use op "has". For text contains use "contains". For numeric thresholds use gt/gte/lt/lte.
- Keep titles short. Prefer bar over pie for >6 groups. Default to a sensible choice if ambiguous.`;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!llmConfigured()) {
    return NextResponse.json({ error: "The analytics assistant isn't configured yet." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "ask a question" }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "question too long" }, { status: 400 });

  const result = await chat(SYSTEM, question);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "assistant unavailable" }, { status: 502 });
  }
  const parsed = extractJson(result.content!);
  if (!parsed) {
    return NextResponse.json({ error: "Couldn't interpret that — try rephrasing." }, { status: 422 });
  }
  const v = validateSpec(parsed);
  if (!v.ok) {
    return NextResponse.json({ error: `Couldn't build a valid panel: ${v.errors.join("; ")}` }, { status: 422 });
  }
  // Return the SPEC only — the client executes it against the data it already has.
  return NextResponse.json({ spec: v.spec });
}
