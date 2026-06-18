import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { chatWithTools, llmConfigured, type ToolMessage } from "@/lib/llm";
import { AGENT_TOOLS, runTool } from "@/lib/agentTools";
import type { AnalyticsSpec } from "@/lib/analyticsSpec";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_STEPS = 6;

const SYSTEM = `You are the Bankr DevRel CRM assistant — a helpful analyst embedded in a CRM of crypto project submissions. You help the team understand their pipeline and build dashboard panels.

You have tools:
- query_pipeline: exact aggregates/lists computed deterministically by code. ALWAYS use this for precise numbers ("how many", "average", "list top N"). Never compute numbers yourself.
- get_pipeline_summary: a privacy-trimmed snapshot of all projects (incl. last contact + recent outreach). Use for judgment/cross-project questions ("who should I reach out to", "who's been contacted this week").
- get_submission_detail: the full record for ONE project incl. narrative fields. Use to go deep on a specific project ("tell me about X", "summarize X's pitch").
- search_submissions: free-text search across names + narrative. Use for thematic questions ("find projects doing RWAs", "who mentioned points").
- get_team_workload: how submissions split across owners. Use for "who has the most on their plate", "what is <owner> working on".
- get_token_data: LIVE onchain data (volume/market cap/price change) from the discover API for a project or contract address. Use for "what's X's volume right now" — note this is real-time vs. the cached snapshot, so say so.
- list_saved_panels: see what panels already exist (the user's + team-shared). Check this BEFORE build_panel so you don't duplicate an existing panel.
- get_score_config: the current scoring weights — use to explain why a project scored what it did.
- build_panel: create a chart/stat/table panel the user can pin to their dashboard. Use when they want to "make"/"add"/"pin" a panel.
- list_scheduled_jobs: see existing scheduled jobs + which job types and schedule presets are available.
- propose_edit: change an EXISTING project card from natural language ("update X's goals: add ...", "add the Partnerships flag to Y"). Additive edits (append/add) apply immediately; replace/remove or multi-field edits are queued for human review. ALWAYS state back what you changed (or queued) and on which project.
- ingest_project: take UNSTRUCTURED text (a pasted blurb, forwarded message, raw notes) and auto-convert it to CRM data — it extracts fields and creates a new card or updates a matching one. Use when the user dumps freeform project info rather than a precise edit. If it returns needsClarification, ASK the user before doing anything else.
- create_submission: create a NEW project card that doesn't exist yet ("create a project called X", "add a new submission for Y"). Only the project name is required — fill any fields you can extract, leave the rest blank. If the project already exists, this returns a duplicate notice: in that case use propose_edit on the existing card instead of creating a dupe.
- create_slack_report: schedule a recurring report to the user's Slack (e.g. "send my top reach-out candidates to Slack daily at 8am"). You pick the report sections; it delivers deterministically on schedule. Requires the user to have a Slack webhook set in Settings → Slack.
- create_scheduled_job: set up a recurring automated job. Use when the user asks to "schedule"/"automate"/"run X every …". IMPORTANT: before creating, confirm the job name, type, and schedule back to the user in plain language unless they were fully explicit. Call list_scheduled_jobs first if unsure what types exist.

Rules:
- Use tools rather than guessing. For any count or figure, call query_pipeline.
- For "who should I contact" type questions, call get_pipeline_summary, then reason over it (high score, not recently contacted, early stage, relevant needs) and recommend specific projects with a one-line reason each.
- After build_panel succeeds, tell the user it's ready to save to their dashboard and briefly what it shows.
- Be concise and scannable. You produce analysis and summaries, not audited reports.
- Your write capabilities are: creating new project cards (create_submission), editing existing cards (propose_edit), and creating scheduled jobs (create_scheduled_job). You still CANNOT send messages or contact anyone externally — that's a later phase. For edits: additive changes apply directly; anything destructive (replace/remove) is queued for human approval, never applied by you. For creation: check happens automatically for duplicates — never create over an existing project, edit it instead. Always confirm what you did.
- Never reveal or request founder PII, wallets, or contract addresses (not available to you anyway).`;

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e: any) {
    console.error("[agent] unhandled error:", e);
    return NextResponse.json({ error: e?.message ?? "assistant error", detail: String(e?.stack ?? e).slice(0, 500) }, { status: 500 });
  }
}

async function handle(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "analytics.use")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!llmConfigured()) {
    return NextResponse.json({ error: "The assistant isn't configured yet." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const history: ToolMessage[] = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
  const submissions = Array.isArray(body?.submissions) ? body.submissions : [];
  if (!history.length) return NextResponse.json({ error: "no messages" }, { status: 400 });

  const messages: ToolMessage[] = [{ role: "system", content: SYSTEM }, ...history];

  let builtPanel: AnalyticsSpec | null = null;
  const toolTrace: { name: string; args: any }[] = [];

  // Total time budget across all steps, kept well under the edge's 120s ceiling.
  const DEADLINE = Date.now() + 55_000;

  for (let step = 0; step < MAX_STEPS; step++) {
    const remaining = DEADLINE - Date.now();
    if (remaining < 6_000) {
      // Not enough time for another model round-trip — return what we have.
      return NextResponse.json({
        answer: builtPanel
          ? "Here's the panel I built — I ran out of time to add more."
          : "That took longer than expected — try a more specific request.",
        panelSpec: builtPanel,
        toolTrace,
        capped: true,
      });
    }
    // Give each model call at most the remaining budget (cap 30s).
    const res = await chatWithTools(messages, AGENT_TOOLS, { timeoutMs: Math.min(remaining, 30_000) });
    if (!res.ok) {
      return NextResponse.json({ error: res.error ?? "assistant unavailable" }, { status: 502 });
    }

    // No tool calls → final answer.
    if (!res.toolCalls || res.toolCalls.length === 0) {
      return NextResponse.json({
        answer: res.content ?? "",
        panelSpec: builtPanel,
        toolTrace,
      });
    }

    // Record the assistant turn that requested tools, then execute each.
    messages.push({ role: "assistant", content: res.content ?? null, tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* keep {} */ }
      toolTrace.push({ name: call.function.name, args });
      let exec: { result: string; panelSpec?: AnalyticsSpec | null };
      try {
        exec = await runTool(call.function.name, args, submissions, { userId: session.id, userEmail: session.email, role: session.role });
      } catch (e: any) {
        // A tool throwing must not 500 the whole request — feed the error back
        // to the model so it can recover or explain.
        exec = { result: JSON.stringify({ error: e?.message ?? "tool failed" }) };
      }
      if (exec.panelSpec) builtPanel = exec.panelSpec;
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: exec.result });
    }
    // loop: send tool results back for the model to continue
  }

  // Hit the step cap — return whatever we have.
  return NextResponse.json({
    answer: "I did a few steps but didn't fully wrap that up — try narrowing the question.",
    panelSpec: builtPanel,
    toolTrace,
    capped: true,
  });
}
