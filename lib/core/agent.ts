/**
 * The autonomous decision, for when nobody is watching.
 *
 * The console and the Claude skill both have a person or a model in the loop. This is the
 * path that answers at 3am: it reads the same rules and the same knowledge base and decides
 * one of three things — answer, escalate, or leave it alone.
 *
 * It is deliberately narrow. It does not choose whether to send; the caller does that. It
 * cannot invent a channel, and it is given the approved answers rather than asked to recall
 * them, so a wrong price is a knowledge-base bug rather than a hallucination.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import kb from "./knowledge-base.json";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

export const agentConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — the autonomous loop cannot run.");
    }
    client = new Anthropic();
  }
  return client;
}

export type Action = "answer" | "escalate" | "ignore";
export type Team = "Finance" | "Support" | "Sales" | "Management";

export interface Decision {
  action: Action;
  intent: string;
  reply: string;
  team?: Team;
  reason?: string;
  context?: string;
}

const DECIDE_TOOL: Anthropic.Tool = {
  name: "decide",
  description: "Record the decision for this inbound message.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: {
        type: "string",
        enum: ["answer", "escalate", "ignore"],
        description:
          "answer: the knowledge base covers it. escalate: a trigger fired or it is outside " +
          "the knowledge base and a wrong answer would cost us. ignore: chatter, a greeting " +
          "with no question, or something already handled.",
      },
      intent: { type: "string", description: "What they want, in a few words." },
      reply: {
        type: "string",
        description:
          "The exact message to send, in the customer's language. Empty string when the " +
          "action is ignore. For escalate, tell them a colleague is picking it up — briefly, " +
          "with no long apology and no callback time.",
      },
      team: {
        type: "string",
        enum: ["Finance", "Support", "Sales", "Management"],
        description: "Required when escalating.",
      },
      reason: { type: "string", description: "Why it is being escalated, one line." },
      context: {
        type: "string",
        description:
          "Required when escalating, at least a sentence: the channel, what they asked, " +
          "what was already answered, and what remains open. Written for the colleague who " +
          "picks it up cold.",
      },
    },
    required: ["action", "intent", "reply"],
  },
};

function systemPrompt(): string {
  const rules = readFileSync(join(process.cwd(), "lib/core/rules.md"), "utf8");

  const answers = kb.entries
    .map((e) => `- ${e.id} — asked as ${e.q.map((q) => `"${q}"`).join(", ")}\n  ANSWER: ${e.a}`)
    .join("\n");

  const triggers = kb.triggers
    .map((t) => `- ${t.team}: ${t.terms.join(", ")}`)
    .join("\n");

  return `You are the front office assistant. You are answering a real customer, unsupervised.

${rules}

# The approved answers — the ONLY things you may state as fact

${answers}

Use the approved answer's wording. You may adapt register and translate it into the
customer's language, never the facts. If the question is not in this list, you do not know
the answer: escalate. Never infer a price, a date, an address or a policy from anything else
you know.

# Escalation triggers — these override the answers above

${triggers}

A message matching any of these is not an FAQ, however much it resembles one. Escalate it
without attempting an answer.

# Deciding

- answer — the knowledge base covers it. Put the approved answer in \`reply\`.
- escalate — a trigger fired, or it is outside the knowledge base and a wrong answer would
  cost us. \`reply\` tells them a colleague is picking it up. \`team\`, \`reason\` and
  \`context\` are required.
- ignore — chatter, a bare greeting with no question, or something already answered in the
  thread. \`reply\` is empty.

When in doubt, escalate. An unnecessary escalation costs a colleague a minute; a wrong answer
costs a customer.

Call the \`decide\` tool exactly once. Write \`reply\` in the language the customer wrote in.`;
}

export interface Inbound {
  channel: "slack" | "gchat";
  from: string;
  text: string;
  history?: string;
}

export async function decide(msg: Inbound): Promise<Decision> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt(),
    tools: [DECIDE_TOOL],
    tool_choice: { type: "tool", name: "decide" },
    messages: [
      {
        role: "user",
        content:
          `Channel: ${msg.channel}\nFrom: ${msg.from}\n` +
          (msg.history ? `\nWhat this person has asked before:\n${msg.history}\n` : "\nNo prior contact.\n") +
          `\nTheir message:\n${msg.text}`,
      },
    ],
  });

  const call = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "decide",
  );
  if (!call) {
    throw new Error("The model did not record a decision.");
  }

  const d = call.input as Decision;

  // A malformed escalation is worse than none: it reaches a colleague with no story.
  if (d.action === "escalate" && (!d.team || !d.context || d.context.length < 20)) {
    return {
      ...d,
      action: "escalate",
      team: d.team ?? "Management",
      reason: d.reason ?? "Escalated without a stated reason.",
      context:
        d.context && d.context.length >= 20
          ? d.context
          : `On ${msg.channel}, ${msg.from} wrote: "${msg.text}". Nothing was answered. The model escalated without full context.`,
    };
  }
  return d;
}
