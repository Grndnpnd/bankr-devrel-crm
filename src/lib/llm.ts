/**
 * Bankr LLM Gateway client (OpenAI-compatible). Server-side only — the key never
 * reaches the browser. One function: chatJSON() asks for a JSON object back.
 */
const BASE = process.env.BANKR_LLM_BASE_URL || 'https://llm.bankr.bot';
const KEY = process.env.BANKR_LLM_KEY;
const MODEL = process.env.BANKR_LLM_MODEL || 'gemini-2.5-flash';

export const llmConfigured = (): boolean => !!KEY;

export interface ChatResult {
  ok: boolean;
  content?: string;
  error?: string;
  status?: number;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

/** Multi-turn chat completion. Returns the assistant's text content. */
export async function chatMessages(messages: ChatMessage[], opts?: { temperature?: number }): Promise<ChatResult> {
  if (!KEY) return { ok: false, error: 'LLM gateway not configured' };
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
      body: JSON.stringify({ model: MODEL, messages, temperature: opts?.temperature ?? 0.3 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 402 ? 'LLM credits exhausted — top up at bankr.bot/llm'
        : res.status === 401 ? 'LLM key rejected'
        : `gateway error ${res.status}`;
      return { ok: false, status: res.status, error: `${hint}${body ? `: ${body.slice(0, 160)}` : ''}` };
    }
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, error: 'empty response from gateway' };
    return { ok: true, content };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'request failed' };
  }
}

/** Single-shot chat completion. Returns the assistant's text content. */
export async function chat(system: string, user: string): Promise<ChatResult> {
  if (!KEY) return { ok: false, error: 'LLM gateway not configured' };
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 402 ? 'LLM credits exhausted — top up at bankr.bot/llm'
        : res.status === 401 ? 'LLM key rejected'
        : `gateway error ${res.status}`;
      return { ok: false, status: res.status, error: `${hint}${body ? `: ${body.slice(0, 160)}` : ''}` };
    }
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, error: 'empty response from gateway' };
    return { ok: true, content };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'request failed' };
  }
}

/** Extract the first JSON object from a model response (handles ```json fences and prose). */
export function extractJson(text: string): any | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Find the outermost {...}
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}
