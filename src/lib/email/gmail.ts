import type { Account } from "../accounts";
import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { decrypt, encrypt } from "../crypto";
import { getKv, setKv } from "../settings";

// Read-only use: phase 1 never calls messages.send. The send scope is requested now so phase 2 needs no reconsent.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];
const BODY_CAP = 20_000;
export const STATE_COOKIE = "gmail_oauth_state";
export const MAX_PER_RUN = 200; // keeps "Sync now" under ~60 s; the next run continues from where this one stopped

export type RawEmail = { id: string; threadId: string; from: string; subject: string; snippet: string; body: string; receivedAt: string };

export const appUrl = () => process.env.APP_URL || "http://localhost:3000";

export const oauthClient = () =>
  new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${appUrl()}/api/gmail/callback`);

export const authUrl = (state: string): string =>
  oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES, state });

export async function exchangeCode(account: Account, code: string): Promise<void> {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.refresh_token) {
    setKv(account, "gmailError", "Google did not return a refresh token — remove the app's access in your Google account and reconnect");
    return;
  }
  setKv(account, "gmailToken", encrypt(tokens.refresh_token));
  setKv(account, "gmailError", null);
}

const header = (p: gmail_v1.Schema$MessagePart | undefined, name: string) =>
  p?.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? "";

// First text/plain part, depth-first.
function plainText(p: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!p) return null;
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) {
    const t = plainText(c);
    if (t !== null) return t;
  }
  return null;
}

const toRaw = (m: gmail_v1.Schema$Message): RawEmail | null => {
  const ms = Number(m.internalDate);
  if (!m.id || !m.internalDate || !Number.isFinite(ms)) return null; // unusable date: skip rather than fail the whole sync
  return {
    id: m.id,
    threadId: m.threadId ?? "",
    from: header(m.payload, "from"),
    subject: header(m.payload, "subject"),
    snippet: m.snippet ?? "",
    body: (plainText(m.payload) ?? "").slice(0, BODY_CAP),
    receivedAt: new Date(ms).toISOString(),
  };
};

// Oldest first, at most `limit` messages, so a capped run can resume from its last message.
// -from:me keeps the user's own replies out (they would otherwise hit the keyword rules).
export async function listMessages(account: Account, sinceEpochSec: number, limit = MAX_PER_RUN): Promise<RawEmail[]> {
  const token = getKv<string>(account, "gmailToken");
  if (!token) throw new Error("Gmail is not connected");
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: decrypt(token) });
  const { messages } = gmail({ version: "v1", auth }).users;

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await messages.list({ userId: "me", q: `after:${sinceEpochSec} -from:me`, maxResults: 500, pageToken });
    ids.push(...(data.messages ?? []).map((m) => m.id!));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  const wanted = ids.reverse().slice(0, limit); // the list is newest-first
  const out: RawEmail[] = [];
  for (let i = 0; i < wanted.length; i += 10) {
    const chunk = await Promise.all(wanted.slice(i, i + 10).map((id) => messages.get({ userId: "me", id, format: "full" })));
    out.push(...chunk.map((r) => toRaw(r.data)).filter((e) => e !== null));
  }
  return out.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}
