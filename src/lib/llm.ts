/**
 * Bankr LLM Gateway client (OpenAI-compatible). Server-side only — the key never
 * reaches the browser. One function: chatJSON() asks for a JSON object back.
 */
const BASE = process.env.BANKR_LLM_BASE_URL || 'https://llm.bankr.bot';
const KEY = process.env.BANKR_LLM_KEY;
const MODEL = process.env.BANKR_LLM_MODEL || 'claude-haiku-4.5';

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

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: any };
}
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface ToolMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}
export interface ToolChatResult {
  ok: boolean;
  content?: string | null;
  toolCalls?: ToolCall[];
  finishReason?: string;
  error?: string;
  status?: number;
}

/** Chat completion with tools. Returns either tool calls (to execute) or a final answer. */
export async function chatWithTools(messages: ToolMessage[], tools: ToolDef[], opts?: { temperature?: number; model?: string; timeoutMs?: number }): Promise<ToolChatResult> {
  if (!KEY) return { ok: false, error: 'LLM gateway not configured' };
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), opts?.timeoutMs ?? 30_000);
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
      signal: ctl.signal,
      body: JSON.stringify({
        model: opts?.model || MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: opts?.temperature ?? 0.2,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const hint = res.status === 402 ? 'LLM credits exhausted — top up at bankr.bot/llm'
        : res.status === 401 ? 'LLM key rejected'
        : `gateway error ${res.status}`;
      return { ok: false, status: res.status, error: `${hint}${body ? `: ${body.slice(0, 200)}` : ''}` };
    }
    const data = await res.json().catch(() => null);
    const choice = data?.choices?.[0];
    if (!choice) return { ok: false, error: 'empty response from gateway' };
    return {
      ok: true,
      content: choice.message?.content ?? null,
      toolCalls: choice.message?.tool_calls ?? undefined,
      finishReason: choice.finish_reason,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: 'the model took too long to respond' };
    return { ok: false, error: e?.message ?? 'request failed' };
  } finally {
    clearTimeout(timeout);
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
