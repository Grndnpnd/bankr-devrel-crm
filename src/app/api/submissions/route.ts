import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { serialize, INCLUDE } from "@/lib/serialize";
import { stableExternalId, handle } from "@/lib/normalize";
import { score } from "@/lib/scoring";
import { getWeights } from "@/lib/scoreConfig";
import type { CanonicalSubmission } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.submission.findMany({
    include: INCLUDE,
    orderBy: { score: "desc" },
  });
  return NextResponse.json(rows.map(serialize));
}


const TEXT_FIELDS = [
  "oneLiner", "problem", "solution", "traction", "funding",
  "plan", "whyBankr", "accomplishments", "links", "notesField",
] as const;

/** Create a manual submission (admin/devrel). Body: { project, founderName, founderEmail?, founderX?, projectX?, website?, location?, needsHelp?: string[], ...text fields }. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role === "VIEWER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const project = String(b.project ?? "").trim();
  const founderName = String(b.founderName ?? "").trim();
  if (!project || !founderName) {
    return NextResponse.json({ error: "project and founderName are required" }, { status: 400 });
  }
  const founderEmail = String(b.founderEmail ?? "").trim().toLowerCase();
  const founderX = handle(b.founderX ?? "");
  const founders = [{ name: founderName, x: founderX, email: founderEmail }];
  const needsHelp: string[] = Array.isArray(b.needsHelp)
    ? b.needsHelp.map((t: unknown) => String(t).trim()).filter(Boolean)
    : [];

  const canonical = {
    project,
    projectX: handle(b.projectX ?? ""),
    website: String(b.website ?? "").trim(),
    location: String(b.location ?? "").trim(),
    oneLiner: String(b.oneLiner ?? "").trim(),
    problem: String(b.problem ?? "").trim(),
    solution: String(b.solution ?? "").trim(),
    traction: String(b.traction ?? "").trim(),
    funding: String(b.funding ?? "").trim(),
    plan: String(b.plan ?? "").trim(),
    whyBankr: String(b.whyBankr ?? "").trim(),
    accomplishments: String(b.accomplishments ?? "").trim(),
    links: String(b.links ?? "").trim(),
    notesField: String(b.notesField ?? "").trim(),
    token: null, fees24h: null, vol24h: null,
  } as unknown as CanonicalSubmission;

  const { score: sc, breakdown } = score(canonical, await getWeights());
  const externalId = stableExternalId(project, founderEmail || founderX || founderName);

  const existing = await prisma.submission.findFirst({ where: { externalId } });
  if (existing) {
    return NextResponse.json({ error: "A submission for this project + founder already exists." }, { status: 409 });
  }

  const row = await prisma.submission.create({
    data: {
      source: "MANUAL",
      externalId,
      submittedAt: new Date(),
      project,
      projectX: canonical.projectX || null,
      website: canonical.website || null,
      location: canonical.location || null,
      oneLiner: canonical.oneLiner || null,
      problem: canonical.problem || null,
      solution: canonical.solution || null,
      traction: canonical.traction || null,
      funding: canonical.funding || null,
      plan: canonical.plan || null,
      whyBankr: canonical.whyBankr || null,
      accomplishments: canonical.accomplishments || null,
      links: canonical.links || null,
      notesField: canonical.notesField || null,
      needsHelp,
      founders: founders as unknown as Prisma.InputJsonValue,
      score: sc,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      lowEffort: false,
    },
    include: INCLUDE,
  });
  return NextResponse.json(serialize(row), { status: 201 });
}
