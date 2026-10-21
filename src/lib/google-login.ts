import { createHash } from "node:crypto";
import { OAuth2Client, type CodeChallengeMethod } from "google-auth-library";
import { claimGoogleAccount } from "./accounts";
import { createOAuthState, consumeOAuthState, type MobileBinding } from "./oauth-state";

export const GOOGLE_STATE_COOKIE = "google_signin_state";
const client = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error("Google sign-in is not configured");
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, `${process.env.APP_URL || "http://localhost:3000"}/api/auth/google/callback`);
};
export async function beginGoogleLogin(next: string, mobile?: MobileBinding, returnTo?: "/beta"): Promise<{ url: string; cookie: string }> {
  const auth = client(), flow = createOAuthState({ purpose: "signin", next, mobile, returnTo });
  const url = auth.generateAuthUrl({
    scope: ["openid", "email", "profile"], state: flow.state, nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256" as CodeChallengeMethod,
    prompt: "select_account",
  });
  return { url, cookie: flow.cookie };
}
export async function completeGoogleLogin(code: string, state: string, cookie: string | undefined) {
  const flow = consumeOAuthState(state, cookie, { purpose: "signin" });
  if (!code || code.length > 4096) throw new Error("Invalid authorization code");
  const auth = client();
  const { tokens } = await auth.getToken({ code, codeVerifier: flow.verifier });
  if (!tokens.id_token) throw new Error("Missing Google identity");
  const ticket = await auth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p || !p.sub || !p.email || p.email_verified !== true || p.aud !== process.env.GOOGLE_CLIENT_ID ||
      !["https://accounts.google.com", "accounts.google.com"].includes(p.iss) || !p.exp || p.exp * 1000 <= Date.now() ||
      (p as typeof p & { nonce?: string }).nonce !== flow.nonce) throw new Error("Invalid Google identity");
  const account = claimGoogleAccount({ sub: p.sub, email: p.email, emailVerified: p.email_verified });
  return { account, next: flow.next, ...(flow.mobile ? { mobile: flow.mobile } : {}) };
}
