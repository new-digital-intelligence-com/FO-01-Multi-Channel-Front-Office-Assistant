/**
 * HTTP front door for the tool registry — the same tools the MCP server exposes.
 *
 * One dispatcher rather than a route per tool: the registry is the source of truth, so a
 * tool added there is reachable over HTTP and over MCP at once, with no route to forget.
 * Arguments are validated with the tool's own zod schema, so both surfaces reject the same
 * bad input for the same reason.
 */
import { TOOLS_BY_NAME } from "@/lib/core/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tool: string }> },
) {
  const { tool: name } = await params;
  const tool = TOOLS_BY_NAME.get(name);

  if (!tool) {
    return Response.json(
      { error: `Unknown tool "${name}".`, code: "unknown_tool" },
      { status: 404 },
    );
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "Body is not valid JSON.", code: "bad_request" }, { status: 400 });
  }

  const parsed = tool.schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
        code: "bad_request",
      },
      { status: 400 },
    );
  }

  try {
    const answer = await tool.run(parsed.data);
    // Mirror the MCP envelope so one client can speak to either surface unchanged.
    return typeof answer === "string"
      ? Response.json({ text: answer, payload: answer })
      : Response.json({ text: answer.text, payload: answer.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message, code: "tool_error" }, { status: 502 });
  }
}

/** Lets the console discover what exists without hardcoding a list. */
export async function GET() {
  return Response.json({
    tools: Array.from(TOOLS_BY_NAME.values()).map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
    })),
  });
}
