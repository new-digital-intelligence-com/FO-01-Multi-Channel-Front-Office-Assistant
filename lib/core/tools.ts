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
import * as gchat from "@/lib/channels/gchat";
import * as slack from "@/lib/channels/slack";

const CHANNELS = ["phone", "email", "webchat", "gchat", "whatsapp", "slack", "claude"] as const;
const TEAMS = ["Finance", "Support", "Sales", "Management"] as const;

/**
 * A tool answers with prose for the model, and optionally the same answer as data.
 *
 * The prose is what Claude reads; `data` is what a UI renders. Returning both from one
 * handler is what lets an in-Claude app and a chat conversation show the same truth without
 * a second code path — the app is not re-deriving anything, it is reading the same result.
 */
export type ToolAnswer = string | { text: string; data: unknown };

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /**
   * Whether Claude gets this tool over MCP.
   *
   * The connector is the capability layer: reading and sending on a channel, and writing to
   * the log. The judgement — which questions are answerable, how to sound, when to escalate
   * and to whom — lives in the skill, so the tools that only encode judgement are `false`
   * here and stay on the HTTP API for the console's own UI.
   */
  mcp?: boolean;
  schema: z.ZodObject<z.ZodRawShape>;
  /** Optional JSON Schema for `data`. MCP requires it before structuredContent is allowed. */
  outputSchema?: z.ZodObject<z.ZodRawShape>;
  run: (input: any) => Promise<ToolAnswer>;
}

export const CONTRACT = readFileSync(join(process.cwd(), "lib/core/rules.md"), "utf8");

export const TOOLS: ToolDef[] = [
  {
    name: "get_operating_contract",
    title: "Get operating contract",
    mcp: false,
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
    mcp: false,
    description:
      "Look up an inbound question in the front office knowledge base. Use for hours, location, pricing, " +
      "lead times, booking and service scope. Returns the approved answer, or reports that the question is " +
      "NOT covered — in which case escalate rather than improvising an answer.",
    schema: z.object({
      question: z.string().min(1).describe("The customer's question, in their own words"),
    }),
    outputSchema: z.object({
      verdict: z.enum(["covered", "escalate", "not_covered"]),
      answer: z.string().nullable(),
      escalateTo: z.string().nullable(),
      entryId: z.string().nullable(),
      score: z.number(),
    }),
    run: async ({ question }) => {
      const m = lookup(question);
      if (m.escalateTo) {
        return {
          text: [
            `ESCALATION TRIGGER matched — this is not an FAQ.`,
            `Do not answer it, even if it resembles a question we cover.`,
            `Escalate to ${m.escalateTo} with escalate_case.`,
          ].join(" "),
          data: { verdict: "escalate", answer: null, escalateTo: m.escalateTo, entryId: null, score: 0 },
        };
      }
      if (!m.covered) {
        return {
          text: [
            `NOT COVERED by the knowledge base (best match "${m.entry?.id ?? "none"}", score ${m.score}).`,
            `Do not improvise an answer.`,
            `Escalate, or ask the customer one clarifying question.`,
          ].join(" "),
          data: { verdict: "not_covered", answer: null, escalateTo: null, entryId: m.entry?.id ?? null, score: m.score },
        };
      }
      return {
        text: `COVERED (${m.entry!.id}, score ${m.score}). Approved answer:\n\n${m.entry!.a}`,
        data: { verdict: "covered", answer: m.entry!.a, escalateTo: null, entryId: m.entry!.id, score: m.score },
      };
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
      ref: z.string().optional().describe("The source message's id on its channel, if it has one"),
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
    outputSchema: z.object({
      store: z.string(),
      count: z.number(),
      interactions: z.array(z.object({
        id: z.string(), created_at: z.string(), channel: z.string(), direction: z.string(),
        contact: z.string(), body: z.string(), intent: z.string().nullable(), escalated: z.boolean(),
      })),
    }),
    run: async ({ contact, limit }) => {
      const rows = await recentInteractions(limit, contact);
      const data = {
        store: backend(),
        count: rows.length,
        interactions: rows.map((r) => ({
          id: r.id, created_at: r.created_at, channel: r.channel, direction: r.direction,
          contact: r.contact, body: r.body, intent: r.intent ?? null, escalated: Boolean(r.escalated),
        })),
      };
      const text = rows.length === 0
        ? `No interactions found (store: ${backend()}). This is a first contact.`
        : rows.map((r) => `${r.created_at} [${r.channel}/${r.direction}] ${r.contact}${r.escalated ? " (escalated)" : ""}: ${r.body}`).join("\n");
      return { text, data };
    },
  },

  {
    name: "list_open_cases",
    title: "List open escalations",
    description: "Show escalations still waiting on a human, newest first, with the team they were routed to.",
    schema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    outputSchema: z.object({
      store: z.string(),
      count: z.number(),
      cases: z.array(z.object({
        id: z.string(), created_at: z.string(), contact: z.string(), channel: z.string(),
        team: z.string(), reason: z.string(), context: z.string(), status: z.string(),
      })),
    }),
    run: async ({ limit }) => {
      const rows = await openCases(limit);
      const data = {
        store: backend(),
        count: rows.length,
        cases: rows.map((c) => ({
          id: c.id, created_at: c.created_at, contact: c.contact, channel: c.channel,
          team: c.team, reason: c.reason, context: c.context, status: c.status,
        })),
      };
      const text = rows.length === 0
        ? `No open cases (store: ${backend()}).`
        : rows.map((c) => `${c.created_at} [${c.team}] ${c.contact} via ${c.channel} — ${c.reason}\n    context: ${c.context}`).join("\n");
      return { text, data };
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
      "Fetch recent inbound messages from one channel. `channel` must be `slack` or `gchat` — " +
      "those are the only connected channels, and there is no mailbox to read: `gmail` and `email` " +
      "are validation errors, not fallbacks. Each channel is confined to a single conversation, so " +
      "there is no channel or space to choose. Use to triage what has come in before replying.",
    schema: z.object({
      channel: z.enum(["gchat", "slack"]),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    outputSchema: z.object({
      channel: z.string(),
      kind: z.enum(["messages", "spaces"]),
      count: z.number(),
      messages: z.array(z.object({
        ref: z.string(), at: z.string(), from: z.string(),
        subject: z.string().nullable(), text: z.string(), threadRef: z.string().nullable(),
      })),
      spaces: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
    run: async ({ channel, limit }) => {
      if (channel === "gchat") {
        const msgs = await gchat.readSpace(limit);
        const data = {
          channel, kind: "messages" as const, count: msgs.length,
          spaces: [{ id: gchat.ALLOWED_SPACE, name: gchat.ALLOWED_SPACE_LABEL }],
          messages: msgs.map((m) => ({
            ref: m.name, at: m.createTime, from: m.sender,
            subject: null, text: m.text, threadRef: m.thread ?? null,
          })),
        };
        const text = msgs.length === 0
          ? `No messages in ${gchat.ALLOWED_SPACE_LABEL}.`
          : msgs.map((m) => `[${m.createTime}] ${m.sender}: ${m.text}`).join("\n");
        return { text, data };
      }

      const msgs = await slack.readMessages(limit);
      const data = {
        channel, kind: "messages" as const, count: msgs.length, spaces: [],
        messages: msgs.map((m) => ({
          ref: m.ts, at: new Date(Number(m.ts) * 1000).toISOString(),
          from: m.userName + (m.isBot ? " (app)" : ""),
          subject: null, text: m.text, threadRef: m.threadTs ?? null,
        })),
      };
      const text = msgs.length === 0 ? `No messages in #${slack.ALLOWED_CHANNEL}.`
        : msgs.map((m) => `[${new Date(Number(m.ts) * 1000).toISOString()}] ${m.userName}${m.isBot ? " (app)" : ""}: ${m.text}  ts=${m.ts}`).join("\n");
      return { text, data };
    },
  },

  {
    name: "send_on_channel",
    title: "Send a reply on a channel",
    description:
      "Send a message as the front office on `gchat` or `slack`, and log it. This is " +
      "visible to a real person and cannot be recalled — show the customer the exact text and get " +
      "agreement before calling it. Read the operating contract first so the wording matches how we " +
      "speak everywhere else.",
    schema: z.object({
      channel: z.enum(["gchat", "slack"]),
      body: z.string().min(1).describe("The exact message text to send"),
      threadId: z.string().optional().describe("slack: parent ts. gchat: thread name."),
    }),
    run: async ({ channel, body, threadId }) => {
      let ref: string;
      let contact: string;

      if (channel === "gchat") {
        ref = await gchat.postToSpace(body, threadId);
        contact = gchat.ALLOWED_SPACE_LABEL;
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
