import type { SourceAdapter } from "./index";
import type { CanonicalSubmission } from "../types";
import { normalizeFormRow } from "../normalize";

/**
 * Reads the live Google Form responses sheet via a service account and normalizes
 * each row. Keeps Google Forms as the source of truth.
 *
 * Setup:
 *   1. Create a GCP service account, enable the Google Sheets API.
 *   2. Share the responses sheet with the service-account email (viewer).
 *   3. Set env: GOOGLE_SERVICE_ACCOUNT (JSON), GOOGLE_SHEET_ID, GOOGLE_SHEET_RANGE.
 *
 * Requires the `googleapis` package (listed optional in package.json). If creds are
 * absent this adapter throws a clear error — use the SeedFileAdapter for local dev.
 */
export class GoogleSheetsAdapter implements SourceAdapter {
  source = "GOOGLE_FORM" as const;

  constructor(
    private sheetId = process.env.GOOGLE_SHEET_ID,
    private range = process.env.GOOGLE_SHEET_RANGE || "Form Responses 1",
    private creds = process.env.GOOGLE_SERVICE_ACCOUNT
  ) {}

  async fetch(): Promise<CanonicalSubmission[]> {
    if (!this.creds || !this.sheetId) {
      throw new Error(
        "GoogleSheetsAdapter not configured. Set GOOGLE_SERVICE_ACCOUNT + GOOGLE_SHEET_ID, " +
          "or use the SeedFileAdapter for local development."
      );
    }
    // Lazy import so local dev without the dep still type-checks/builds.
    const { google } = await import("googleapis");
    const credentials = JSON.parse(this.creds);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: this.range,
    });

    const values = res.data.values || [];
    if (values.length < 2) return [];
    const headers = values[0].map(String);
    return values.slice(1).map((arr) => {
      const row: Record<string, unknown> = {};
      headers.forEach((h, i) => (row[h] = arr[i] ?? ""));
      return normalizeFormRow(row, "GOOGLE_FORM");
    });
  }
}
