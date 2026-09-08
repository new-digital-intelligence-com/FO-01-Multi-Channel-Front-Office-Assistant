/**
 * The Claude surface: a remote MCP server over streamable HTTP.
 *
 * Every tool comes from lib/core/tools.ts — the same array the autonomous channel agent
 * uses — so the two surfaces cannot drift apart.
 *
 * Add as a Custom Connector in Claude with the public HTTPS URL of this route.
 * Anthropic connects from its own cloud, so localhost is never reachable: run
 * `npm run tunnel` and use the tunnel URL.
 */
import { createMcpHandler } from "mcp-handler";
import { TOOLS } from "@/lib/core/tools";

// googleapis needs the Node runtime, not edge.
export const runtime = "nodejs";
// Nothing here is cacheable — every call reads or writes live state.
export const dynamic = "force-dynamic";
// Sheets writes plus a slow client should not be cut off at the default 10s on Vercel.
export const maxDuration = 60;

const handler = createMcpHandler((server) => {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.schema },
      async (input: unknown) => {
        try {
          const text = await tool.run(input);
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          // Surface the failure instead of returning a cheerful empty result —
          // the contract's honesty rules apply to tools as much as to replies.
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
