import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** PATCH: update a panel I own. Body: { isPublic?, title? }. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const panel = await prisma.sharedPanel.findUnique({ where: { id: params.id } });
  if (!panel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (panel.ownerId !== session.id) return NextResponse.json({ error: "not your panel" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("isPublic" in b) data.isPublic = !!b.isPublic;
  if ("title" in b && b.title) data.title = String(b.title).slice(0, 80);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = await prisma.sharedPanel.update({
    where: { id: params.id },
    data,
    include: { owner: { select: { name: true, email: true } } },
  });
  return NextResponse.json({
    id: updated.id, title: updated.title, spec: updated.spec, isPublic: updated.isPublic,
    mine: true, ownerName: updated.owner?.name || updated.owner?.email || "Teammate",
    createdAt: updated.createdAt.toISOString(),
  });
}

/** DELETE: remove a panel I own. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const panel = await prisma.sharedPanel.findUnique({ where: { id: params.id } });
  if (!panel) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (panel.ownerId !== session.id) return NextResponse.json({ error: "not your panel" }, { status: 403 });
  await prisma.sharedPanel.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
