# FO-01 — Multi-Channel Front Office Assistant

A headless Next.js app that exposes the front office as **MCP tools**, so the assistant can be
driven from the Claude UI. No web UI of its own.

## What exists

| Piece | Where |
|---|---|
| MCP server (the Claude connector) | `app/api/mcp/route.ts` |
| Health / readiness probe | `app/api/health/route.ts` |
| **Tool registry — the single source of truth** | `lib/core/tools.ts` |
| **Behaviour contract — brand voice, escalation rules** | `lib/core/contract.md` |
| FAQ knowledge base + escalation triggers | `lib/core/kb.ts` |
| Store: Google Sheet, in-memory fallback | `lib/db/store.ts` |
| Claude plugin + skills | `plugin/` |

## Why it cannot drift

`lib/core/tools.ts` is iterated by the MCP server today, and by the autonomous channel agent
when channels are added. A capability cannot exist on one surface and be missing from the
other.

`lib/core/contract.md` is the one behaviour contract. `npm run sync:contract` copies it into
the plugin so the skill ships a byte-identical version; `npm run sync:contract -- --check`
fails if they drift. The `get_operating_contract` tool always returns the live copy, which
wins over any bundled one.

## Local

```bash
npm install
npm run dev            # http://localhost:3000
curl localhost:3000/api/health
```

Works with no configuration at all — the store falls back to memory.

## Deploy

```bash
vercel --prod
```

Then set the env vars in the Vercel dashboard (Project → Settings → Environment Variables),
using `.env.example` as the list. None are required for the tools to run; without them the
store is in-memory.

## Connect to Claude

**Settings → Connectors → Add custom connector** → `https://fo-01-multi-channel-front-office-as.vercel.app/api/mcp`

Then try: *"a customer emailed asking for a refund on invoice 8812"* — it should escalate to
Finance rather than answer.

## The Google Sheet

The interaction log and cases live in a Google Sheet. Two tabs, `interactions` and `cases`,
created automatically with their header rows on first write.

1. Create a Sheet, take the id from the URL: `docs.google.com/spreadsheets/d/<ID>/edit`
2. Google Cloud console → enable the **Google Sheets API**
3. Credentials → your OAuth client → add redirect URI `http://localhost:53682/callback`
4. `npm run google:auth` — writes `GOOGLE_REFRESH_TOKEN` into `.env.local`
5. Copy `GOOGLE_SHEET_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
   into Vercel

## Live

| | |
|---|---|
| MCP endpoint | <https://fo-01-multi-channel-front-office-as.vercel.app/api/mcp> |
| Health | <https://fo-01-multi-channel-front-office-as.vercel.app/api/health> |

Channels wired: Gmail (read + send), Google Chat (read + post), Slack (read + post, confined
to one channel), Google Sheet (the log).

## Not built yet

Channel webhooks (Gmail, Google Chat, WhatsApp) and the autonomous Haiku agent that answers
them 24/7. Claude is the brain for the connector path, so no Anthropic API key is needed until
those land.
