# Connecting the front office tools

A skill carries no tool access. Execution comes from the FO-01 server, reached as an MCP
connector.

## What the server is

A headless Next.js app exposing a remote MCP server at `/api/mcp` (streamable HTTP), plus
inbound webhook routes for the real channels. It holds the tool implementations, the
knowledge base, the operating contract and the interaction log.

## Reaching it

Anthropic connects **from its own cloud**, not from your machine — so `localhost` is never
reachable, even in Claude Desktop. The server needs a public HTTPS URL:

```
npm run dev        # server on :3000
npm run tunnel     # cloudflared -> https://<random>.trycloudflare.com
```

Then in Claude: **Settings → Connectors → Add custom connector**, URL
`https://<random>.trycloudflare.com/api/mcp`.

In Claude Code the plugin's `.mcp.json` does this instead — set `FRONT_OFFICE_MCP_URL` to the
tunnel URL, or leave it unset for `http://localhost:3000/api/mcp`, which works there because
Claude Code connects from the same machine.

## Checking it

`GET /api/health` returns the live store, the tool list, and what is configured.

`store: "memory"` means the Google Sheet is not wired up: tools still work, nothing survives
a restart. Report that honestly rather than implying the log is durable.

## Auth

The POC runs the connector unauthenticated behind an unguessable tunnel URL. That is
acceptable for a demo and **not** acceptable in production — anyone with the URL gets the
tools. OAuth is the documented path for custom connectors and is the first thing to add
before this is pointed at real customer traffic.
