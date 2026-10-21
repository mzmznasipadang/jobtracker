import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { beginGoogleLogin, GOOGLE_STATE_COOKIE } from "@/lib/google-login";
import { OAUTH_MAX_AGE } from "@/lib/oauth-state";
export async function GET(req: NextRequest) {
  const base = process.env.APP_URL || req.url;
  const returnTo = req.nextUrl.searchParams.get("returnTo") === "/beta" ? "/beta" : undefined;
  try {
    const flow = await beginGoogleLogin(req.nextUrl.searchParams.get("next") || "/app", undefined, returnTo);
    (await cookies()).set(GOOGLE_STATE_COOKIE, flow.cookie, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: OAUTH_MAX_AGE,
    });
    return NextResponse.redirect(flow.url);
  } catch {
    return NextResponse.redirect(new URL(`${returnTo || "/login"}?error=google`, base));
  }
}
