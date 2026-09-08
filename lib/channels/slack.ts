/**
 * Slack channel adapter.
 *
 * HARD CONSTRAINT: this app is confined to ONE channel. The operator asked for it explicitly,
 * and the bot token's scopes are workspace-wide, so the restriction has to live here in code
 * rather than in a prompt a model could talk itself out of. Every read and every write
 * resolves the channel name to an id and refuses anything else.
 *
 * Read + send only. No Events API, no Socket Mode, no public URL — Claude pulls on demand.
 */
const TOKEN = process.env.SLACK_BOT_TOKEN;
/** The only channel this app may ever touch. */
export const ALLOWED_CHANNEL = process.env.SLACK_CHANNEL ?? "ai-employee-fo-01-multi-channel-front-office-assistant";
/**
 * Pinning the id means the channel is never looked up, so no other channel is read even as
 * metadata. Without it the name has to be resolved by listing conversations, which reads
 * every channel the bot can see.
 */
const ALLOWED_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

export const slackConfigured = Boolean(TOKEN);

interface SlackResponse {
  ok: boolean;
  error?: string;
  [k: string]: unknown;
}

async function api(method: string, body: Record<string, unknown> = {}): Promise<SlackResponse> {
  if (!TOKEN) {
    throw new Error(
      "Slack is not configured. Set SLACK_BOT_TOKEN to a bot token (starts with `xoxb-`). " +
        "An app-configuration token (`xoxe.xoxp-`) cannot read or post messages.",
    );
  }
  // Form encoding, not JSON. Several read methods (users.info among them) ignore a JSON
  // body entirely and answer as though the argument were absent — users.info returns
  // `user_not_found` for a user that plainly exists. Form encoding works for every method
  // we call here, so use it throughout rather than per-method.
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: form,
  });
  const json = (await res.json()) as SlackResponse;
  if (!json.ok) {
    const hint =
      json.error === "missing_scope"
        ? " — reinstall the app with the scope it names"
        : json.error === "not_in_channel"
          ? ` — invite the bot with \`/invite @FO-01\` in #${ALLOWED_CHANNEL}`
          : json.error === "invalid_auth" || json.error === "not_authed"
            ? " — SLACK_BOT_TOKEN is wrong or expired"
            : "";
    throw new Error(`Slack ${method} failed: ${json.error}${hint}`);
  }
  return json;
}

interface Conversation {
  id: string;
  name: string;
}

let channelIdCache: string | null = null;

/**
 * Resolves the one allowed channel to its id. Anything not matching ALLOWED_CHANNEL is
 * rejected before a request is made, so a wrong name cannot reach another channel.
 */
export async function resolveChannel(name?: string): Promise<string> {
  const wanted = (name ?? ALLOWED_CHANNEL).replace(/^#/, "");
  if (wanted !== ALLOWED_CHANNEL) {
    throw new Error(
      `Refused: this app may only act in #${ALLOWED_CHANNEL}, not #${wanted}. ` +
        `This is a hard restriction, not a preference.`,
    );
  }
  if (ALLOWED_CHANNEL_ID) return ALLOWED_CHANNEL_ID;
  if (channelIdCache) return channelIdCache;

  // Falling back to a lookup. This enumerates channels the bot can see — set
  // SLACK_CHANNEL_ID to avoid it entirely.
  let cursor: string | undefined;
  do {
    const res = await api("conversations.list", {
      types: "public_channel,private_channel",
      limit: 200,
      exclude_archived: true,
      ...(cursor ? { cursor } : {}),
    });
    const found = (res.channels as Conversation[]).find((c) => c.name === ALLOWED_CHANNEL);
    if (found) {
      channelIdCache = found.id;
      return found.id;
    }
    cursor = (res.response_metadata as { next_cursor?: string } | undefined)?.next_cursor || undefined;
  } while (cursor);

  throw new Error(
    `Channel #${ALLOWED_CHANNEL} not found. Either it does not exist, or the bot has not been ` +
      `invited to it — run \`/invite @FO-01\` in that channel.`,
  );
}

export interface SlackMessage {
  ts: string;
  user: string;
  userName: string;
  text: string;
  threadTs?: string;
  isBot: boolean;
}

const userNames = new Map<string, string>();

async function userName(id: string): Promise<string> {
  if (!id) return "unknown";
  const hit = userNames.get(id);
  if (hit) return hit;
  try {
    const res = await api("users.info", { user: id });
    const u = res.user as { real_name?: string; name?: string };
    const name = u.real_name ?? u.name ?? id;
    userNames.set(id, name);
    return name;
  } catch (err) {
    // A missing users:read scope should not break message reading, but the raw id is a
    // poor thing to show — remember it so the failure is visible once, not per message.
    console.warn(`slack users.info failed for ${id}:`, (err as Error).message);
    return id;
  }
}

interface RawSlackMessage {
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
  reply_count?: number;
}

/**
 * Recent messages, **including replies inside threads**.
 *
 * `conversations.history` returns only top-level messages — a thread reply never appears in
 * it, however recent. Reading history alone means a question asked in a thread is invisible,
 * which is exactly where a follow-up question lands. So every thread in the window is
 * expanded with `conversations.replies`.
 */
export async function readMessages(limit = 20): Promise<SlackMessage[]> {
  const channel = await resolveChannel();
  const res = await api("conversations.history", { channel, limit });
  const raw = (res.messages as RawSlackMessage[]) ?? [];

  const byTs = new Map<string, RawSlackMessage>();
  for (const m of raw) byTs.set(m.ts, m);

  // Expand every thread. The parent comes back again in the replies list; the map dedupes it.
  for (const m of raw) {
    const hasThread = (m.reply_count ?? 0) > 0 || (m.thread_ts && m.thread_ts === m.ts);
    if (!hasThread) continue;
    try {
      const r = await api("conversations.replies", { channel, ts: m.ts, limit: 50 });
      for (const reply of (r.messages as RawSlackMessage[]) ?? []) byTs.set(reply.ts, reply);
    } catch (err) {
      // One unreadable thread should not hide the rest of the channel.
      console.warn(`slack conversations.replies failed for ${m.ts}:`, (err as Error).message);
    }
  }

  const msgs: SlackMessage[] = [];
  for (const m of [...byTs.values()].sort((a, b) => Number(a.ts) - Number(b.ts))) {
    if (m.subtype === "channel_join" || m.subtype === "channel_leave") continue;
    msgs.push({
      ts: m.ts,
      user: m.user ?? "",
      userName: m.user ? await userName(m.user) : "app",
      text: m.text ?? "",
      threadTs: m.thread_ts,
      isBot: Boolean(m.bot_id),
    });
  }
  return msgs; // oldest first reads like a conversation
}

export async function sendMessage(text: string, threadTs?: string): Promise<string> {
  const channel = await resolveChannel();
  const res = await api("chat.postMessage", {
    channel,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
  return res.ts as string;
}
