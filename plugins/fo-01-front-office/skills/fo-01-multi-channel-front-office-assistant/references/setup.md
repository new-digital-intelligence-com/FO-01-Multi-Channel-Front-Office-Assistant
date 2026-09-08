# Connecting the tools

The skill carries the judgement: the rules, the knowledge base, the routing. It needs one
connector for the things that touch the outside world.

## The FO-01 connector

**Claude** — Settings → Connectors → **Add custom connector**:

```
https://fo-01-multi-channel-front-office-as.vercel.app/api/mcp
```

Name it **`FO-01`**. Anthropic connects from its own cloud, so `localhost` is never
reachable, even in the desktop app.

**Claude Code** — this plugin ships `.mcp.json` pointing at the same URL, so enabling the
plugin registers it; `/mcp` shows status. Set `FRONT_OFFICE_MCP_URL` to override.

## What it gives you

Seven tools, all of them actions: `read_channel`, `send_on_channel`, `get_contact_history`,
`list_open_cases`, `escalate_case`, `qualify_enquiry`, `log_interaction`.

**No tool decides anything.** There is deliberately no "is this answerable" or "which team"
tool — that judgement is the skill's, from `rules.md` and `knowledge-base.md`. The console
has two extra tools that encode the same judgement in code for its own UI; they are not
offered here, because a verdict handed over as a tool result is a reasoning step skipped.

## Why not the Slack and Google connectors

You could reach Slack with Anthropic's Slack connector and Chat with Google's
`chatmcp.googleapis.com`. This connector is better for this job on three counts:

- **It posts as the FO-01 bot.** The Slack connector authenticates as *you*, so a reply sent
  through it comes from a person, not from the front office.
- **The confinement is enforced, not followed.** Slack is pinned to one channel and Chat to
  one space in the server; there is no channel or space argument to pass. A general connector
  reaches everything its token can see and relies on you not to.
- **It appends to the log.** A Drive connector cannot append to a Sheet — it would mean
  reading the whole file, rewriting it and trashing the old one, which destroys the log if
  the read is skipped.

It also needs no Google Cloud setup, no Chat MCP API and no Developer Preview enrolment.

## Checking it

`GET /api/health` shows the live store, the tool list and what is configured:
<https://fo-01-multi-channel-front-office-as.vercel.app/api/health>

`store: "memory"` means the log is not wired up: tools still work, but rows written in one
call may be invisible to the next. Do not demo durability from it. `store: "google-sheet"` is
the real one.

## Auth

The connector is unauthenticated: anyone with the URL gets the tools, and through them the
front office Slack channel and Chat space. Acceptable for a proof of concept, **not** for
real customer data. OAuth is the documented path for custom connectors and is the first thing
to add before this handles anything real.

## The console

<https://fo-01-multi-channel-front-office-as.vercel.app/> — the same tools with a UI. Same
server, same channels, same log.
