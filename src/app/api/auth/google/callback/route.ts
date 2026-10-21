import { readMobileBinding, readSignInReturnTo } from "@/lib/oauth-state";
import { createMobileHandoff, mobileCallback } from "@/lib/mobile-auth";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { completeGoogleLogin, GOOGLE_STATE_COOKIE } from "@/lib/google-login";
import { createSession, revokeSession, SESSION_COOKIE, SESSION_MS } from "@/lib/sessions";
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state") || "";
  const jar = await cookies();
  const mobileCookie = /^[\w-]{43}$/.test(state) ? `${GOOGLE_STATE_COOKIE}_${state}` : "";
  const payload = (mobileCookie && jar.get(mobileCookie)?.value) || jar.get(GOOGLE_STATE_COOKIE)?.value;
  if (mobileCookie) jar.delete({name:mobileCookie,path:"/api/auth/google"});
  if (!readMobileBinding(payload,state)) jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
  const base = process.env.APP_URL || req.url;
  const returnTo = readSignInReturnTo(payload, state);
  try {
    const result = await completeGoogleLogin(req.nextUrl.searchParams.get("code") || "", req.nextUrl.searchParams.get("state") || "", payload);
    if (result.mobile) {
      const callback = new URL(mobileCallback);
      callback.searchParams.set("code",createMobileHandoff(result.account,result.mobile.challenge));
      callback.searchParams.set("state",result.mobile.clientState);
      return NextResponse.redirect(callback, {headers:{"Cache-Control":"private, no-store"}});
    }
    revokeSession(jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, createSession(result.account), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MS / 1000,
    });
    return NextResponse.redirect(new URL(result.next, base));
  } catch {
    const mobile = readMobileBinding(payload,state);
    if (mobile) {
      const callback = new URL(mobileCallback);
      callback.searchParams.set("state",mobile.clientState);
      callback.searchParams.set("error","Google sign-in was cancelled or this account is not approved. Please try again.");
      return NextResponse.redirect(callback,{headers:{"Cache-Control":"private, no-store"}});
    }
    const error = returnTo && req.nextUrl.searchParams.get("error") === "access_denied" ? "cancelled" : "google";
    return NextResponse.redirect(new URL(`${returnTo || "/login"}?error=${error}`, base));
  }
}
