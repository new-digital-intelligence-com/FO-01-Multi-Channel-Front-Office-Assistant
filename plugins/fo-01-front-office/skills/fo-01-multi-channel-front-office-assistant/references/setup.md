# What this skill needs

The skill carries the rules and the knowledge base, so it can decide and draft with nothing
connected at all. Reading and sending need connectors on this account. There is no FO-01
server to add — everything below is either Anthropic's own connector or Google's.

## Slack

**Settings → Connectors → Slack.** It is in Anthropic's directory; connect the workspace the
FO-01 app lives in. It can search channels, DMs and files, and — through Interactive Apps —
draft and post messages without leaving Claude.

**It does not act as the FO-01 bot.** The Slack connector authenticates as *you*, so anything
posted through it appears from your account, not from FO-01. For a demo where the front
office must look like the front office, post through the console instead — that uses the
FO-01 bot token and shows the app as the author. Say which one you used rather than letting
someone assume.

## Google Chat

Anthropic has no Chat connector — its Google connectors are Gmail, Calendar and Drive. Google
ships its own remote MCP server, added as a custom connector:

**Settings → Connectors → Add custom connector**

| Field | Value |
|---|---|
| Server name | `Google Chat` |
| Remote MCP server URL | `https://chatmcp.googleapis.com/mcp/v1` |
| Advanced → OAuth client ID / secret | your own Google Cloud OAuth client |

In Google Cloud, on the same project as that OAuth client:

1. Enable **Chat API** (`chat.googleapis.com`) — already on for this project
2. Enable **Chat MCP API** (`chatmcp.googleapis.com`)
3. Add the redirect URI **`https://claude.ai/api/mcp/auth_callback`** to the OAuth client
4. The Chat MCP API is part of Google's **Workspace Developer Preview Program** — enrol if
   the API will not enable

It exposes `search_conversations`, `list_messages`, `search_messages`, `send_message`,
`mark_as_read`, `mark_as_unread` and `list_memberships`.

This is Google's server, not ours: nothing to host, nothing to keep alive.

## The log

**Settings → Connectors → Google Drive.** Needed to rewrite `fo-01-log` — see SKILL.md →
Logging. A Drive connector cannot append to a Sheet, so logging means reading the whole file,
adding your rows, writing it back and trashing the old one. That needs `search_files`,
`read_file_content`, `create_file` and `trash_file`; if any is missing, logging is not
available and you say so.

The console resolves the log by **name**, so a replaced file is picked up automatically and a
rewrite does not orphan it.

## Degrading honestly

| Connected | You can | Say |
|---|---|---|
| Nothing | draft a reply, decide the routing | "drafted — not sent, not logged" |
| Slack only | read and send in Slack, as yourself | "sent from my account, not as FO-01; not logged" |
| Slack + Google Chat | both channels | "not logged" unless Drive is there too |
| + Google Drive | the whole loop | nothing special |

The failure to avoid is describing work as done when no tool ran. A draft is a draft until
something sends it.

## Confinement is yours to keep

The Slack connector reaches every channel you can see; the Chat MCP reaches every space you
belong to. Nothing stops you posting elsewhere except this rule:

**Act only in the front office Slack channel and the front office Google Chat space.**

If asked to post somewhere else as the front office, say that is outside this assistant's
remit. The console enforces the same restriction in code — no channel or space argument
exists on its tools — which is why it is the safer place for anything routine.

## The console

<https://fo-01-multi-channel-front-office-as.vercel.app/>

Same rules, same knowledge base, its own FO-01 Slack bot token and Chat webhook, direct write
access to the log, and the confinement enforced rather than followed. When a job here is
blocked by a missing connector, or when a message must appear as FO-01 rather than as you,
point at the console instead of leaving it undone.

`GET /api/health` shows what the console has configured.
