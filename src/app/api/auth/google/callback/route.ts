import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { completeGoogleLogin, GOOGLE_STATE_COOKIE } from "@/lib/google-login";
import { createSession, revokeSession, SESSION_COOKIE, SESSION_MS } from "@/lib/sessions";
export async function GET(req: NextRequest) {
  const jar = await cookies(), payload = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  const base = process.env.APP_URL || req.url;
  try {
    const result = await completeGoogleLogin(req.nextUrl.searchParams.get("code") || "", req.nextUrl.searchParams.get("state") || "", payload);
    revokeSession(jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, createSession(result.account), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MS / 1000,
    });
    return NextResponse.redirect(new URL(result.next, base));
  } catch {
    return NextResponse.redirect(new URL("/login?error=google", base));
  }
}
