import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { llmConfigured, type ToolMessage } from "@/lib/llm";
import { agentRun } from "@/lib/agentRun";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

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

  const result = await agentRun({
    history,
    submissions,
    ctx: { userId: session.id, userEmail: session.email, role: session.role },
    budgetMs: 170_000,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({
    answer: result.answer,
    panelSpec: result.panelSpec,
    toolTrace: result.toolTrace,
    ...(result.capped ? { capped: true } : {}),
  });
}
