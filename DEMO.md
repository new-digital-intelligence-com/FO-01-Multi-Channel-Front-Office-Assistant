# FO-01 — demo script

Ten minutes, five claims, every one shown working rather than described.

**Open before you start**, so you can switch without fumbling:

1. The console — <https://fo-01-multi-channel-front-office-as.vercel.app/>
2. The Google Sheet (the interaction log)
3. Slack, on `#ai-employee-fo-01-multi-channel-front-office-assistant`
4. Google Chat, on the space **FO-01 Multi Channel Front Office Assistant**

Sign in on the console first — the rail should read your name, `connected`, and
`sheet · durable`. If it says anything but `sheet · durable`, stop: the log is not being
saved and nothing below will hold up.

---

## 1. "Answers FAQs 24/7" — and refuses to invent

**Knowledge → Question probe.**

| Type this | What appears | The point |
|---|---|---|
| `what are your opening hours` | green **Answered from the knowledge base**, with the approved hours | it answers |
| `what do you do` | green, the services answer | phrasing varies, the answer does not |
| `what colour is your logo` | amber **Not covered — no answer given** | it will not improvise |

Say the third one out loud: *a wrong answer given confidently costs more than no answer.*
Most demos skip this. It is the part that matters.

## 2. "Escalates complex cases to the right team"

Still in the probe:

| Type this | What appears |
|---|---|
| `do you offer refunds` | red **Escalation trigger — routed to Finance** |
| `je veux un remboursement` | red, **Finance** again |
| `I want to speak to a human` | red, **Management** |

The second one is worth pausing on: same intent, different language, same routing.

Then point at the first: *"do you offer refunds" shares almost every word with "what do you
offer", which the knowledge base answers. The trigger overrides the match — a refund
question can never be answered just because it looks like a covered one.*

## 3. "Handles requests across channels from a single agent"

**Channels → Slack.** The messages are read live from the real channel.

Switch to **Google Chat.** Same view, same code, different channel.

Say: *one agent, two channels, and neither has a channel or space to choose — the
restriction is that the parameter does not exist, not that something checks it.*

## 4. "Logs every interaction automatically"

**Channels → Slack.** Type into the reply box:

> Thanks — we're open until 18:00 today, so there's still time.

Press **Review and send…** — the confirmation shows the exact text and where it is going.
Say: *a message to a real person cannot be recalled, so a button gets the same confirmation
a person would.* Press **Send now**.

Now, in order:

1. **Slack** — the message is there, posted by FO-01
2. **The Google Sheet** — a new row in `interactions`, channel `slack`, direction `outbound`
3. **Console → Log** — the same row, in a timeline with every other channel

Three places, one action, no manual step. That is the claim.

Repeat on the Google Chat tab if you want both channels in the sheet during the demo.

## 5. "Routes with full context" — the escalation queue

**Queue.** The open case shows the team as a coloured stripe, who it came from, which
channel, and the full handover context.

Say: *`context` is a required field on the escalation tool — at least a sentence. A handover
without context is worse than none, because the customer tells their story twice.*

## 6. Consistent voice on every channel

**Knowledge → Operating contract.** Scroll it.

Say: *this file is read by the server on every request, and the same file ships inside the
Claude plugin. Not a copy that drifts — a build step fails if the two differ. Whichever
surface answers, it answers from this.*

---

## The same thing from inside Claude

Optional, and only if the connector is set up on the account you are presenting from.

In Claude: *"a customer emailed asking for a refund on invoice 8812"*

It escalates to Finance and writes to the same sheet — the row appears next to the ones the
console made. Same tools, same log, different front door.

---

## Say these out loud before someone asks

- **Nothing is authenticated.** Anyone with the URL gets the console and the tools. Fine for
  today, first thing to fix before real customer data.
- **No phone channel.** Slack and Google Chat only. WhatsApp is the free path when wanted.
- **Nothing answers at 3am.** A person drives the console, or Claude drives the connector.
  The autonomous loop is the next build, not a missing config.
- **Slack's confinement is our code, not Slack's permissions.** The token can see other
  channels; the tool surface gives no way to name one.

Claiming the first three are done is the fastest way to lose the room. Naming them is the
fastest way to be believed about everything else.

---

# Triggering the skill inside Claude

The skill fires on what the request *is*, not on its name — so ask for front office work in
ordinary words. Never say "use the front office skill"; if that is what it takes, the
description is wrong and should be fixed instead.

**Setup first:** the `FO-01` connector must be added (Settings → Connectors), and the plugin
installed or the skill uploaded. See the skill's `references/setup.md`.

## The one that shows everything

> Check the front office channels, handle anything you can answer, and escalate whatever you
> can't.

Reads both channels, checks history, answers what the knowledge base covers, escalates the
rest with context, logs all of it. One prompt, the whole loop.

## Answering

> A customer on Slack is asking what time we close on Saturday. Draft the reply.

> Someone wants to know how much an engagement costs — what do we tell them?

> What's our lead time if someone asks today?

## Refusing to improvise — the important one

> A customer asked what colour our logo is. Answer them.

It should say the knowledge base does not cover it and offer to escalate, **not** invent a
colour. If it ever answers this, the skill is not being followed.

## Escalating

> A customer emailed asking for a refund on invoice 8812 — they were charged twice.

> Someone in the front office channel is angry and wants to speak to a manager.

> Un client demande un remboursement sur sa dernière facture.

The third is worth running in front of people: same intent, different language, same routing
to Finance, and the reply comes back in French.

## Qualifying

> New enquiry from ana@lee.co — they want front office automation for a 40-person team and
> need it live by November. Log it.

## Reading channels

> What's come in on the front office Slack channel?

> Read the Google Chat space and tell me if anything needs a human.

## Reporting

> What escalations are still open?

> Has sam@acme.com contacted us before?

> Summarise today's front office activity — what came in, what escalated, what's still open.

## Sending

> Reply on Slack: we're open until 18:00 today, so there's still time.

It must show the exact text and ask before sending. If it sends without asking, that is a
bug worth reporting, not a convenience.

## If nothing triggers

Ask for the work, not the tool. "What's our refund policy" is front office work; "run
answer_faq" is you doing the routing by hand. If a plainly-worded front office request does
not trigger the skill, the fix is the `description` in `SKILL.md` — that string is the whole
trigger surface.
