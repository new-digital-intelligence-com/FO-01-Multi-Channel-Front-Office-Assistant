/**
 * Google Chat adapter.
 *
 * HARD CONSTRAINT: confined to ONE space, exactly as the Slack adapter is confined to one
 * channel. The credential can reach every space its owner belongs to — fourteen, here — so
 * the restriction has to live in code rather than in a prompt or a caller's discipline.
 * There is no space parameter on the tool surface, and the guard below refuses any other
 * name even if one is passed internally.
 */
import { google, type chat_v1 } from "googleapis";
import { googleAuth, googleError } from "./google";

/** The only space this app may ever touch. Stored in `spaces/<id>` form. */
export const ALLOWED_SPACE = normalize(
  process.env.GCHAT_SPACE ?? "spaces/AAQABsxe7jw",
);

/** Human label, for the console and for error copy. */
export const ALLOWED_SPACE_LABEL =
  process.env.GCHAT_SPACE_LABEL ?? "FO-01 Multi Channel Front Office Assistant";

/**
 * An incoming webhook posts to one space without a configured Chat app, without OAuth, and
 * without Google's app-verification path — the Chat API's `spaces.messages.create` needs all
 * of that, and answers "Chat app not found" until the Configuration tab is filled in.
 *
 * It also makes the single-space restriction structural rather than merely enforced: a
 * webhook URL is bound to the space it was created in, so there is no other space it could
 * reach even if the code asked.
 *
 * Reading still uses the signed-in viewer's credential, which needs none of this.
 */
const WEBHOOK_URL = process.env.GCHAT_WEBHOOK_URL;
export const webhookConfigured = Boolean(WEBHOOK_URL);

function normalize(id: string): string {
  const trimmed = id.trim();
  return trimmed.startsWith("spaces/") ? trimmed : `spaces/${trimmed}`;
}

/**
 * Rejects anything that is not the allowed space before a request is made, so a wrong id
 * cannot reach another conversation.
 */
export function resolveSpace(space?: string): string {
  if (space == null || space === "") return ALLOWED_SPACE;
  const wanted = normalize(space);
  if (wanted !== ALLOWED_SPACE) {
    throw new Error(
      `Refused: this app may only act in ${ALLOWED_SPACE} (${ALLOWED_SPACE_LABEL}), ` +
        `not ${wanted}. This is a hard restriction, not a preference.`,
    );
  }
  return ALLOWED_SPACE;
}

async function chat() {
  return google.chat({ version: "v1", auth: await googleAuth() });
}

export interface ChatMessage {
  name: string;
  sender: string;
  text: string;
  createTime: string;
  thread?: string;
  /** Our own webhook posts arrive as BOT. The autonomous loop must never answer these. */
  isApp: boolean;
}

/** Confirms the app can see its one space. Never lists the others. */
export async function describeSpace(): Promise<{ id: string; name: string }> {
  try {
    const res = await (await chat()).spaces.get({ name: ALLOWED_SPACE });
    return {
      id: res.data.name ?? ALLOWED_SPACE,
      name: res.data.displayName ?? ALLOWED_SPACE_LABEL,
    };
  } catch (err) {
    throw googleError(err, "Chat space lookup");
  }
}

export async function readSpace(limit = 20, space?: string): Promise<ChatMessage[]> {
  const parent = resolveSpace(space);
  try {
    const res = await (await chat()).spaces.messages.list({ parent, pageSize: limit });
    return (res.data.messages ?? []).map((m) => ({
      name: m.name ?? "",
      // Webhook posts carry no displayName, only a numeric id and type BOT. Showing the raw
      // id reads as a bug; naming it matches how the Slack adapter labels the app.
      sender:
        m.sender?.displayName ||
        (m.sender?.type === "BOT" ? "FO-01 (app)" : m.sender?.name) ||
        "unknown",
      isApp: m.sender?.type === "BOT",
      text: m.text ?? "",
      createTime: m.createTime ?? "",
      thread: m.thread?.name ?? undefined,
    }));
  } catch (err) {
    throw googleError(err, "Chat read");
  }
}

export async function postToSpace(text: string, thread?: string, space?: string): Promise<string> {
  const parent = resolveSpace(space);

  if (WEBHOOK_URL) {
    // threadKey keeps replies grouped; without it every post starts a new thread.
    const url = new URL(WEBHOOK_URL);
    if (thread) {
      url.searchParams.set("threadKey", thread);
      url.searchParams.set("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD");
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(
        `Chat post failed (${res.status}) via the space webhook: ${raw.slice(0, 300)}` +
          (res.status === 404 || res.status === 403
            ? " — the webhook may have been deleted, or GCHAT_WEBHOOK_URL is wrong."
            : ""),
      );
    }

    try {
      return (JSON.parse(raw) as { name?: string }).name ?? "posted";
    } catch {
      return "posted";
    }
  }

  try {
    const res = await (await chat()).spaces.messages.create({
      parent,
      requestBody: { text, ...(thread ? { thread: { name: thread } } : {}) },
    });
    return res.data.name ?? "";
  } catch (err) {
    throw googleError(err, "Chat post");
  }
}
