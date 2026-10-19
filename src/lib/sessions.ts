import { createHash, randomBytes } from "node:crypto";
import { getActiveAccount, getRegistry, type Account } from "./accounts";
export const SESSION_COOKIE = "jt_session";
export const SESSION_MS = 30 * 86_400_000;
export const sessionHash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createSession(account: Account, now = Date.now()): string {
  if (!getActiveAccount(account.id)) throw new Error("An active account is required");
  const db = getRegistry(), token = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
  db.prepare("INSERT INTO sessions (token_hash,account_id,expires_at) VALUES (?,?,?)").run(sessionHash(token), account.id, now + SESSION_MS);
  return token;
}
export function lookupSession(token: string | undefined, now = Date.now()): Account | null {
  if (!token || !/^[\w-]{43}$/.test(token)) return null;
  const row = getRegistry().prepare("SELECT account_id FROM sessions WHERE token_hash=? AND expires_at>=?")
    .get(sessionHash(token), now) as { account_id: number } | undefined;
  return row ? getActiveAccount(row.account_id) : null;
}
export function revokeSession(token: string | undefined): void {
  if (token) getRegistry().prepare("DELETE FROM sessions WHERE token_hash=?").run(sessionHash(token));
}
