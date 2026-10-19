import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import {
  PROVIDERS, availableProviders, getLlmConfig, invalidateLlmConfig, listModels, resolveModel, chatWithTools,
  type LlmConfig, type LlmTask, type ProviderId,
} from '@/lib/llm';

export const dynamic = 'force-dynamic';

const TASKS: LlmTask[] = ['agent', 'extract', 'report'];

/** Providers, the stored choice, what each task resolves to, and the chosen provider's models. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ready = availableProviders();
  const config = await getLlmConfig();
  const resolved = Object.fromEntries(await Promise.all(TASKS.map(async (t) => {
    const r = await resolveModel(t);
    return [t, r ? { provider: r.provider.id, model: r.model } : null];
  })));
  const listFor = (new URL(req.url).searchParams.get('provider') as ProviderId) || resolved.agent?.provider || ready[0];
  const models = listFor && ready.includes(listFor) ? await listModels(listFor) : [];
  return NextResponse.json({
    providers: (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({ id, label: PROVIDERS[id].label, ready: ready.includes(id), defaults: PROVIDERS[id].defaults })),
    config,
    resolved,
    models: { provider: listFor ?? null, list: models },
    canEdit: can(session.role, 'users.manage'),
  });
}

/** Save { provider, models: { agent, extract, report } }. Admins only. { test: true } pings the agent model. */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'users.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (body?.test) {
    const started = Date.now();
    const res = await chatWithTools([{ role: 'user', content: 'Reply with the single word: ready' }], [], { timeoutMs: 30_000 });
    return NextResponse.json({ ok: res.ok, reply: res.content?.slice(0, 80) ?? null, error: res.error ?? null, ms: Date.now() - started });
  }

  const provider = body?.provider as ProviderId | undefined;
  if (provider && !PROVIDERS[provider]) return NextResponse.json({ error: 'unknown provider' }, { status: 400 });
  const models: LlmConfig['models'] = {};
  for (const t of TASKS) {
    const m = body?.models?.[t];
    if (typeof m === 'string' && m.trim()) models[t] = m.trim().slice(0, 120);
  }
  const llmConfig: LlmConfig = { ...(provider ? { provider } : {}), models };
  await prisma.appConfig.upsert({
    where: { id: 'default' },
    update: { llmConfig: llmConfig as Prisma.InputJsonValue, updatedBy: session.email },
    create: { id: 'default', llmConfig: llmConfig as Prisma.InputJsonValue, updatedBy: session.email },
  });
  invalidateLlmConfig();
  return NextResponse.json({ ok: true, config: llmConfig });
}
