/**
 * Per-viewer Google session, carried in an encrypted cookie.
 *
 * The app is serverless, so there is nowhere to keep a session table for a POC. The refresh
 * token rides in the cookie instead — encrypted, not merely signed, because a signed cookie
 * is still readable by anyone who gets the browser, and this one grants mailbox access.
 *
 * Scope of the credential matters:
 *   - the interaction log stays on the APP's own token (an organisational record)
 *   - Gmail and Chat use the VIEWER's token (their mailbox, their spaces)
 * so two people using the console read their own mail but write to one shared log.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "fo01_session";

export interface Session {
  email: string;
  name?: string;
  refreshToken: string;
  scopes: string[];
  at: number;
}

/**
 * Derived from the OAuth client secret so a POC needs no extra env var, overridable with
 * SESSION_SECRET. Rotating either invalidates every session, which is the correct behaviour.
 */
function key(): Buffer {
  const material = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!material) throw new Error("No SESSION_SECRET or GOOGLE_CLIENT_SECRET to derive a session key from.");
  return createHash("sha256").update("fo01:session:v1:" + material).digest();
}

export function seal(s: Session): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(s), "utf8"), c.final()]);
  return [iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function unseal(token: string): Session | null {
  try {
    const [ivB, tagB, bodyB] = token.split(".");
    if (!ivB || !tagB || !bodyB) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
    d.setAuthTag(Buffer.from(tagB, "base64url"));
    const json = Buffer.concat([d.update(Buffer.from(bodyB, "base64url")), d.final()]).toString("utf8");
    return JSON.parse(json) as Session;
  } catch {
    // A tampered, truncated or stale-key cookie is simply "not signed in".
    return null;
  }
}

/**
 * The current viewer, or null. Returns null outside a request too — the MCP connector has
 * no cookies, so that path falls through to the app's own credential by design.
 */
export async function currentSession(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE)?.value;
    return raw ? unseal(raw) : null;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
