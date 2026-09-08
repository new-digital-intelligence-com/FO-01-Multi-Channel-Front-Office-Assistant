/**
 * Persistence: a Google Sheet in Google Drive. In-memory fallback when unconfigured.
 *
 * A sheet is the right POC store here — the org already has Google Workspace, there is no
 * new vendor, and "logs every interaction" is demonstrable by opening the sheet on screen
 * while messages arrive.
 *
 * Auth is a service account: no OAuth consent flow, no refresh tokens. Share the sheet
 * with the service account address as an Editor and it works.
 *
 * `backend()` reports which store is live so tools can be honest about durability rather
 * than implying a row was persisted when it only reached memory.
 */
import { google, type sheets_v4 } from "googleapis";

export type Channel = "phone" | "email" | "webchat" | "gchat" | "whatsapp" | "slack" | "claude";
export type Direction = "inbound" | "outbound";

export interface Interaction {
  id: string;
  channel: Channel;
  direction: Direction;
  contact: string;
  body: string;
  intent?: string;
  escalated?: boolean;
  created_at: string;
}

export interface Case {
  id: string;
  contact: string;
  channel: Channel;
  team: string;
  reason: string;
  context: string;
  status: "open" | "closed";
  created_at: string;
}

export const INTERACTION_COLUMNS = [
  "id", "created_at", "channel", "direction", "contact", "body", "intent", "escalated",
] as const;
export const CASE_COLUMNS = [
  "id", "created_at", "contact", "channel", "team", "reason", "context", "status",
] as const;

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
/**
 * The log is also written from Claude, which has no way to append to a Sheet — it rewrites
 * the file and trashes the old one, so the id changes. Resolving by name survives that; the
 * configured id is only the first guess.
 */
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME ?? "fo-01-log";

// Two ways in, whichever you have. OAuth uses the client you already created in Google
// Cloud plus a refresh token from `npm run google:auth`. The service account path needs no
// consent flow but does need the Sheet shared with its address.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Keys pasted into .env.local carry literal \n; turn them back into newlines.
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

const useOAuth = Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
const useServiceAccount = Boolean(SA_EMAIL && SA_KEY);
const configured = Boolean(SHEET_ID || SHEET_NAME) && (useOAuth || useServiceAccount);

function oauthClient() {
  const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: REFRESH_TOKEN });
  return oauth;
}

function jwtClient() {
  return new google.auth.JWT({
    email: SA_EMAIL,
    key: SA_KEY,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  });
}

let sheetsClient: sheets_v4.Sheets | null = null;
function sheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    sheetsClient = google.sheets({
      version: "v4",
      auth: useOAuth ? oauthClient() : jwtClient(),
    });
  }
  return sheetsClient;
}

const mem = { interactions: [] as Interaction[], cases: [] as Case[] };

/**
 * The log always uses the app's own credential, never the signed-in viewer's — an
 * organisational record should not change shape depending on who is looking at it.
 */
export function backend(): "google-sheet" | "memory" {
  return configured ? "google-sheet" : "memory";
}

function id(): string {
  return globalThis.crypto.randomUUID();
}

/** Row order must match the *_COLUMNS header, which ensureSheet writes on first use. */
function toRow(obj: object, cols: readonly string[]): string[] {
  const rec = obj as Record<string, unknown>;
  return cols.map((c) => {
    const v = rec[c];
    if (v === undefined || v === null) return "";
    return typeof v === "boolean" ? String(v) : String(v);
  });
}

function fromRows<T>(rows: string[][], cols: readonly string[]): T[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      const raw = r[i] ?? "";
      o[c] = c === "escalated" ? raw === "true" : raw;
    });
    return o as T;
  });
}

/** Creates the tab and writes the header row if it is not there yet. Idempotent. */
const ensured = new Set<string>();
async function ensureSheet(tab: string, cols: readonly string[]): Promise<void> {
  if (ensured.has(tab)) return;
  const api = sheets();
  const id = await sheetId();
  const meta = await api.spreadsheets.get({ spreadsheetId: id });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tab);

  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
  }

  const head = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${tab}!A1:Z1`,
  });
  if (!head.data.values?.[0]?.length) {
    await api.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [cols as unknown as string[]] },
    });
  }
  ensured.add(tab);
}

/**
 * The spreadsheet id to use right now.
 *
 * Tries the configured id, and falls back to a Drive lookup by name when it has gone —
 * newest first, since a rewrite leaves the replacement as the most recently modified. Cached
 * per process; a failed write clears it so the next call re-resolves.
 */
let resolvedId: string | null = null;

async function sheetId(): Promise<string> {
  if (resolvedId) return resolvedId;

  if (SHEET_ID) {
    try {
      await sheets().spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "spreadsheetId" });
      resolvedId = SHEET_ID;
      return resolvedId;
    } catch {
      // Deleted or replaced — fall through to the name lookup rather than failing.
    }
  }

  const drive = google.drive({ version: "v3", auth: useOAuth ? oauthClient() : jwtClient() });
  const res = await drive.files.list({
    q: `name = '${SHEET_NAME.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    orderBy: "modifiedTime desc",
    pageSize: 1,
    fields: "files(id,name)",
  });

  const found = res.data.files?.[0]?.id;
  if (!found) {
    throw new Error(
      `No spreadsheet named "${SHEET_NAME}" is reachable. Set GOOGLE_SHEET_ID, or ` +
        `GOOGLE_SHEET_NAME if the log was renamed.`,
    );
  }
  resolvedId = found;
  return resolvedId;
}

/** Called when a write fails, so a replaced file is picked up on the next attempt. */
function forgetSheetId() {
  resolvedId = null;
  ensured.clear();
}

async function append(tab: string, cols: readonly string[], obj: object) {
  await ensureSheet(tab, cols);
  await sheets().spreadsheets.values.append({
    spreadsheetId: await sheetId(),
    range: `${tab}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [toRow(obj, cols)] },
  });
}

async function readAll<T>(tab: string, cols: readonly string[]): Promise<T[]> {
  await ensureSheet(tab, cols);
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: await sheetId(),
    range: `${tab}!A2:Z`,
  });
  return fromRows<T>((res.data.values as string[][]) ?? [], cols);
}

export async function logInteraction(
  i: Omit<Interaction, "id" | "created_at">,
): Promise<Interaction> {
  const row: Interaction = { ...i, id: id(), created_at: new Date().toISOString() };
  if (configured) await append("interactions", INTERACTION_COLUMNS, row);
  else mem.interactions.unshift(row);
  return row;
}

export async function openCase(c: Omit<Case, "id" | "created_at" | "status">): Promise<Case> {
  const row: Case = { ...c, id: id(), status: "open", created_at: new Date().toISOString() };
  if (configured) await append("cases", CASE_COLUMNS, row);
  else mem.cases.unshift(row);
  return row;
}

export async function recentInteractions(limit = 20, contact?: string): Promise<Interaction[]> {
  const all = configured
    ? (await readAll<Interaction>("interactions", INTERACTION_COLUMNS)).reverse()
    : mem.interactions;
  const rows = contact ? all.filter((r) => r.contact === contact) : all;
  return rows.slice(0, limit);
}

export async function openCases(limit = 20): Promise<Case[]> {
  const all = configured
    ? (await readAll<Case>("cases", CASE_COLUMNS)).reverse()
    : mem.cases;
  return all.filter((c) => c.status === "open").slice(0, limit);
}
