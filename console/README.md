# Front Office Console — the in-Claude app

`front-office-console.html` is an Artifact: a UI hosted on claude.ai that calls the FO-01
MCP connector directly with the viewer's credentials. It is not a prompt and not a chat —
the page calls tools itself.

**Publish it from the account that owns the FO-01 connector.** An Artifact belongs to the
account that publishes it, and a page declaring `mcp` cannot be shared publicly, so
publishing from one account and viewing from another does not work.

## How to publish

From a Claude Code session signed into the account that has the FO-01 connector, in this
repo:

> Publish `console/front-office-console.html` as an artifact with the mcp capability for
> server "FO-01" and tools list_open_cases, get_contact_history, read_channel, answer_faq,
> get_operating_contract, send_on_channel. Favicon 🛎️.

The exact capability declaration:

```json
{
  "mcp": {
    "servers": [
      {
        "server": "FO-01",
        "tools": [
          "list_open_cases",
          "get_contact_history",
          "read_channel",
          "answer_faq",
          "get_operating_contract",
          "send_on_channel"
        ]
      }
    ]
  }
}
```

`server` must match the connector's display name exactly. If the connector is named
something other than `FO-01`, change both the declaration and the `SERVER` constant near
the top of the page's script.

## What it shows

| View | Reads | Writes |
|---|---|---|
| Queue | `list_open_cases` (watched, 60s) | — |
| Log | `get_contact_history` (watched, 60s) | — |
| Channels | `read_channel` | `send_on_channel`, behind an explicit confirm |
| Knowledge | `answer_faq`, `get_operating_contract` | — |

Reads use `watchTool` so they stay current without polling code. Sends show the exact text
and the recipient and require agreement first — the operating contract's confirm-before-
writing rule applies to a button as much as to a model.

The rail shows which store is live. `sheet · durable` is the real one; anything else raises
a banner, because a demo that looks durable and is not will embarrass whoever repeats the
claim.

## Sample rows

The queue and log render one invented example row before the connector answers, marked
"example row — not your data", so the page shows what it does rather than an empty shell.
Real data replaces them on the first successful call. No observed workspace data is
embedded in the page.
