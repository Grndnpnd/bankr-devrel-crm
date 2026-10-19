/**
 * LLM client. Server-side only — keys never reach the browser.
 *
 * Every provider speaks the OpenAI chat-completions shape, so one request path
 * serves them all:
 *   - ollama  Ollama Cloud (https://ollama.com/v1, Bearer OLLAMA_API_KEY), or a
 *             local Ollama when OLLAMA_BASE_URL=http://localhost:11434/v1
 *   - bankr   the Bankr LLM gateway (X-API-Key BANKR_LLM_KEY)
 *   - openai  any other OpenAI-compatible endpoint (OPENAI_BASE_URL + OPENAI_API_KEY)
 *
 * Each call names a task (agent / extract / report). The model per task comes from
 * Settings → Models (AppConfig.llmConfig), falling back to env, then to defaults.
 */
import { prisma } from '@/lib/prisma';

export type ProviderId = 'ollama' | 'bankr' | 'openai';
export type LlmTask = 'agent' | 'extract' | 'report';

interface ProviderDef {
  id: ProviderId;
  label: string;
  base: () => string | undefined;
  key: () => string | undefined;
  headers: (key: string) => Record<string, string>;
  /** Supports response_format: { type: 'json_object' }. */
  jsonMode: boolean;
  defaults: Record<LlmTask, string>;
}

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  ollama: {
    id: 'ollama',
    label: 'Ollama Cloud',
    base: () => process.env.OLLAMA_BASE_URL || 'https://ollama.com/v1',
    // A local Ollama needs no key; Ollama Cloud does.
    key: () => process.env.OLLAMA_API_KEY || (process.env.OLLAMA_BASE_URL ? 'ollama' : undefined),
    headers: bearer,
    jsonMode: true,
    // gpt-oss holds strict JSON reliably; glm-5.x has failed it under long rule prompts.
    defaults: { agent: 'kimi-k3', extract: 'gpt-oss:120b', report: 'kimi-k3' },
  },
  bankr: {
    id: 'bankr',
    label: 'Bankr LLM Gateway',
    base: () => `${process.env.BANKR_LLM_BASE_URL || 'https://llm.bankr.bot'}/v1`,
    key: () => process.env.BANKR_LLM_KEY,
    headers: (key) => ({ 'X-API-Key': key }),
    jsonMode: false,
    defaults: {
      agent: process.env.BANKR_LLM_MODEL || 'claude-haiku-4.5',
      extract: process.env.BANKR_LLM_MODEL || 'claude-haiku-4.5',
      report: process.env.BANKR_LLM_MODEL || 'claude-haiku-4.5',
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible',
    base: () => process.env.OPENAI_BASE_URL,
    key: () => process.env.OPENAI_API_KEY,
    headers: bearer,
    jsonMode: true,
    defaults: {
      agent: process.env.OPENAI_MODEL || '',
      extract: process.env.OPENAI_MODEL || '',
      report: process.env.OPENAI_MODEL || '',
    },
  },
};

const PROVIDER_ORDER: ProviderId[] = ['ollama', 'bankr', 'openai'];

export const providerReady = (p: ProviderDef) => !!(p.base() && p.key());

/** The providers that have credentials in this environment. */
export const availableProviders = (): ProviderId[] => PROVIDER_ORDER.filter((id) => providerReady(PROVIDERS[id]));

export const llmConfigured = (): boolean => availableProviders().length > 0;

/** Stored in AppConfig.llmConfig. Every field optional; blanks fall back. */
export interface LlmConfig {
  provider?: ProviderId;
  models?: Partial<Record<LlmTask, string>>;
}

let cached: { at: number; value: LlmConfig } | null = null;
const CONFIG_TTL_MS = 30_000;

export async function getLlmConfig(): Promise<LlmConfig> {
  if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.value;
  let value: LlmConfig = {};
  try {
    const row = await prisma.appConfig.findUnique({ where: { id: 'default' }, select: { llmConfig: true } });
    value = (row?.llmConfig as LlmConfig | null) ?? {};
  } catch { /* table not migrated yet, or DB down — env defaults still work */ }
  cached = { at: Date.now(), value };
  return value;
}

export function invalidateLlmConfig() { cached = null; }

export interface Resolved { provider: ProviderDef; model: string }

/** Which provider and model a task runs on right now. */
export async function resolveModel(task: LlmTask, override?: string): Promise<Resolved | null> {
  const cfg = await getLlmConfig();
  const ready = availableProviders();
  const envProvider = process.env.LLM_PROVIDER as ProviderId | undefined;
  const pick = [cfg.provider, envProvider, ...ready].find((p): p is ProviderId => !!p && ready.includes(p as ProviderId));
  if (!pick) return null;
  const provider = PROVIDERS[pick];
  const envModel = process.env[`LLM_MODEL_${task.toUpperCase()}`] || process.env.LLM_MODEL;
  // A stored model only applies to the provider it was chosen for.
  const stored = cfg.provider === pick ? cfg.models?.[task] : undefined;
  const model = override || stored || envModel || provider.defaults[task];
  if (!model) return null;
  return { provider, model };
}

/** Models a provider offers (its /models list). */
export async function listModels(id: ProviderId): Promise<string[]> {
  const p = PROVIDERS[id];
  const base = p.base(); const key = p.key();
  if (!base || !key) return [];
  try {
    const res = await fetch(`${base}/models`, { headers: p.headers(key), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data ?? []).map((m: any) => String(m.id)).sort();
  } catch {
    return [];
  }
}

export interface ChatResult {
  ok: boolean;
  content?: string;
  error?: string;
  status?: number;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

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

interface CompletionOpts {
  task: LlmTask;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  tools?: ToolDef[];
  json?: boolean;
}

async function complete(messages: ToolMessage[] | ChatMessage[], opts: CompletionOpts): Promise<ToolChatResult> {
  const resolved = await resolveModel(opts.task, opts.model);
  if (!resolved) return { ok: false, error: 'LLM not configured — set a provider key (OLLAMA_API_KEY, BANKR_LLM_KEY or OPENAI_API_KEY)' };
  const { provider, model } = resolved;
  const key = provider.key()!;
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? 0.2 };
    if (opts.tools?.length) { body.tools = opts.tools; body.tool_choice = 'auto'; }
    if (opts.json && provider.jsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(`${provider.base()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...provider.headers(key) },
      signal: ctl.signal,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const hint = res.status === 402 ? `${provider.label}: credits exhausted`
        : res.status === 401 || res.status === 403 ? `${provider.label}: key rejected`
        : res.status === 404 ? `${provider.label}: model "${model}" not found`
        : res.status === 429 ? `${provider.label}: rate limited`
        : `${provider.label} error ${res.status}`;
      return { ok: false, status: res.status, error: `${hint}${text ? `: ${text.slice(0, 200)}` : ''}` };
    }
    const data = await res.json().catch(() => null);
    const choice = data?.choices?.[0];
    if (!choice) return { ok: false, error: `empty response from ${provider.label}` };
    return {
      ok: true,
      content: choice.message?.content ?? null,
      toolCalls: choice.message?.tool_calls?.length ? choice.message.tool_calls : undefined,
      finishReason: choice.finish_reason,
    };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: 'the model took too long to respond' };
    return { ok: false, error: e?.message ?? 'request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

function asText(r: ToolChatResult): ChatResult {
  if (!r.ok) return { ok: false, error: r.error, status: r.status };
  if (typeof r.content !== 'string') return { ok: false, error: 'empty response from model' };
  return { ok: true, content: r.content };
}

/** Multi-turn chat completion. Returns the assistant's text content. */
export async function chatMessages(messages: ChatMessage[], opts?: { temperature?: number; task?: LlmTask }): Promise<ChatResult> {
  return asText(await complete(messages, { task: opts?.task ?? 'report', temperature: opts?.temperature ?? 0.3 }));
}

/** Single-shot structured extraction. Asks for a JSON object where the provider supports it. */
export async function chat(system: string, user: string): Promise<ChatResult> {
  return asText(await complete(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    { task: 'extract', temperature: 0, json: true },
  ));
}

/** Chat completion with tools. Returns either tool calls (to execute) or a final answer. */
export async function chatWithTools(messages: ToolMessage[], tools: ToolDef[], opts?: { temperature?: number; model?: string; timeoutMs?: number }): Promise<ToolChatResult> {
  return complete(messages, { task: 'agent', tools, model: opts?.model, temperature: opts?.temperature, timeoutMs: opts?.timeoutMs });
}

/** Extract the first JSON object from a model response (handles ```json fences and prose). */
export function extractJson(text: string): any | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}
