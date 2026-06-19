import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { can, effectiveMatrix, defaultMatrix, CAPABILITY_META, ROLES, ROLE_LABELS, type Capability, type Role } from "@/lib/access";
import { reloadCapabilityOverrides } from "@/lib/capabilityOverrides";

export const dynamic = "force-dynamic";

/** Read the current effective matrix + metadata for the Admin permissions editor. */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.role, "users.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    matrix: effectiveMatrix(),
    defaults: defaultMatrix(),
    capabilities: CAPABILITY_META,
    roles: ROLES,
    roleLabels: ROLE_LABELS,
  });
}

/**
 * Save an edited matrix. Body: { matrix: Record<Capability, Role[]> }.
 * ADMIN is force-included in every capability server-side (hard-lock), so an
 * admin can never revoke their own access and lock everyone out.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "users.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const input = body?.matrix;
  if (!input || typeof input !== "object") {
    return NextResponse.json({ error: "matrix required" }, { status: 400 });
  }

  // Sanitize: only known capabilities, only known roles, ADMIN always present.
  const clean: Partial<Record<Capability, Role[]>> = {};
  for (const meta of CAPABILITY_META) {
    const cap = meta.key;
    const raw = Array.isArray(input[cap]) ? input[cap] : [];
    const roles = (raw as string[]).filter((r): r is Role => (ROLES as string[]).includes(r));
    const withAdmin = roles.includes("ADMIN") ? roles : (["ADMIN", ...roles] as Role[]);
    clean[cap] = Array.from(new Set(withAdmin)) as Role[];
  }

  await prisma.appConfig.upsert({
    where: { id: "default" },
    update: { capabilityOverrides: clean as unknown as Prisma.InputJsonValue, updatedBy: session.email },
    create: { id: "default", capabilityOverrides: clean as unknown as Prisma.InputJsonValue, updatedBy: session.email },
  });

  // Apply immediately so the next request (and this admin) sees the change.
  await reloadCapabilityOverrides();

  return NextResponse.json({ ok: true, matrix: effectiveMatrix() });
}

/** Reset to code defaults (clear overrides). */
export async function DELETE() {
  const session = await getSession();
  if (!session || !can(session.role, "users.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.appConfig.upsert({
    where: { id: "default" },
    update: { capabilityOverrides: Prisma.DbNull, updatedBy: session.email },
    create: { id: "default", capabilityOverrides: Prisma.DbNull, updatedBy: session.email },
  });
  await reloadCapabilityOverrides();
  return NextResponse.json({ ok: true, matrix: effectiveMatrix() });
}
