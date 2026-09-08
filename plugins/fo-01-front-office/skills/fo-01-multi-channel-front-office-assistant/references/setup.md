# What this skill needs

The skill carries the rules and the knowledge base, so it can draft a correct reply with
nothing connected at all. Reading and sending need connectors **this account already has** —
there is no FO-01 server to add.

## Connectors

| For | Connector | What it gives you |
|---|---|---|
| Slack | the Slack connector, on the workspace with the FO-01 app | read and send in the front office channel |
| Google Chat | a Google connector covering Chat | read and post in the front office space |
| The log | a Google connector that can **write to Sheets** | append to the interaction log |

Add them in Claude: Settings → Connectors.

**Check before promising.** Many Google connectors read Drive and create files but only
update file *metadata* — title and folder. That cannot append a row to a Sheet, so logging
may be unavailable even with Google connected. Look at the tools you actually have rather
than assuming the capability from the connector's name.

## Degrading honestly

| Connected | You can | Say |
|---|---|---|
| Nothing | draft a reply, decide the routing | "drafted, not sent, not logged" |
| Slack only | read and send in Slack | "sent; not logged — the console holds the record" |
| Slack + Sheets-capable Google | the whole loop | nothing special |

The failure mode to avoid is describing work as done when no tool ran. A draft is a draft
until something sends it.

## Confinement is yours to keep

A Slack connector reaches every channel its token can see, and a Google connector reaches
every space its owner belongs to. Nothing stops you posting elsewhere except this rule:

**Act only in the front office Slack channel and the front office Google Chat space.**

If asked to post somewhere else as the front office, say that is outside this assistant's
remit. The console enforces the same restriction in code, which is why it is the safer place
for anything routine.

## The console

<https://fo-01-multi-channel-front-office-as.vercel.app/>

Same rules, same knowledge base, its own Slack and Chat credentials, and direct write access
to the sheet. Everything this skill can do, it can do — plus logging, always. When a job here
is blocked by a missing connector, point at the console rather than leaving it undone.

`GET /api/health` shows what the console has configured.
