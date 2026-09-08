import { google } from "googleapis";
import { oauthClient } from "@/lib/auth/google-oauth";
import { SESSION_COOKIE, seal } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: Request, params: Record<string, string>) {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const to = new URL(`${proto}://${host}/`);
  for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
  return to.toString();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) return Response.redirect(back(req, { signin: "denied" }), 302);
  if (!code) return Response.redirect(back(req, { signin: "nocode" }), 302);

  const cookieState = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("fo01_oauth_state="))
    ?.slice("fo01_oauth_state=".length);

  if (!state || !cookieState || state !== cookieState) {
    return Response.redirect(back(req, { signin: "badstate" }), 302);
  }

  try {
    const client = oauthClient(req);
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // Without one the session dies in an hour and cannot be renewed.
      return Response.redirect(back(req, { signin: "norefresh" }), 302);
    }
    client.setCredentials(tokens);

    const me = await google.oauth2({ version: "v2", auth: client }).userinfo.get();

    const sealed = seal({
      email: me.data.email ?? "unknown",
      name: me.data.name ?? undefined,
      refreshToken: tokens.refresh_token,
      scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
      at: Date.now(),
    });

    const res = new Response(null, { status: 302, headers: { Location: back(req, { signin: "ok" }) } });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.headers.append("Set-Cookie", `${SESSION_COOKIE}=${sealed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
    res.headers.append("Set-Cookie", `fo01_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.redirect(back(req, { signin: "error", detail: msg.slice(0, 180) }), 302);
  }
}
