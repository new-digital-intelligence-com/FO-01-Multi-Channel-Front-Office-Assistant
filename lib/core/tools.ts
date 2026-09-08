/**
 * THE TOOL REGISTRY — the single source of truth for what this assistant can do.
 *
 * Two consumers iterate this exact array:
 *   1. app/api/mcp/route.ts   -> registers each entry as an MCP tool (the Claude surface)
 *   2. lib/core/agent.ts      -> converts each entry into an Anthropic tool definition
 *                                (the autonomous channel surface)
 *
 * A capability therefore cannot exist on one surface and be missing from the other.
 * Add a tool here and both surfaces gain it on the next reload.
 */
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookup } from "./kb";
import {
  backend, logInteraction, openCase, openCases, recentInteractions,
  type Channel,
} from "@/lib/db/store";
import * as gmail from "@/lib/channels/gmail";
import * as gchat from "@/lib/channels/gchat";
import * as slack from "@/lib/channels/slack";

const CHANNELS = ["phone", "email", "webchat", "gchat", "whatsapp", "slack", "claude"] as const;
const TEAMS = ["Finance", "Support", "Sales", "Management"] as const;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** Returns plain text. Both surfaces wrap it in their own envelope. */
  run: (input: any) => Promise<string>;
}

export const CONTRACT = readFileSync(join(process.cwd(), "lib/core/contract.md"), "utf8");

export const TOOLS: ToolDef[] = [
  {
    name: "get_operating_contract",
    title: "Get operating contract",
    description:
      "Return the front office operating contract — brand voice, escalation rules and honesty rules. " +
      "Read this BEFORE drafting any reply to a customer, so the answer matches how this organisation " +
      "speaks on every other channel. This is the live copy and overrides any copy bundled elsewhere.",
    schema: z.object({}),
    run: async () => CONTRACT,
  },

  {
    name: "answer_faq",
    title: "Answer an FAQ",
    description:
      "Look up an inbound question in the front office knowledge base. Use for hours, location, pricing, " +
      "lead times, booking and service scope. Returns the approved answer, or reports that the question is " +
      "NOT covered — in which case escalate rather than improvising an answer.",
    schema: z.object({
      question: z.string().min(1).describe("The customer's question, in their own words"),
    }),
    run: async ({ question }) => {
      const m = lookup(question);
      if (m.escalateTo) {
        return [
          `ESCALATION TRIGGER matched — this is not an FAQ.`,
          `Do not answer it, even if it resembles a question we cover.`,
          `Escalate to ${m.escalateTo} with escalate_case.`,
        ].join(" ");
      }
      if (!m.covered) {
        return [
          `NOT COVERED by the knowledge base (best match "${m.entry?.id ?? "none"}", score ${m.score}).`,
          `Do not improvise an answer.`,
          `Escalate, or ask the customer one clarifying question.`,
        ].join(" ");
      }
      return `COVERED (${m.entry!.id}, score ${m.score}). Approved answer:\n\n${m.entry!.a}`;
    },
  },

  {
    name: "qualify_enquiry",
    title: "Qualify an enquiry",
    description:
      "Record a qualified enquiry once you know what the person wants. Captures intent, timeline, budget " +
      "band and contact details, and reports what is still missing. Use when an enquiry looks like new " +
      "business rather than a support question.",
    schema: z.object({
      contact: z.string().min(1).describe("Email, phone number or handle — however they reached us"),
      channel: z.enum(CHANNELS),
      intent: z.string().min(1).describe("What they actually want, in one line"),
      timeline: z.string().optional().describe("When they need it, if stated"),
      budget: z.string().optional().describe("Budget band, only if they offered one"),
      notes: z.string().optional(),
    }),
    run: async ({ contact, channel, intent, timeline, budget, notes }) => {
      const row = await logInteraction({
        channel: channel as Channel,
        direction: "inbound",
        contact,
        body: [intent, timeline && `timeline: ${timeline}`, budget && `budget: ${budget}`, notes]
          .filter(Boolean).join(" | "),
        intent,
      });
      const missing = [!timeline && "timeline", !budget && "budget"].filter(Boolean);
      return [
        `Enquiry qualified and logged (id ${row.id}, store: ${backend()}).`,
        missing.length
          ? `Still missing: ${missing.join(", ")}. Ask at most two questions in your reply.`
          : `Fully qualified — no further questions needed.`,
      ].join(" ");
    },
  },

  {
    name: "escalate_case",
    title: "Escalate to a human team",
    description:
      "Hand a case to a human team with full context. Use for complaints, refunds, contractual or legal " +
      "matters, anything committing money, safety issues, an explicit request for a human, or a question " +
      "the knowledge base does not cover. The context field is mandatory — a handover without context is " +
      "worse than no handover.",
    schema: z.object({
      contact: z.string().min(1),
      channel: z.enum(CHANNELS),
      team: z.enum(TEAMS).describe("Finance=billing, Support=technical, Sales=new business, Management=legal/press/safety/unsure"),
      reason: z.string().min(1).describe("Why this needs a human, in one line"),
      context: z.string().min(20).describe(
        "Full context: what they asked, what was already answered, what remains open. At least a sentence.",
      ),
    }),
    run: async ({ contact, channel, team, reason, context }) => {
      const c = await openCase({ contact, channel: channel as Channel, team, reason, context });
      await logInteraction({
        channel: channel as Channel, direction: "inbound", contact,
        body: reason, intent: "escalation", escalated: true,
      });
      return `Case ${c.id} opened for ${team} (store: ${backend()}). Tell the customer plainly that a colleague is picking it up. Do not apologise at length.`;
    },
  },

  {
    name: "log_interaction",
    title: "Log an interaction",
    description:
      "Record one inbound or outbound message on any channel. Every interaction is logged — including " +
      "escalated ones. Call this for the reply you send, so the record is complete on both sides.",
    schema: z.object({
      contact: z.string().min(1),
      channel: z.enum(CHANNELS),
      direction: z.enum(["inbound", "outbound"]),
      body: z.string().min(1),
      intent: z.string().optional(),
    }),
    run: async (i) => {
      const row = await logInteraction(i);
      return `Logged ${i.direction} on ${i.channel} (id ${row.id}, store: ${backend()}).`;
    },
  },

  {
    name: "get_contact_history",
    title: "Get contact history",
    description:
      "Return recent interactions, optionally for one contact across every channel. Use before replying " +
      "so a person who already reached out by email is not treated as a stranger on WhatsApp — and to " +
      "spot a third repeat contact on an unresolved issue, which is an escalation trigger.",
    schema: z.object({
      contact: z.string().optional().describe("Omit to see all recent traffic"),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    run: async ({ contact, limit }) => {
      const rows = await recentInteractions(limit, contact);
      if (rows.length === 0) return `No interactions found (store: ${backend()}). This is a first contact.`;
      return rows
        .map((r) => `${r.created_at} [${r.channel}/${r.direction}] ${r.contact}${r.escalated ? " (escalated)" : ""}: ${r.body}`)
        .join("\n");
    },
  },

  {
    name: "list_open_cases",
    title: "List open escalations",
    description: "Show escalations still waiting on a human, newest first, with the team they were routed to.",
    schema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    run: async ({ limit }) => {
      const rows = await openCases(limit);
      if (rows.length === 0) return `No open cases (store: ${backend()}).`;
      return rows
        .map((c) => `${c.created_at} [${c.team}] ${c.contact} via ${c.channel} — ${c.reason}\n    context: ${c.context}`)
        .join("\n");
    },
  },
];

// ---------------------------------------------------------------------------
// Channel tools. Pull-based: Claude reads a channel when it wants to, and sends
// when it decides to. Every send is logged, so the record covers both sides.
// ---------------------------------------------------------------------------

TOOLS.push(
  {
    name: "read_channel",
    title: "Read a channel",
    description:
      "Fetch recent inbound messages from one channel: `gmail` (inbox), `gchat` (a Google Chat space) " +
      "or `slack` (the front office channel). Use to triage what has come in before replying. " +
      "For gchat, pass `space` — call with space omitted to list the spaces available.",
    schema: z.object({
      channel: z.enum(["gmail", "gchat", "slack"]),
      limit: z.number().int().min(1).max(50).default(10),
      space: z.string().optional().describe("gchat only: the space id or name. Omit to list spaces."),
      query: z.string().optional().describe("gmail only: a Gmail search query. Defaults to in:inbox."),
    }),
    run: async ({ channel, limit, space, query }) => {
      if (channel === "gmail") {
        const mails = await gmail.readInbox(limit, query ?? "in:inbox");
        if (!mails.length) return "Inbox is empty for that query.";
        return mails
          .map((m) => `[${m.date}] from ${m.from}\n  subject: ${m.subject}\n  ${m.snippet}\n  threadId=${m.threadId} messageId=${m.messageId ?? "-"}`)
          .join("\n\n");
      }

      if (channel === "gchat") {
        if (!space) {
          const spaces = await gchat.listSpaces();
          if (!spaces.length) return "No Google Chat spaces visible to this account.";
          return "Pass one of these as `space`:\n" + spaces.map((s) => `  ${s.name} — ${s.displayName}`).join("\n");
        }
        const msgs = await gchat.readSpace(space, limit);
        if (!msgs.length) return `No messages in ${space}.`;
        return msgs.map((m) => `[${m.createTime}] ${m.sender}: ${m.text}`).join("\n");
      }

      const msgs = await slack.readMessages(limit);
      if (!msgs.length) return `No messages in #${slack.ALLOWED_CHANNEL}.`;
      return msgs
        .map((m) => `[${new Date(Number(m.ts) * 1000).toISOString()}] ${m.userName}${m.isBot ? " (app)" : ""}: ${m.text}  ts=${m.ts}`)
        .join("\n");
    },
  },

  {
    name: "send_on_channel",
    title: "Send a reply on a channel",
    description:
      "Send a message as the front office on `gmail`, `gchat` or `slack`, and log it. This is " +
      "visible to a real person and cannot be recalled — show the customer the exact text and get " +
      "agreement before calling it. Read the operating contract first so the wording matches how we " +
      "speak everywhere else.",
    schema: z.object({
      channel: z.enum(["gmail", "gchat", "slack"]),
      body: z.string().min(1).describe("The exact message text to send"),
      to: z.string().optional().describe("gmail only: recipient address"),
      subject: z.string().optional().describe("gmail only: the subject being replied to"),
      threadId: z.string().optional().describe("gmail: threadId. slack: parent ts. gchat: thread name."),
      inReplyTo: z.string().optional().describe("gmail only: the Message-ID being replied to, for correct threading"),
      space: z.string().optional().describe("gchat only: the space to post in"),
    }),
    run: async ({ channel, body, to, subject, threadId, inReplyTo, space }) => {
      let ref: string;
      let contact: string;

      if (channel === "gmail") {
        if (!to) throw new Error("gmail requires `to`.");
        ref = await gmail.sendReply({ to, subject: subject ?? "(no subject)", body, threadId, inReplyTo });
        contact = to;
      } else if (channel === "gchat") {
        if (!space) throw new Error("gchat requires `space`. Call read_channel with no space to list them.");
        ref = await gchat.postToSpace(space, body, threadId);
        contact = space;
      } else {
        ref = await slack.sendMessage(body, threadId);
        contact = `#${slack.ALLOWED_CHANNEL}`;
      }

      await logInteraction({
        channel: channel as Channel, direction: "outbound", contact, body, intent: "reply",
      });
      return `Sent on ${channel} to ${contact} (ref ${ref}). Logged (store: ${backend()}).`;
    },
  },
);

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
