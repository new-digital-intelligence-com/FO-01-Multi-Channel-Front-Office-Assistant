---
name: front-office-escalation
description: Escalate a complex or sensitive inbound case to the right human team with full context, for the FO-01 front office. Use for complaints, refunds, cancellations, contractual or legal matters, anything committing money, safety issues, a customer asking for a human, or a question the knowledge base does not cover.
---

# Escalation

Escalation is the product working, not failing. There is no human in the loop for ordinary
traffic — which is exactly why the hand-off has to be clean when it happens.

## Escalate immediately, without attempting an answer

- Complaint, refund, cancellation, or anything with a legal or contractual edge
- The person asks for a human, or is visibly frustrated
- Money is being committed: a quote, a discount, a contract change
- Safety, medical, or anything time-critical
- The knowledge base does not cover it and a wrong answer would cost us
- Third contact from the same person on the same unresolved issue
  (check with `get_contact_history` before deciding it is a first contact)

## Routing

| Subject | Team |
|---|---|
| Billing, invoices, refunds | `Finance` |
| Technical fault, outage, bug | `Support` |
| New business, pricing, quotes | `Sales` |
| Legal, press, safety, anything unclear | `Management` |

When unsure, `Management`. A misrouted case is recoverable; an unrouted one is not.

## Context is mandatory

`escalate_case` requires `context`, and it must carry: the channel, what they asked, what was
already answered, and why it is being escalated. A hand-off without context is worse than no
hand-off — the colleague re-asks the customer everything and the customer tells the story twice.

Write it for the human who picks it up cold, not as a summary for yourself.

## What to tell the customer

Plainly, and briefly: a colleague is picking it up, and roughly when. Then stop.

Do not apologise at length. Do not explain the internal routing. **Do not promise a callback
time the business has not committed to** — "shortly" is honest, "within the hour" is a
commitment you cannot make. Then `log_interaction` the reply you sent.
