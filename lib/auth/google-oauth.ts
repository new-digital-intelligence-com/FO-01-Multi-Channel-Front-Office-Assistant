/**
 * The OAuth client used for signing viewers in. Separate from lib/channels/google.ts, which
 * resolves whichever credential a tool should act as.
 */
import { google } from "googleapis";

export const USER_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages",
];

/**
 * Built from the request so the callback URL matches the host actually in use — localhost in
 * development, the deployment in production — without a second env var to keep in step.
 * Every host used must still be listed as an authorized redirect URI on the OAuth client.
 */
export function redirectUri(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

export function oauthClient(req: Request) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.");
  return new google.auth.OAuth2(id, secret, redirectUri(req));
}
