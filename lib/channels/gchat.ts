/**
 * Google Chat adapter.
 *
 * HARD CONSTRAINT: confined to ONE space, exactly as the Slack adapter is confined to one
 * channel. The credential can reach every space its owner belongs to — fourteen, here — so
 * the restriction has to live in code rather than in a prompt or a caller's discipline.
 * There is no space parameter on the tool surface, and the guard below refuses any other
 * name even if one is passed internally.
 */
import { google } from "googleapis";
import { googleAuth, googleError } from "./google";

/** The only space this app may ever touch. Stored in `spaces/<id>` form. */
export const ALLOWED_SPACE = normalize(
  process.env.GCHAT_SPACE ?? "spaces/AAQABsxe7jw",
);

/** Human label, for the console and for error copy. */
export const ALLOWED_SPACE_LABEL =
  process.env.GCHAT_SPACE_LABEL ?? "FO-01 Multi Channel Front Office Assistant";

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
      sender: m.sender?.displayName ?? m.sender?.name ?? "unknown",
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
