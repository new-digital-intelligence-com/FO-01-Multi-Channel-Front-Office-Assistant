# Front office tool inventory

Served by the `FO-01` connector. This list is for orientation — the connector's own tool
descriptions are authoritative, and every tool validates its arguments, so a wrong shape
comes back as a clear error rather than a silent misfire.

## Reading

| Tool | Arguments | Notes |
|---|---|---|
| `get_operating_contract` | none | The live behaviour contract. Read before drafting anything a customer sees; overrides the copy bundled with this skill. |
| `answer_faq` | `question` | Returns `covered` / `escalate` / `not_covered`. Respect the verdict — see the skill. |
| `get_contact_history` | `contact?`, `limit` | Every channel in one timeline. Omit `contact` for all recent traffic. |
| `list_open_cases` | `limit` | Escalations still waiting on a human, newest first. |
| `read_channel` | `channel`, `limit` | `channel` is `slack` or `gchat`. **No channel or space argument** — each is locked to one conversation. |

## Writing

| Tool | Arguments | Notes |
|---|---|---|
| `qualify_enquiry` | `contact`, `channel`, `intent`, `timeline?`, `budget?`, `notes?` | Logs the enquiry and reports what is still missing. |
| `escalate_case` | `contact`, `channel`, `team`, `reason`, `context` | `context` must be at least a sentence — the tool rejects less. `team` is `Finance`, `Support`, `Sales` or `Management`. |
| `log_interaction` | `contact`, `channel`, `direction`, `body`, `intent?` | For anything a tool did not already log. |
| `send_on_channel` | `channel`, `body`, `threadId?` | **Visible to real people, cannot be recalled — confirm the exact text first.** Logs what it sends, so do not also call `log_interaction`. |

## Channel values

`slack` `gchat` `claude` `phone` `email` `webchat` `whatsapp`

Only `slack` and `gchat` have an integration. The rest are for logging historical or
manually-relayed interactions — never imply a message was sent on one of them.

## What the results carry

Reading tools return prose for you and structured data for the console UI, from one handler,
so the two surfaces cannot disagree.

Every store-touching result names its store. **`store: memory` means nothing is persisted.**
Report that rather than implying the log is durable.
