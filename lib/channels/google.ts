/**
 * Shared Google auth for Gmail, Chat and Sheets — one OAuth client, one refresh token.
 *
 * The scopes are granted together by scripts/google-auth.mjs. If a Gmail or Chat call comes
 * back with insufficient permissions, the token predates those scopes: re-run
 * `npm run google:auth`.
 */
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

export const googleConfigured = Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

let cached: OAuth2Client | null = null;

export function googleAuth(): OAuth2Client {
  if (!googleConfigured) {
    throw new Error(
      "Google is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and " +
        "GOOGLE_REFRESH_TOKEN, then run `npm run google:auth`.",
    );
  }
  if (!cached) {
    cached = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    cached.setCredentials({ refresh_token: REFRESH_TOKEN });
  }
  return cached;
}

/** Turns Google's noisy errors into something a model can act on. */
export function googleError(err: unknown, what: string): Error {
  const e = err as { message?: string; code?: number; errors?: { message?: string }[] };
  const msg = e?.errors?.[0]?.message ?? e?.message ?? String(err);

  // A disabled API and a missing scope both surface as 403. They need opposite fixes, so
  // check the more specific one first — telling someone to re-consent when the API is off
  // sends them round a loop that cannot succeed.
  if (/has not been used in project|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(msg)) {
    const api = msg.match(/([a-z]+\.googleapis\.com)/i)?.[1] ?? "the API";
    return new Error(
      `${what} failed: ${api} is not enabled for this Google Cloud project. ` +
        `Enable it in the console, wait a minute, then retry. Re-consenting will not help.`,
    );
  }

  if (/insufficient|scope|forbidden/i.test(msg) || e?.code === 403) {
    return new Error(
      `${what} failed: ${msg}. The refresh token is probably missing this scope — ` +
        `re-run \`npm run google:auth\` to re-consent.`,
    );
  }

  return new Error(`${what} failed: ${msg}`);
}
