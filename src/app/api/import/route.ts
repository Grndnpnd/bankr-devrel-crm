import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runImport } from "@/lib/adapters";
import { SeedFileAdapter } from "@/lib/adapters/seedFile";
import { GoogleSheetsAdapter } from "@/lib/adapters/googleSheets";
import { PlainAdapter } from "@/lib/adapters/plain";

export const dynamic = "force-dynamic";

/**
 * Trigger an import. Body: { source: "seed" | "google" | "plain" }.
 * Defaults to "google" in production, "seed" otherwise.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  const { source } = await req.json().catch(() => ({}));
  // Prefer the live Google Sheet whenever it's configured (works in local dev too);
  // otherwise fall back to the bundled seed file. An explicit `source` always wins.
  const which = source || (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT ? "google" : "seed");

  try {
    const adapter =
      which === "google" ? new GoogleSheetsAdapter()
      : which === "plain" ? new PlainAdapter()
      : new SeedFileAdapter();
    const result = await runImport(adapter);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "import failed" }, { status: 500 });
  }
}
