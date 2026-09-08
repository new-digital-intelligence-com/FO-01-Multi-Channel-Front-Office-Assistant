/**
 * Shared Google auth for Gmail, Chat and Sheets — one OAuth client, one refresh token.
 *
 * The scopes are granted together by scripts/google-auth.mjs. If a Gmail or Chat call comes
 * back with insufficient permissions, the token predates those scopes: re-run
 * `npm run google:auth`.
 */
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { currentSession } from "@/lib/auth/session";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

export const googleConfigured = Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

let appCached: OAuth2Client | null = null;

/**
 * The app's own credential. Used for the shared interaction log, which belongs to the
 * organisation rather than to whoever happens to be looking at the console.
 */
export function appAuth(): OAuth2Client {
  if (!googleConfigured) {
    throw new Error(
      "Google is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and " +
        "GOOGLE_REFRESH_TOKEN, then run `npm run google:auth`.",
    );
  }
  if (!appCached) {
    appCached = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    appCached.setCredentials({ refresh_token: REFRESH_TOKEN });
  }
  return appCached;
}

/**
 * Whoever is using the console right now — their mailbox, their Chat spaces.
 *
 * Falls back to the app's credential when nobody is signed in, which is what the MCP
 * connector always gets: it carries no cookies, so a Claude-side call acts as the app.
 * Never cached, because it differs per request.
 */
export async function googleAuth(): Promise<OAuth2Client> {
  const session = await currentSession();
  if (session?.refreshToken) {
    const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    client.setCredentials({ refresh_token: session.refreshToken });
    return client;
  }
  if (!googleConfigured) {
    throw new Error(
      "Nobody is signed in and the app has no Google credential of its own. " +
        "Sign in with Google to read your mail and Chat spaces.",
    );
  }
  return appAuth();
}

/** Turns Google's noisy errors into something a model can act on. */
export function googleError(err: unknown, what: string): Error {
  const e = err as { message?: string; code?: number; errors?: { message?: string }[] };
  const msg = e?.errors?.[0]?.message ?? e?.message ?? String(err);

  // A disabled API and a missing scope both surface as 403. They need opposite fixes, so
  // check the more specific one first — telling someone to re-consent when the API is off
  // sends them round a loop that cannot succeed.
  // "Chat app not found" is NOT a disabled API — the API is on, but the Chat app itself has
  // never been filled in on the Chat API's Configuration tab. Enabling the API and
  // configuring the app are two separate steps and the generic advice sends people to the
  // page that already looks correct.
  if (/Chat app not found/i.test(msg)) {
    const project = process.env.GOOGLE_CLOUD_PROJECT || "<your-project>";
    return new Error(
      `${what} failed: the Google Chat app is not configured. Enabling the Chat API is not ` +
        `enough — open the Chat API's Configuration tab and fill in the app name, avatar and ` +
        `description, then save: ` +
        `https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat?project=${project} ` +
        `Reading messages works without this; posting does not.`,
    );
  }

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
