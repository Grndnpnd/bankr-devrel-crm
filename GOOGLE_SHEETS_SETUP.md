# Live Google Sheets ingestion — setup

The CRM pulls intake directly from your Google Form's responses sheet via a Google
Cloud **service account** (server-to-server; no per-user OAuth). One-time setup:

## 1. Create a service account
1. Go to https://console.cloud.google.com → create or pick a project.
2. APIs & Services → **Enable APIs** → enable **Google Sheets API**.
3. APIs & Services → Credentials → **Create credentials → Service account**.
   Name it e.g. `bankr-crm-importer`. No roles needed. Create.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads. Keep it secret.

## 2. Share the responses sheet with it
1. Open your Form → Responses → **link to Sheets** (creates the responses spreadsheet).
2. In that spreadsheet: **Share** → paste the service account's email
   (looks like `bankr-crm-importer@<project>.iam.gserviceaccount.com`) → **Viewer** → Send.

## 3. Configure env
In `.env` (and in Railway/Neon env later) set:

```
# The whole downloaded JSON, as a single-line string (escape newlines in the private key
# as \n, which the JSON already does). Easiest: paste the file's contents verbatim.
GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"bankr-crm-importer@....iam.gserviceaccount.com", ...}

# From the sheet URL: docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit
GOOGLE_SHEET_ID=1AbC...

# The response tab name. Google Forms default is "Form Responses 1".
GOOGLE_SHEET_RANGE=Form Responses 1
```

Tip: on Windows PowerShell, putting raw JSON in `.env` is fine — keep it on one line,
wrapped in nothing (no surrounding quotes needed for dotenv) or single quotes.

## 4. Use it
Once `GOOGLE_SERVICE_ACCOUNT` + `GOOGLE_SHEET_ID` are set, the **Import** button
(top bar, admin only) pulls from the live sheet automatically — locally and in prod.
Without them set, Import falls back to the bundled seed file.

You can also trigger explicitly:
```
POST /api/import           # auto: google if configured, else seed
POST /api/import {"source":"google"}   # force google
POST /api/import {"source":"seed"}     # force seed file
```

## How dedup / re-import works
- Each submission's identity = **project name + founder-1 email** (hashed). This is
  stable across re-imports and identical between the seed file and the live sheet,
  so re-importing **updates** existing rows rather than duplicating them.
- Re-import **refreshes** intake fields + score but **preserves** workflow state you've
  set: `stage`, `owner`, and logged outreach activity.
- The Form has no token/fees columns (those come from a separate onchain match). On
  import, if a row has no token, the importer **keeps any existing onchain data** when
  scoring, so a form re-import never tanks an already-matched project's score.

## Notes
- The importer reads the header row and maps by exact question text, with tolerance for
  whitespace/case drift. If you materially reword a Form question, update `FORM_COLS`
  in `src/lib/normalize.ts`.
- `googleapis` is an optional dependency; if it isn't installed the adapter throws a
  clear error and you can keep using the seed file.
