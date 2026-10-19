"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { needsExtraction } from "@/components/job-status-badge";
import { rerunChecks, retryExtractionAction } from "@/app/app/jobs/[id]/actions";
import type { Job } from "@/lib/types";

type Alerts = Pick<Job, "id" | "company" | "title" | "extractError" | "busyError">;
type Result = { ok: true } | { ok: false; error: string };

// Mounted only while shown, so the editor starts from the raw text the page passes in that case.
function ExtractBanner({ job, busy, rawText }: { job: Alerts; busy: boolean; rawText: string }) {
  const [text, setText] = useState(rawText);
  const [pending, start] = useTransition();
  return (
    <div role="alert" className="grid gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
      <p className="text-sm font-semibold text-danger">{job.extractError ? "Could not extract this posting" : "This posting has not been extracted yet"}</p>
      {job.extractError && <p className="text-sm">{job.extractError}</p>}
      <details className="grid gap-2 text-sm">
        <summary className="cursor-pointer font-medium">Edit the captured text</summary>
        <Textarea aria-label="Captured text" rows={10} value={text} onChange={(e) => setText(e.target.value)} className="mt-2" />
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || busy}
          onClick={() => start(async () => {
            const r = await retryExtractionAction(job.id, text !== rawText ? text : undefined);
            if (!r.ok) toast.error(r.error);
          })}
        >
          Retry extraction
        </Button>
      </div>
    </div>
  );
}

// `rawText` is passed only while the extraction banner is shown, to keep it out of the poll payload otherwise.
export function JobAlerts({ job, busy, rawText }: { job: Alerts & Pick<Job, "extractError">; busy: boolean; rawText: string | null }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
    });
  const neverExtracted = !job.company && !job.title;

  return (
    <>
      {needsExtraction(job, busy) && <ExtractBanner job={job} busy={busy} rawText={rawText ?? ""} />}
      {job.busyError && !busy && (
        <div role="alert" className="grid gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">The last background task failed</p>
          <p className="text-sm">{job.busyError}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run(() => (neverExtracted ? retryExtractionAction(job.id) : rerunChecks(job.id)))}>
              {neverExtracted ? "Retry extraction" : "Retry checks"}
            </Button>
            {!neverExtracted && <span className="self-center text-sm text-muted-foreground">If this was tailoring, press Tailor again.</span>}
          </div>
        </div>
      )}
    </>
  );
}
