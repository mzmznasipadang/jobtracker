import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/sessions";
import { consumeOAuthState } from "@/lib/oauth-state";
import { appUrl, exchangeCode, STATE_COOKIE } from "@/lib/email/gmail";
import { getKv, setKv } from "@/lib/settings";
export async function GET(req: NextRequest) {
  const account = await requireSession(), jar = await cookies();
  const payload = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/gmail" });
  let verifier: string;
  try {
    ({ verifier } = consumeOAuthState(req.nextUrl.searchParams.get("state") || "", payload, {
      purpose: "gmail", accountId: account.id, sessionToken: jar.get(SESSION_COOKIE)?.value,
    }));
  } catch { return new NextResponse("Invalid OAuth state", { status: 400 }); }
  const back = (result: string) => NextResponse.redirect(new URL(`/app/settings?gmail=${result}`, appUrl()));
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return back("denied");
  try { await exchangeCode(account, code, verifier); }
  catch {
    setKv(account, "gmailError", "Could not complete the Gmail connection — check permissions and try again");
    return back("error");
  }
  return back(getKv(account, "gmailError") ? "error" : "connected");
}
