"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rerunChecks, retryExtractionAction } from "@/app/app/jobs/[id]/actions";
import type { Job } from "@/lib/types";

// Extraction failure (with the raw-text editor) and the error of the last failed background task.
export function JobAlerts({ job, busy }: { job: Job; busy: boolean }) {
  const [text, setText] = useState(job.rawText ?? "");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
    });
  const disabled = pending || busy;
  const neverExtracted = !job.company && !job.title;

  return (
    <>
      {job.extractError && (
        <div role="alert" className="grid gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">Could not extract this posting</p>
          <p className="text-sm">{job.extractError}</p>
          <details className="grid gap-2 text-sm">
            <summary className="cursor-pointer font-medium">Edit the captured text</summary>
            <Textarea aria-label="Captured text" rows={10} value={text} onChange={(e) => setText(e.target.value)} className="mt-2" />
          </details>
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled} onClick={() => run(() => retryExtractionAction(job.id, text !== (job.rawText ?? "") ? text : undefined))}>Retry extraction</Button>
          </div>
        </div>
      )}
      {job.busyError && !busy && (
        <div role="alert" className="grid gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">The last background task failed</p>
          <p className="text-sm">{job.busyError}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled} onClick={() => run(() => (neverExtracted ? retryExtractionAction(job.id) : rerunChecks(job.id)))}>
              {neverExtracted ? "Retry extraction" : "Retry checks"}
            </Button>
            {!neverExtracted && <span className="self-center text-sm text-muted-foreground">If this was tailoring, press Tailor again.</span>}
          </div>
        </div>
      )}
    </>
  );
}
