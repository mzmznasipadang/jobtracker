"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { STATUSES, statusLabel } from "@/components/job-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addNoteAction, clearFollowUpAction, deleteJobAction, repliedElsewhereAction, setStatusAction } from "@/app/app/jobs/[id]/actions";
import type { Status } from "@/lib/types";

export function ApplyBar({ jobId, status, replied, followUpDue }: { jobId: number; status: Status; replied: boolean; followUpDue: boolean }) {
  const [note, setNote] = useState("");
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) after?.();
      else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader><CardTitle>Apply and track</CardTitle></CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending || status === "applied"} onClick={() => act(() => setStatusAction(jobId, "applied"))}>Mark as applied</Button>
          <Select value={status} onValueChange={(s) => act(() => setStatusAction(jobId, s as Status))} disabled={pending}>
            <SelectTrigger aria-label="Status" className="w-40 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" disabled={pending || replied} onClick={() => act(() => repliedElsewhereAction(jobId))}>
            {replied ? "Replied elsewhere (noted)" : "Replied elsewhere"}
          </Button>
          {followUpDue && <Button variant="outline" disabled={pending} onClick={() => act(() => clearFollowUpAction(jobId))}>Followed up</Button>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) act(() => addNoteAction(jobId, note), () => setNote(""));
          }}
        >
          <Input aria-label="Note" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={pending || !note.trim()}>Add note</Button>
        </form>
        <div className="grid gap-3 border-t pt-4">
          {confirmDelete ? (
            <div role="alert" className="grid gap-3">
              <p className="text-sm">Permanently delete this job, its notes, and all generated CVs and letters? This cannot be undone. Your Gmail messages will stay in Gmail.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" disabled={pending} onClick={() => act(() => deleteJobAction(jobId), () => {
                  router.replace("/app/jobs");
                  router.refresh();
                })}>Delete permanently</Button>
                <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            </div>
          ) : <Button variant="outline" className="w-fit text-destructive" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete job</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
