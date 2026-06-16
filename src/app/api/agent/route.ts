import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
- build_panel: create a chart/stat/table panel the user can pin to their dashboard. Use when they want to "make"/"add"/"pin" a panel.

Rules:
- Use tools rather than guessing. For any count or figure, call query_pipeline.
- For "who should I contact" type questions, call get_pipeline_summary, then reason over it (high score, not recently contacted, early stage, relevant needs) and recommend specific projects with a one-line reason each.
- After build_panel succeeds, tell the user it's ready to save to their dashboard and briefly what it shows.
- Be concise and scannable. You produce analysis and summaries, not audited reports.
- You are READ-ONLY: you cannot send messages, change records, or contact anyone. If asked, say that's coming in a later phase.
- Never reveal or request founder PII, wallets, or contract addresses (not available to you anyway).`;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
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

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await chatWithTools(messages, AGENT_TOOLS);
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
      const exec = await runTool(call.function.name, args, submissions);
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
