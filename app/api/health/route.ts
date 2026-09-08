import { TOOLS } from "@/lib/core/tools";
import { backend } from "@/lib/db/store";

/** Cheap readiness probe: which store is live, which tools are exposed, what is configured. */
export async function GET() {
  return Response.json({
    ok: true,
    store: backend(),
    tools: TOOLS.map((t) => t.name),
    configured: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      sheet: Boolean(
        process.env.GOOGLE_SHEET_ID &&
          ((process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) ||
            (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)),
      ),
    },
  });
}
