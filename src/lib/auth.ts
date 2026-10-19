import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Account } from "./accounts";
import { lookupSession, SESSION_COOKIE } from "./sessions";
export { SESSION_COOKIE, SESSION_MS } from "./sessions";

export async function requireSession(): Promise<Account> {
  const account = lookupSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!account) redirect("/login");
  return account;
}
export function safeNext(next: string | null): string {
  return next && /^\/app(?:\/|\?|$)/.test(next) && !/[\\\r\n\0]/.test(next) ? next : "/app";
}
