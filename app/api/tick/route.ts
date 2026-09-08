/**
 * The autonomous loop: the only path that answers when nobody is watching.
 *
 * Called on a schedule by an external pinger (cron-job.org, GitHub Actions, Vercel Cron on
 * Pro). Reads both channels, answers or escalates anything new, and logs everything.
 *
 * Pull rather than push: Slack Events needs an app reinstall and Google Chat needs a
 * configured Chat app, while polling needs neither and a minute of latency is invisible to
 * a customer.
 *
 * Answering twice is the failure that matters here, so every inbound message is recorded
 * with its source `ref` and skipped if that ref is already in the log — which holds across
 * restarts and overlapping ticks alike.
 */
import { decide, agentConfigured, type Inbound } from "@/lib/core/agent";
import { handledRefs, logInteraction, openCase, backend, type Channel } from "@/lib/db/store";
import * as slack from "@/lib/channels/slack";
import * as gchat from "@/lib/channels/gchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** At most this many messages per tick, so a busy channel cannot run up a bill unattended. */
const MAX_PER_TICK = 5;
/** Ignore anything older than this on the first run, so a backlog is not answered at once. */
const MAX_AGE_MS = 60 * 60 * 1000;

interface Candidate {
  channel: "slack" | "gchat";
  ref: string;
  from: string;
  text: string;
  at: number;
  threadRef?: string;
}

function authorized(req: Request): boolean {
  const secret = process.env.TICK_SECRET;
  // Without a secret the endpoint is open — fine locally, stated plainly in the response.
  if (!secret) return true;
  const header = req.headers.get("x-tick-secret");
  const query = new URL(req.url).searchParams.get("secret");
  return header === secret || query === secret;
}

async function collect(): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const candidates: Candidate[] = [];
  const errors: string[] = [];

  try {
    for (const m of await slack.readMessages(20)) {
      if (m.isBot) continue; // never answer ourselves
      candidates.push({
        channel: "slack",
        ref: m.ts,
        from: m.userName,
        text: m.text,
        at: Number(m.ts) * 1000,
        threadRef: m.threadTs,
      });
    }
  } catch (err) {
    errors.push(`slack: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    for (const m of await gchat.readSpace(20)) {
      if (m.isApp) continue;
      candidates.push({
        channel: "gchat",
        ref: m.name,
        from: m.sender,
        text: m.text,
        at: Date.parse(m.createTime) || 0,
        threadRef: m.thread,
      });
    }
  } catch (err) {
    errors.push(`gchat: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { candidates, errors };
}

async function handle(c: Candidate) {
  const input: Inbound = { channel: c.channel, from: c.from, text: c.text };
  const d = await decide(input);

  // Record the inbound first. If sending fails afterwards the message is still marked
  // handled — answering twice is worse than not answering, and the log shows what happened.
  await logInteraction({
    channel: c.channel as Channel,
    direction: "inbound",
    contact: c.from,
    body: c.text,
    intent: d.intent,
    escalated: d.action === "escalate",
    ref: c.ref,
  });

  if (d.action === "ignore") {
    return { ...c, action: d.action, intent: d.intent, sent: false };
  }

  if (d.action === "escalate") {
    await openCase({
      contact: c.from,
      channel: c.channel as Channel,
      team: d.team ?? "Management",
      reason: d.reason ?? d.intent,
      context: d.context ?? `On ${c.channel}, ${c.from} wrote: "${c.text}".`,
    });
  }

  let sent = false;
  let sendError: string | undefined;
  if (d.reply.trim()) {
    try {
      if (c.channel === "slack") await slack.sendMessage(d.reply, c.threadRef);
      else await gchat.postToSpace(d.reply, c.threadRef);
      sent = true;
      await logInteraction({
        channel: c.channel as Channel,
        direction: "outbound",
        contact: c.from,
        body: d.reply,
        intent: d.intent,
      });
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }
  }

  return { ...c, action: d.action, intent: d.intent, team: d.team, sent, sendError };
}

async function tick(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "Bad or missing tick secret." }, { status: 401 });
  }
  if (!agentConfigured) {
    return Response.json(
      { ok: false, error: "ANTHROPIC_API_KEY is not set — nothing can be decided." },
      { status: 503 },
    );
  }

  const started = Date.now();
  const { candidates, errors } = await collect();
  const seen = await handledRefs();

  const fresh = candidates
    .filter((c) => !seen.has(c.ref))
    .filter((c) => started - c.at < MAX_AGE_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_PER_TICK);

  const handled = [];
  for (const c of fresh) {
    try {
      handled.push(await handle(c));
    } catch (err) {
      errors.push(`${c.channel} ${c.ref}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return Response.json({
    ok: errors.length === 0,
    store: backend(),
    open: !process.env.TICK_SECRET,
    scanned: candidates.length,
    skipped: candidates.length - fresh.length,
    handled,
    errors,
    ms: Date.now() - started,
  });
}

export async function GET(req: Request) {
  return tick(req);
}
export async function POST(req: Request) {
  return tick(req);
}
