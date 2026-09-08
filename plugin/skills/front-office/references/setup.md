# Connecting the front office tools

A skill carries no tool access. Execution comes from the FO-01 server, reached as an MCP
connector.

## What the server is

A headless Next.js app exposing a remote MCP server at `/api/mcp` (streamable HTTP), plus
inbound webhook routes for the real channels. It holds the tool implementations, the
knowledge base, the operating contract and the interaction log.

## Reaching it

Anthropic connects **from its own cloud**, not from your machine — `localhost` is never
reachable, even in Claude Desktop. The server is deployed to Vercel, so the connector URL is
the production one:

```
https://fo-01-multi-channel-front-office-as.vercel.app/api/mcp
```

In Claude: **Settings → Connectors → Add custom connector**, paste that URL.

In Claude Code the plugin's `.mcp.json` does this instead — set `FRONT_OFFICE_MCP_URL` to the
same URL. Unset, it falls back to `http://localhost:3000/api/mcp`, which works there because
Claude Code connects from the same machine.

## Checking it

`GET /api/health` returns the live store, the tool list, and what is configured:
<https://fo-01-multi-channel-front-office-as.vercel.app/api/health>

`store: "memory"` means the Google Sheet is not wired up: tools still work, but on Vercel each
serverless invocation may get a fresh instance, so **rows written in one call may be invisible
to the next**. Do not demo durability from the memory store — report it honestly.
`store: "google-sheet"` is the real one.

## Auth

The POC runs the connector unauthenticated: anyone with the URL gets the tools, and a
`.vercel.app` URL is guessable. Acceptable for a demo, **not** for real customer data. OAuth
is the documented path for custom connectors and is the first thing to add before this handles
anything real.
