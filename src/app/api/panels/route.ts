import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/access";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface PanelDTO {
  id: string;
  title: string;
  spec: unknown;
  isPublic: boolean;
  mine: boolean;
  ownerName: string;
  createdAt: string;
}

function toDTO(p: any, meId: string): PanelDTO {
  return {
    id: p.id,
    title: p.title,
    spec: p.spec,
    isPublic: p.isPublic,
    mine: p.ownerId === meId,
    ownerName: p.owner?.name || p.owner?.email || "Teammate",
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
  };
}

/**
 * GET: the panels visible to me — all of mine (public + private) plus everyone's
 * public ones. One-time migration: if I still have legacy panels in User.savedPanels
 * JSON and no rows yet, move them into the table so nothing is lost.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // One-time migration from the legacy JSON blob.
  const me = await prisma.user.findUnique({ where: { id: session.id }, select: { savedPanels: true } });
  const legacy = Array.isArray(me?.savedPanels) ? (me!.savedPanels as any[]) : [];
  if (legacy.length) {
    const existing = await prisma.sharedPanel.count({ where: { ownerId: session.id } });
    if (existing === 0) {
      for (const lp of legacy) {
        if (!lp?.spec) continue;
        await prisma.sharedPanel.create({
          data: {
            title: String(lp?.spec?.title || "Saved panel"),
            spec: lp.spec as unknown as Prisma.InputJsonValue,
            isPublic: false,
            ownerId: session.id,
          },
        });
      }
    }
    // Clear the legacy blob so migration runs only once.
    await prisma.user.update({ where: { id: session.id }, data: { savedPanels: Prisma.DbNull } });
  }

  const rows = await prisma.sharedPanel.findMany({
    where: { OR: [{ ownerId: session.id }, { isPublic: true }] },
    include: { owner: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(rows.map((r: any) => toDTO(r, session.id)));
}

/** POST: create a panel I own. Body: { spec, title?, isPublic? }. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "panels.create")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b?.spec || typeof b.spec !== "object") {
    return NextResponse.json({ error: "spec required" }, { status: 400 });
  }
  const title = String(b.title || b.spec?.title || "Saved panel").slice(0, 80);
  const row = await prisma.sharedPanel.create({
    data: {
      title,
      spec: b.spec as unknown as Prisma.InputJsonValue,
      isPublic: !!b.isPublic,
      ownerId: session.id,
    },
    include: { owner: { select: { name: true, email: true } } },
  });
  return NextResponse.json(toDTO(row, session.id), { status: 201 });
}
