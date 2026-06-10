import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { runImport } from "@/lib/adapters";
import { SeedFileAdapter } from "@/lib/adapters/seedFile";
import { GoogleSheetsAdapter } from "@/lib/adapters/googleSheets";
import { PlainAdapter } from "@/lib/adapters/plain";

export const dynamic = "force-dynamic";

/**
 * Trigger an import. Body: { source?: "seed" | "google" | "plain" }.
 * Defaults to Google when configured, else the bundled seed file.
 * Every run is recorded in ImportLog (success or failure).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  const { source } = await req.json().catch(() => ({}));
  const which =
    source ||
    (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT ? "google" : "seed");

  try {
    const adapter =
      which === "google" ? new GoogleSheetsAdapter()
      : which === "plain" ? new PlainAdapter()
      : new SeedFileAdapter();
    const result = await runImport(adapter);
    await prisma.importLog.create({
      data: {
        source: which,
        pulled: result.pulled,
        created: result.created,
        updated: result.updated,
        ok: true,
        by: session.email,
      },
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const message = e?.message ?? "import failed";
    await prisma.importLog
      .create({ data: { source: which, ok: false, message, by: session.email } })
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
