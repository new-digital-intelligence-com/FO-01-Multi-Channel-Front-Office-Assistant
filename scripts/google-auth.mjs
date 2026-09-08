/**
 * One-time: turn GOOGLE_CLIENT_ID/SECRET into a refresh token for the Sheets API.
 *
 *   node scripts/google-auth.mjs
 *
 * Requires http://localhost:53682/callback to be listed as an Authorized redirect URI on the
 * OAuth client in Google Cloud console -> APIs & Services -> Credentials.
 */
import { createServer } from "node:http";
import { google } from "googleapis";
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const REDIRECT = "http://localhost:53682/callback";
const client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, REDIRECT);

if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing from .env.local");
  process.exit(1);
}

const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh_token even if previously granted
  scope: [
    "https://www.googleapis.com/auth/spreadsheets",   // the interaction log
    "https://www.googleapis.com/auth/drive.metadata.readonly", // find the log by name if it is replaced
    "https://www.googleapis.com/auth/chat.spaces.readonly",
    "https://www.googleapis.com/auth/chat.messages",
  ],
});

console.log("\nOpen this URL, sign in, allow:\n\n" + url + "\n");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return res.end();
  const code = new URL(req.url, REDIRECT).searchParams.get("code");
  if (!code) {
    res.end("No code in callback.");
    return;
  }
  try {
    const { tokens } = await client.getToken(code);
    res.end("Done. You can close this tab and go back to the terminal.");
    if (tokens.refresh_token) {
      // Replace the existing line rather than appending, so re-running does not leave
      // two GOOGLE_REFRESH_TOKEN entries with the later (stale) one winning.
      const current = readFileSync(".env.local", "utf8");
      const line = `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
      const next = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(current)
        ? current.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, line)
        : current.trimEnd() + "\n" + line + "\n";
      writeFileSync(".env.local", next);
      console.log("\nrefresh token written to .env.local\n");
    } else {
      console.log("\nNo refresh_token returned — revoke the app's access and re-run.\n");
    }
  } catch (err) {
    res.end("Token exchange failed: " + err.message);
    console.error(err.message);
  }
  server.close();
  process.exit(0);
});
server.listen(53682, () => console.log("waiting for the callback on " + REDIRECT + " ...\n"));
