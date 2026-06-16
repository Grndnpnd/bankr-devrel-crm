import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatMessages, llmConfigured, type ChatMessage } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const SYSTEM = `You are an analyst embedded in the Bankr DevRel CRM. You answer questions about a pipeline of crypto project submissions, grounded ONLY in the data rows provided in the user's message. Today's date is provided; use it for "this week / recently" questions.

Rules:
- Answer from the provided rows only. Never invent projects, names, numbers, or dates. If the data doesn't support an answer, say so plainly.
- Ground claims in specifics from the data: name the projects, cite their score, stage, owner, last_contact, or volume as relevant.
- For "who should I reach out to" style questions, reason over the candidates (high score, not recently contacted, early stage, relevant needs) and recommend specific projects with a one-line reason each. Be decisive but explain briefly.
- For outreach questions ("who has X contacted"), use recent_outreach (each item: type, by, date) and last_contact. Count only what's in the data.
- Keep answers tight and scannable. Use a short intro line, then a compact list when listing projects. No filler.
- You produce judgment and summaries, not audited figures — if a precise count matters, note it's based on the current data shown.
- Never reveal founder personal info, wallets, or contract addresses (they are not in your data anyway).`;

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
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history.slice(-6) : [];
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!question) return NextResponse.json({ error: "ask a question" }, { status: 400 });
  if (question.length > 800) return NextResponse.json({ error: "question too long" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const dataMessage =
    `Today is ${today}. Here are the current pipeline rows (JSON):\n` +
    JSON.stringify(rows) +
    `\n\nQuestion: ${question}`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    ...history.filter((m) => m.role === "user" || m.role === "assistant"),
    { role: "user", content: dataMessage },
  ];

  const result = await chatMessages(messages, { temperature: 0.3 });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "assistant unavailable" }, { status: 502 });
  }
  return NextResponse.json({ answer: result.content });
}
