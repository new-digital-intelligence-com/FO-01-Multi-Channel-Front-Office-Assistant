# Connecting the front office tools

A skill is instructions only; it carries no tool access. Execution comes from the FO-01
server, reached as an MCP connector named **FO-01**.

## What the server is

A headless Next.js app deployed at
<https://fo-01-multi-channel-front-office-as.vercel.app>. It holds the tool
implementations, the knowledge base, the operating contract and the interaction log (a Google
Sheet). It exposes a remote MCP server at `/api/mcp` over streamable HTTP, and the same tools
over plain HTTP for its own web console.

## Adding the connector

Anthropic connects **from its own cloud**, not from your machine — `localhost` is never
reachable, even in the desktop app. Use the deployed URL:

```
https://fo-01-multi-channel-front-office-as.vercel.app/api/mcp
```

**In Claude** — Settings → Connectors → Add custom connector → paste that URL. Name it
`FO-01`; the skill and the web console both refer to it by that name.

**In Claude Code** — this plugin ships `.mcp.json` pointing at the same URL, so enabling the
plugin registers it. `/mcp` shows its status. Set `FRONT_OFFICE_MCP_URL` to override.

## Checking it

`GET /api/health` returns the live store, the tool list, and what is configured:
<https://fo-01-multi-channel-front-office-as.vercel.app/api/health>

`store: "memory"` means the Google Sheet is not wired up: tools still work, but rows written
in one call may be invisible to the next. Do not demo durability from it.
`store: "google-sheet"` is the real one.

## There is also a web console

<https://fo-01-multi-channel-front-office-as.vercel.app/> — the same tools with a UI, for
people who would rather click than ask. It runs the same registry and writes to the same
sheet, so work done there shows up here and the other way round.

## Auth

The connector is unauthenticated: anyone with the URL gets the tools. Acceptable for a
proof of concept, **not** for real customer data. OAuth is the documented path for custom
connectors and is the first thing to add before this handles anything real.
