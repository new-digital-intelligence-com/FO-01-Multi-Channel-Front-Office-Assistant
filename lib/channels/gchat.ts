/**
 * Google Chat adapter.
 *
 * Read messages in a space and post to it. With user OAuth this only reaches spaces the
 * authenticated user is a member of — that is a limit of the credential, not a bug.
 */
import { google } from "googleapis";
import { googleAuth, googleError } from "./google";

async function chat() {
  return google.chat({ version: "v1", auth: await googleAuth() });
}

export interface Space {
  name: string;
  displayName: string;
}

export interface ChatMessage {
  name: string;
  sender: string;
  text: string;
  createTime: string;
  thread?: string;
}

export async function listSpaces(): Promise<Space[]> {
  try {
    const res = await (await chat()).spaces.list({ pageSize: 50 });
    return (res.data.spaces ?? []).map((s) => ({
      name: s.name ?? "",
      displayName: s.displayName ?? s.name ?? "(direct message)",
    }));
  } catch (err) {
    throw googleError(err, "Chat spaces list");
  }
}

export async function readSpace(space: string, limit = 20): Promise<ChatMessage[]> {
  try {
    const parent = space.startsWith("spaces/") ? space : `spaces/${space}`;
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

export async function postToSpace(space: string, text: string, thread?: string): Promise<string> {
  try {
    const parent = space.startsWith("spaces/") ? space : `spaces/${space}`;
    const res = await (await chat()).spaces.messages.create({
      parent,
      requestBody: { text, ...(thread ? { thread: { name: thread } } : {}) },
    });
    return res.data.name ?? "";
  } catch (err) {
    throw googleError(err, "Chat post");
  }
}
