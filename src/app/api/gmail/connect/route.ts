import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/sessions";
import { createOAuthState, OAUTH_MAX_AGE } from "@/lib/oauth-state";
import { authUrl, STATE_COOKIE } from "@/lib/email/gmail";
export async function GET() {
  const account = await requireSession(), jar = await cookies();
  const flow = createOAuthState({ purpose: "gmail", accountId: account.id, sessionToken: jar.get(SESSION_COOKIE)?.value });
  jar.set(STATE_COOKIE, flow.cookie, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/gmail", maxAge: OAUTH_MAX_AGE,
  });
  return NextResponse.redirect(authUrl(flow.state, createHash("sha256").update(flow.verifier).digest("base64url")));
}
