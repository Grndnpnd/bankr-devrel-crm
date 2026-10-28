import { PrismaClient } from "@prisma/client";

/**
 * Beta records synced to Notion carry a notionDirty flag. Any write that touches a synced field
 * sets it, so the Notion push picks the record up; bookkeeping fields (last seen, Plain state,
 * the Notion fields themselves) don't. The Notion puller writes notionDirty: false explicitly.
 */
const NOT_SYNCED: Record<string, Set<string>> = {
  tester: new Set(["lastSeenAt", "accessHash", "emailVerifiedAt", "answers", "platform", "contact"]),
  testerReport: new Set(["testerSeenAt", "taskId", "plainThreadId", "plainSyncedAt", "plainError", "plainTries"]),
  betaOutreach: new Set([]),
  betaPayout: new Set([]),
  betaCall: new Set([]),
};
const BOOKKEEPING = new Set(["notionPageId", "notionEditedAt", "notionDirty", "notionError", "notionSnapshot", "updatedAt"]);

function markDirty(model: string, data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const d = data as Record<string, unknown>;
  if (d.notionDirty !== undefined) return;
  const skip = NOT_SYNCED[model];
  if (Object.keys(d).some((k) => !BOOKKEEPING.has(k) && !skip.has(k))) d.notionDirty = true;
}

function makeClient() {
  const base = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
  const hooks = (model: string) => ({
    async create({ args, query }: any) { markDirty(model, args.data); return query(args); },
    async update({ args, query }: any) { markDirty(model, args.data); return query(args); },
    async updateMany({ args, query }: any) { markDirty(model, args.data); return query(args); },
    async upsert({ args, query }: any) { markDirty(model, args.create); markDirty(model, args.update); return query(args); },
  });
  return base.$extends({
    query: {
      tester: hooks("tester"),
      testerReport: hooks("testerReport"),
      betaOutreach: hooks("betaOutreach"),
      betaPayout: hooks("betaPayout"),
      betaCall: hooks("betaCall"),
    },
  });
}

type Client = ReturnType<typeof makeClient>;
const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
