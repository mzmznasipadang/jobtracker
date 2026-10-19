"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { listAccounts } from "@/lib/accounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approveAccountAction, revokeAccountAction } from "./account-actions";
export function AccountsCard({ accounts }: { accounts: ReturnType<typeof listAccounts> }) {
  const [pending, start] = useTransition(), [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return <Card>
    <CardHeader>
      <CardTitle>Account access</CardTitle>
      <CardDescription>Only approved Google accounts can sign in. Everyone has their own private jobs, CV and Gmail connection. AI usage is charged to your Claude API key.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <form className="space-y-2" onSubmit={e => {
        e.preventDefault(); const form = e.currentTarget, email = String(new FormData(form).get("email") || "");
        start(async () => {
          const result = await approveAccountAction(email);
          setMessage({ ok: result.ok, text: result.ok ? "Account approved. They can now sign in with Google." : result.error });
          if (result.ok) { form.reset(); router.refresh(); }
        });
      }}>
        <Label htmlFor="approved-email">Google account email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="approved-email" name="email" type="email" autoComplete="off" placeholder="person@gmail.com" required disabled={pending} className="min-w-0 flex-1" />
          <Button type="submit" disabled={pending}>{pending ? "Updating…" : "Approve account"}</Button>
        </div>
      </form>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>{message.text}</p>}
      <ul className="divide-y divide-border">
        {accounts.map(account => <li key={account.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="break-all text-sm font-medium">{account.email}</p>
            <p className="text-xs text-muted-foreground">{account.role === "owner" ? "Owner" : !account.active ? "Access revoked" : account.claimed ? "Active" : "Approved · not signed in yet"}</p>
          </div>
          {account.role !== "owner" && <Button size="sm" variant="outline" className="self-start sm:shrink-0" disabled={pending} aria-label={`${account.active ? "Revoke" : "Restore"} access for ${account.email}`} onClick={() => start(async () => {
            const result = account.active ? await revokeAccountAction(account.id) : await approveAccountAction(account.email);
            setMessage({ ok: result.ok, text: result.ok ? (account.active ? "Access revoked. Existing sessions have been signed out." : "Access restored. They can sign in again.") : result.error });
            if (result.ok) router.refresh();
          })}>{account.active ? "Revoke access" : "Restore access"}</Button>}
        </li>)}
      </ul>
    </CardContent>
  </Card>;
}
