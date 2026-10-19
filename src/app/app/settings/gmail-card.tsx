"use client";

import { useTransition } from "react";
import { BusyPoller } from "@/components/busy-poller";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils";
import { syncGmail, disconnectGmailAction } from "./actions";

export function GmailCard({ hasToken, error, lastSync, syncing, address }: { address: string | null; hasToken: boolean; error: string | null; lastSync: string | null; syncing: boolean }) {
  const [pending, start] = useTransition();
  const state = error ? "Error" : hasToken ? "Connected" : "Not connected";
  return (
    <Card>
      <BusyPoller active={syncing} />
      <CardHeader>
        <CardTitle>Gmail</CardTitle>
        <CardDescription>Reads job-related replies and updates job statuses. Other mail is never stored or sent to Claude.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        <p>Status: <span className={`font-semibold ${error ? "text-danger" : hasToken ? "text-success" : ""}`}>{state}</span></p>
        {error && <p className="text-danger">{error}</p>}
        {address && <p>Mailbox: {address}</p>}
        {hasToken && <p>Last sync: {lastSync ? fmtDate(lastSync) : "never"}</p>}
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <Button asChild variant={hasToken && !error ? "outline" : "default"}>
          <a href="/api/gmail/connect">{hasToken || error ? "Reconnect" : "Connect Gmail"}</a>
        </Button>
        <Button
          disabled={!hasToken || !!error || pending || syncing}
          onClick={() => start(async () => {
            const r = await syncGmail();
            if (!r.ok) toast.error(r.error);
          })}
        >
          {pending || syncing ? "Syncing…" : "Sync now"}
        </Button>
        {hasToken && <Button variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await disconnectGmailAction(); if (!r.ok) toast.error(r.error); })}>Disconnect</Button>}
      </CardFooter>
    </Card>
  );
}
