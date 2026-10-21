import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getRegistry } from "./accounts";
import { safeNext } from "./auth";
import { decrypt, encrypt } from "./crypto";
import { sessionHash } from "./sessions";

export const OAUTH_MAX_AGE = 600;
type Binding = { purpose: "signin" | "gmail"; accountId?: number; sessionToken?: string };
const Mobile = z.object({ challenge: z.string().regex(/^[\w-]{43}$/), clientState: z.string().regex(/^[\w-]{43}$/) }).strict();
export type MobileBinding = z.infer<typeof Mobile>;
const Payload = z.object({
  purpose: z.enum(["signin", "gmail"]), state: z.string().regex(/^[\w-]{43}$/),
  nonce: z.string().regex(/^[\w-]{43}$/), verifier: z.string().regex(/^[\w-]{43}$/),
  expires: z.number().int(), next: z.string(), accountId: z.number().int().positive().optional(), sessionHash: z.string().optional(),
  mobile: Mobile.optional(),
  returnTo: z.literal("/beta").optional(),
}).strict();

export function createOAuthState(input: Binding & { next?: string; mobile?: MobileBinding; returnTo?: "/beta" }) {
  if (input.purpose === "gmail" && (!input.accountId || !input.sessionToken)) throw new Error("An authenticated session is required");
  const state = randomBytes(32).toString("base64url"), nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  const expires = Date.now() + OAUTH_MAX_AGE * 1000, db = getRegistry();
  db.prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO oauth_states (state_hash,expires_at) VALUES (?,?)").run(sessionHash(state), expires);
  const cookie = encrypt(JSON.stringify({
    mobile: input.mobile ? Mobile.parse(input.mobile) : undefined, returnTo: input.returnTo, purpose: input.purpose, state, nonce, verifier, expires, next: safeNext(input.next ?? null),
    accountId: input.accountId, sessionHash: input.sessionToken ? sessionHash(input.sessionToken) : undefined,
  }));
  return { state, cookie, nonce, verifier };
}

export function readSignInReturnTo(cookie: string | undefined, state: string): "/beta" | undefined {
  try {
    if (!cookie) return;
    const data = Payload.parse(JSON.parse(decrypt(cookie)));
    if (data.state === state && data.purpose === "signin" && data.expires > Date.now()) return data.returnTo;
  } catch { /* Untrusted context must never select a redirect. */ }
}
export function consumeOAuthState(state: string, cookie: string | undefined, expected: Binding): { nonce: string; verifier: string; next: string; mobile?: MobileBinding } {
  if (!cookie) throw new Error("Invalid OAuth state");
  const data = Payload.parse(JSON.parse(decrypt(cookie)));
  if (data.state !== state || data.purpose !== expected.purpose || data.expires < Date.now() ||
      data.accountId !== expected.accountId || data.sessionHash !== (expected.sessionToken ? sessionHash(expected.sessionToken) : undefined)) throw new Error("Invalid OAuth state");
  const row = getRegistry().prepare("DELETE FROM oauth_states WHERE state_hash=? AND expires_at>=? RETURNING state_hash").get(sessionHash(state), Date.now());
  if (!row) throw new Error("OAuth state expired or already used");
  return { nonce: data.nonce, verifier: data.verifier, next: safeNext(data.next), ...(data.mobile ? { mobile: data.mobile } : {}) };
}

// Read only enough validated flow context to return a failed native login to its caller.
export function readMobileBinding(cookie: string | undefined, state: string): MobileBinding | undefined {
  try {
    if (!cookie) return;
    const data = Payload.parse(JSON.parse(decrypt(cookie)));
    if (data.state === state && data.purpose === 'signin' && data.expires > Date.now()) return data.mobile;
  } catch { /* Invalid cookies must never select a callback. */ }
}
