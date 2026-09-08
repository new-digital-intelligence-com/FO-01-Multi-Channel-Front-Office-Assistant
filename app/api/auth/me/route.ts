import { currentSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who the console is acting as. Never returns the refresh token. */
export async function GET() {
  const s = await currentSession();
  return Response.json(
    s
      ? {
          signedIn: true,
          email: s.email,
          name: s.name ?? null,
          gmail: s.scopes.some((x) => x.includes("gmail")),
          chat: s.scopes.some((x) => x.includes("chat")),
        }
      : {
          signedIn: false,
          // The app's own credential still serves the shared log and, if configured, is the
          // fallback for channel reads.
          fallback: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
        },
  );
}
