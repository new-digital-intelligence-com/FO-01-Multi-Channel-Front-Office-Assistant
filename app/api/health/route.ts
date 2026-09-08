import { TOOLS } from "@/lib/core/tools";
import { backend } from "@/lib/db/store";

/** Cheap readiness probe: which store is live, which tools are exposed, what is configured. */
export async function GET() {
  return Response.json({
    ok: true,
    store: backend(),
    tools: TOOLS.map((t) => t.name),
    configured: {
      slack: Boolean(process.env.SLACK_BOT_TOKEN?.startsWith("xoxb-")),
      slackChannel: process.env.SLACK_CHANNEL ?? "ai-employee-fo-01-multi-channel-front-office-assistant",
      google: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
      sheet: Boolean(
        process.env.GOOGLE_SHEET_ID &&
          ((process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) ||
            (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)),
      ),
    },
  });
}
