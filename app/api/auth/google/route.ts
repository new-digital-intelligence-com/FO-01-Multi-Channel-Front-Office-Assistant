import { randomBytes } from "node:crypto";
import { oauthClient, USER_SCOPES } from "@/lib/auth/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts sign-in. `prompt: consent` so a refresh token comes back every time. */
export async function GET(req: Request) {
  let url: string;
  try {
    // CSRF state, echoed back by Google and checked in the callback.
    const state = randomBytes(16).toString("base64url");
    url = oauthClient(req).generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: USER_SCOPES,
      state,
    });
    const res = Response.redirect(url, 302);
    const out = new Response(res.body, res);
    out.headers.append(
      "Set-Cookie",
      `fo01_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    );
    return out;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
