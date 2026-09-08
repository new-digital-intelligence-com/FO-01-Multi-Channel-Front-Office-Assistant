---
name: front-office
description: Router for the FO-01 multi-channel front office assistant. Use whenever the user wants to handle an inbound customer request from phone, e-mail, web chat or messaging — answer an FAQ, qualify an enquiry or lead, escalate a complaint or complex case to a human team, look up what a customer has asked before, or review open escalations.
---

# Front office

One assistant behind every inbound channel — phone, e-mail, web chat, messaging. The same
answer, the same voice, the same log, wherever the request arrived.

## 1. Read the operating contract first

**[references/contract.md](references/contract.md) is the behaviour contract** — brand voice,
what we answer directly, qualifying rules, escalation triggers and honesty rules. Read it
before drafting anything a customer will see.

The FO-01 server injects this same file into its autonomous channel agent, so a reply written
here and a reply written by the server come out the same. The copy in this folder is synced
from the server's original; when the connector is available, `get_operating_contract` returns
the live copy and **that one wins**.

## 2. Check the tools are actually there

A skill is instructions only; it carries no tool access. Executing anything here needs the
`front-office` MCP connector — the FO-01 Next.js server.

Confirm you can see the tools (`answer_faq`, `escalate_case`, `log_interaction` …). If none
are present, see [references/setup.md](references/setup.md). Without them you can still draft
a reply from the contract, but **say plainly that nothing was logged or escalated** — never
imply a case was opened when no tool ran.

## 3. Route to the job

| The user wants to | Load |
|---|---|
| Answer a question, draft a reply, qualify a lead | [front-office-answering](../front-office-answering/SKILL.md) |
| Escalate, complain, refund, "get me a human" | [front-office-escalation](../front-office-escalation/SKILL.md) |
| Review history, open cases, what came in today | [front-office-reporting](../front-office-reporting/SKILL.md) |

## The shape of every inbound request

Whatever the channel, work in this order:

1. `get_contact_history` — is this a stranger or a returning customer? A third contact on an
   unresolved issue is an escalation trigger on its own.
2. Decide: answerable, qualifiable, or escalate. When in doubt, escalate.
3. `answer_faq` / `qualify_enquiry` / `escalate_case`.
4. `log_interaction` for the reply you send. The log must show both sides.

Never skip step 4 because the reply was short. "Logs every interaction" is the product claim.

## Channels

`phone` `email` `webchat` `gchat` `whatsapp` `slack` `claude`

Pass the channel the request actually arrived on. When you are acting inside Claude on the
user's behalf rather than relaying a real customer message, the channel is `claude`.
Do not label a Claude-side test as `email` — it corrupts the log the demo is built on.
