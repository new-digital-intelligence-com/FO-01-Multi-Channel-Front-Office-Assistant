# FO-01 — Multi-Channel Front Office Assistant

A headless Next.js app that exposes the front office as **MCP tools**, so the assistant can be
driven from the Claude UI. No web UI of its own.

## What exists

| Piece | Where |
|---|---|
| The console UI | `console/front-office-console.html` -> `public/console.html` |
| HTTP tool dispatcher (the web UI's back end) | `app/api/tools/[tool]/route.ts` |
| MCP server (the Claude connector) | `app/api/mcp/route.ts` |
| Health / readiness probe | `app/api/health/route.ts` |
| **Tool registry — the single source of truth** | `lib/core/tools.ts` |
| **Behaviour contract — brand voice, escalation rules** | `lib/core/rules.md` |
| FAQ knowledge base + escalation triggers | `lib/core/kb.ts` |
| Store: Google Sheet, in-memory fallback | `lib/db/store.ts` |
| Claude plugin + skill | `plugins/fo-01-front-office/` |

## Who the app acts as

Two credentials, on purpose:

| What | Acts as | Why |
|---|---|---|
| Interaction log, cases | the app's own Google token | an organisational record should not change with who is looking |
| Google Chat | the signed-in viewer | it is their space membership |

Anyone in the Workspace signs in at `/api/auth/google`; the refresh token rides in an
encrypted (not merely signed) cookie, because a readable one would grant Chat access to
anyone holding the browser. Signed out, Chat reads fall back to the app's own token.

The MCP connector carries no cookies, so a Claude-side call always acts as the app. That is
deliberate, not a gap.

Scopes requested: `openid`, `userinfo.email`, `userinfo.profile`, `chat.spaces.readonly`,
`chat.messages`. No Gmail — the mail channel was removed, which also removed Google's
restricted-scope verification requirement.

## Two front doors, one page

The console is the same file either way. Served by this app it calls `/api/tools/<name>`
directly — open the URL, no Claude account and nothing to publish. Published as an Artifact
inside Claude it cannot reach an external host at all (the sandbox blocks every outbound
fetch), so it goes through the `mcp` capability to the same tools. Both transports speak the
same `{text, payload}` envelope, so the page's rendering code is identical.

`npm run sync:console` wraps the artifact-authored fragment into a standalone document for
the web app. Run it after editing the console.

## Why it cannot drift

`lib/core/tools.ts` is iterated by the MCP server today, and by the autonomous channel agent
when channels are added. A capability cannot exist on one surface and be missing from the
other.

`lib/core/rules.md` is the one behaviour contract. `npm run sync:rules` copies it into
the plugin so the skill ships a byte-identical version; `npm run sync:rules -- --check`
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
| Console | <https://fo-01-multi-channel-front-office-as.vercel.app/> |
| MCP endpoint | <https://fo-01-multi-channel-front-office-as.vercel.app/api/mcp> |
| Health | <https://fo-01-multi-channel-front-office-as.vercel.app/api/health> |

Channels wired: Slack and Google Chat — each confined in code to a single conversation, with
no channel or space parameter on the tool surface. Google Sheet is the log.

## Not built yet

Channel webhooks (Gmail, Google Chat, WhatsApp) and the autonomous Haiku agent that answers
them 24/7. Claude is the brain for the connector path, so no Anthropic API key is needed until
those land.
