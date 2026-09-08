---
name: front-office-reporting
description: Review front office activity for FO-01 — what came in, on which channel, what is still waiting on a human. Use when the user asks what happened today, wants a contact's history across channels, asks which escalations are still open, or wants to check that interactions are being logged.
---

# Reporting

## Tools

- `get_contact_history` — recent interactions, optionally filtered to one contact. Every
  channel in one timeline, which is the point: someone who emailed on Monday and messaged on
  Thursday is one person, not two.
- `list_open_cases` — escalations still waiting on a human, newest first, with the team.

## Reporting honestly

- Give what the tools returned. Never estimate a count or fill a gap with a plausible entry.
- State coverage: "the 20 most recent interactions" is honest; presenting one page as the
  whole log is not.
- An empty result on a fresh deployment means nothing has come in yet — say that, rather
  than presenting an empty report as a finding.
- Every tool result reports its store. **`store: memory` means nothing is persisted and a
  restart wipes it** — say so when reporting, because a demo that looks durable and is not
  will embarrass whoever repeats the claim. `store: google-sheet` is the durable one.

## A useful daily summary

Volume by channel, the intents that came up more than once, what escalated and to which team,
and anything still open from before today. Lead with what needs a human — that is the only
part anyone acts on.
