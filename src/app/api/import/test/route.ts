import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Test the Google Sheets connection: authenticate and read the header row. Admin only. */
export async function POST() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }
  const creds = process.env.GOOGLE_SERVICE_ACCOUNT;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Form Responses 1";
  if (!creds || !sheetId) {
    return NextResponse.json({ ok: false, error: "Google Sheets not configured (missing env vars)." }, { status: 400 });
  }
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(creds),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
    const rows = (res.data.values?.length ?? 0);
    const dataRows = Math.max(0, rows - 1); // minus header
    return NextResponse.json({ ok: true, rows: dataRows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "connection failed" }, { status: 200 });
  }
}
