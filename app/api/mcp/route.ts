/**
 * The Claude surface: a remote MCP server over streamable HTTP.
 *
 * It carries capability, not judgement. Claude gets the tools that touch the outside world —
 * reading and sending on a channel, writing to the log — while what to say, when to refuse
 * and where to route lives in the front office skill. Tools marked `mcp: false` in the
 * registry are judgement encoded as code for the console's own UI, and are deliberately not
 * offered here; handing Claude an `answer_faq` verdict would let it skip the reasoning the
 * skill exists to carry.
 *
 * Everything is served from lib/core/tools.ts, the same array the HTTP API uses, so a
 * capability cannot exist on one surface and be missing from the other.
 */
import { createMcpHandler } from "mcp-handler";
import { TOOLS } from "@/lib/core/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler((server) => {
  for (const tool of TOOLS) {
    if (tool.mcp === false) continue;

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      },
      async (input: unknown) => {
        try {
          const answer = await tool.run(input);
          if (typeof answer === "string") {
            return { content: [{ type: "text" as const, text: answer }] };
          }
          return {
            content: [{ type: "text" as const, text: answer.text }],
            structuredContent: answer.data as Record<string, unknown>,
          };
        } catch (err) {
          // Surface the failure rather than returning a cheerful empty result — the
          // contract's honesty rules apply to tools as much as to replies.
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Tool ${tool.name} failed: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }
});

export { handler as GET, handler as POST, handler as DELETE };
