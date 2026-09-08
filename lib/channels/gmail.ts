/**
 * Gmail channel adapter. Read recent threads, send a threaded reply.
 *
 * Pull-based: Claude asks for the inbox when it wants it. No Pub/Sub watch, no public
 * webhook — those belong to the autonomous 24/7 path, which is not built yet.
 */
import { google } from "googleapis";
import { googleAuth, googleError } from "./google";

async function gmail() {
  return google.gmail({ version: "v1", auth: await googleAuth() });
}

export interface Mail {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  messageId?: string;
}

function header(headers: { name?: string | null; value?: string | null }[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export async function readInbox(limit = 10, query = "in:inbox"): Promise<Mail[]> {
  try {
    const api = await gmail();
    const list = await api.users.messages.list({ userId: "me", q: query, maxResults: limit });
    const ids = list.data.messages ?? [];

    const mails: Mail[] = [];
    for (const { id } of ids) {
      if (!id) continue;
      const msg = await api.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date", "Message-ID"],
      });
      const h = msg.data.payload?.headers ?? undefined;
      mails.push({
        id,
        threadId: msg.data.threadId ?? "",
        from: header(h, "From"),
        subject: header(h, "Subject"),
        date: header(h, "Date"),
        snippet: msg.data.snippet ?? "",
        messageId: header(h, "Message-ID") || undefined,
      });
    }
    return mails;
  } catch (err) {
    throw googleError(err, "Gmail read");
  }
}

/**
 * Replies inside the original thread. Gmail only threads correctly when the reply carries
 * In-Reply-To and References — without them it shows up as a new conversation, which reads
 * to the customer as if nobody read their mail.
 */
export async function sendReply(opts: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}): Promise<string> {
  try {
    const subject = opts.subject.toLowerCase().startsWith("re:")
      ? opts.subject
      : `Re: ${opts.subject}`;

    const lines = [
      `To: ${opts.to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      ...(opts.inReplyTo
        ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${opts.inReplyTo}`]
        : []),
      "",
      opts.body,
    ];

    const raw = Buffer.from(lines.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const api = await gmail();
    const res = await api.users.messages.send({
      userId: "me",
      requestBody: { raw, ...(opts.threadId ? { threadId: opts.threadId } : {}) },
    });
    return res.data.id ?? "";
  } catch (err) {
    throw googleError(err, "Gmail send");
  }
}
