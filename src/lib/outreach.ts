import { prisma } from "@/lib/prisma";

/**
 * Typed outreach history. Core types are a fixed code list; custom types persist on
 * AppConfig so once someone adds "Hackathon" it's reusable everywhere. Used by the
 * card UI, the agent (log_outreach tool), and the Telegram bot.
 */

export interface OutreachType { key: string; label: string; core?: boolean }

export const CORE_OUTREACH_TYPES: OutreachType[] = [
  { key: "reddit_post",    label: "Reddit Post",         core: true },
  { key: "co_marketing",   label: "Co-marketing",        core: true },
  { key: "pr",             label: "Press Release",       core: true },
  { key: "agent_hours",    label: "Agent Hours",         core: true },
  { key: "telegram_group", label: "Telegram Group Chat", core: true },
];

/** Slugify a custom label into a stable key. */
export function slugifyType(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "custom";
}

/** All available types = core + persisted custom (deduped by key). */
export async function listOutreachTypes(): Promise<OutreachType[]> {
  let custom: OutreachType[] = [];
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: "default" } });
    const raw = (cfg as any)?.customOutreachTypes;
    if (Array.isArray(raw)) {
      custom = raw
        .filter((t: any) => t && typeof t.key === "string" && typeof t.label === "string")
        .map((t: any) => ({ key: t.key, label: t.label }));
    }
  } catch { /* fall back to core only */ }
  const seen = new Set(CORE_OUTREACH_TYPES.map((t) => t.key));
  const merged = [...CORE_OUTREACH_TYPES];
  for (const c of custom) if (!seen.has(c.key)) { merged.push(c); seen.add(c.key); }
  return merged;
}

/** Add a custom type (idempotent on key). Returns the type. */
export async function addCustomOutreachType(label: string): Promise<OutreachType> {
  const clean = label.trim().slice(0, 60);
  const key = slugifyType(clean);
  if (CORE_OUTREACH_TYPES.some((t) => t.key === key)) {
    return CORE_OUTREACH_TYPES.find((t) => t.key === key)!;
  }
  const cfg = await prisma.appConfig.findUnique({ where: { id: "default" } });
  const raw = ((cfg as any)?.customOutreachTypes as any[]) || [];
  const existing = Array.isArray(raw) ? raw.filter((t) => t && typeof t.key === "string") : [];
  if (!existing.some((t: any) => t.key === key)) {
    existing.push({ key, label: clean });
    await prisma.appConfig.upsert({
      where: { id: "default" },
      update: { customOutreachTypes: existing as any },
      create: { id: "default", customOutreachTypes: existing as any },
    });
  }
  return { key, label: clean };
}

/** Resolve a free-text type (label or key) to a known key, creating a custom type if new. */
export async function resolveOutreachType(input: string): Promise<OutreachType> {
  const raw = input.trim();
  const all = await listOutreachTypes();
  const lc = raw.toLowerCase();
  const byKey = all.find((t) => t.key === lc.replace(/[^a-z0-9]+/g, "_"));
  if (byKey) return byKey;
  const byLabel = all.find((t) => t.label.toLowerCase() === lc);
  if (byLabel) return byLabel;
  // unknown → create a custom type
  return addCustomOutreachType(raw);
}

export interface LogOutreachArgs {
  submissionId: string;
  type: string;        // label or key; resolved (and persisted if custom)
  detail?: string | null;
  occurredAt?: Date;
  createdBy?: string;
}

export async function logOutreach(args: LogOutreachArgs): Promise<{ ok: true; id: string; type: OutreachType } | { ok: false; error: string }> {
  const sub = await prisma.submission.findUnique({ where: { id: args.submissionId }, select: { id: true } });
  if (!sub) return { ok: false, error: "submission not found" };
  const t = await resolveOutreachType(args.type);
  const row = await prisma.outreachLog.create({
    data: {
      submissionId: sub.id,
      type: t.key,
      detail: args.detail?.trim() || null,
      occurredAt: args.occurredAt ?? new Date(),
      createdBy: args.createdBy ?? "agent",
    },
  });
  return { ok: true, id: row.id, type: t };
}

/** The label for a stored type key (falls back to a humanized key). */
export function labelForType(key: string, types: OutreachType[]): string {
  const found = types.find((t) => t.key === key);
  if (found) return found.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
