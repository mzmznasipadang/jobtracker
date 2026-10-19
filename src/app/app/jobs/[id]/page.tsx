import { getEffectiveAiSummary } from "@/lib/cv-skills";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyBar } from "@/components/apply-bar";
import { BusyPoller } from "@/components/busy-poller";
import { CheckPanel } from "@/components/check-panel";
import { JobAlerts } from "@/components/job-alerts";
import { jobLabel, needsExtraction, StatusBadge } from "@/components/job-status-badge";
import { TailorPanel } from "@/components/tailor-panel";
import { Timeline } from "@/components/timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getJob, isBusy, listEvents } from "@/lib/jobs";
import { getTailored } from "@/lib/tailor/tailor";

export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const account = await requireSession();
  const { id: raw } = await params;
  const full = /^\d+$/.test(raw) ? getJob(account, Number(raw)) : null;
  if (!full) notFound();
  const job = { ...full, rawText: null };
  const busy = isBusy(job);
  const { company, title } = jobLabel(job, busy);
  const extracted = !!(job.company || job.title);
  // The raw text (up to ~100 KB) goes to the client only for the editor, never into the 3 s poll otherwise.
  const rawText = needsExtraction(job, busy) ? full.rawText : null;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <BusyPoller active={busy} />
      <header className="grid gap-2">
        <Link href="/app/jobs" className="w-fit text-sm text-muted-foreground hover:underline">← Jobs</Link>
        <h1 className="text-2xl font-semibold text-primary">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">{company}</span>
          <StatusBadge status={job.status} />
          <Badge variant="outline" className="capitalize">{job.source}</Badge>
          {job.location && <span className="text-muted-foreground">{job.location}{job.workMode ? ` · ${job.workMode}` : ""}</span>}
          <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            Open job<ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        </div>
        {job.followUpDue && <p className="text-sm font-medium text-warning">Follow-up due: no reply yet.</p>}
      </header>

      <JobAlerts job={job} busy={busy} rawText={rawText} />
      <CheckPanel job={job} busy={busy && job.busy !== "tailoring"} />
      <TailorPanel effectiveAi={getEffectiveAiSummary()} jobId={job.id} busy={busy && job.busy === "tailoring"} versions={getTailored(account, job.id)} disabled={busy || !extracted || !!job.extractError} />
      <ApplyBar jobId={job.id} status={job.status} replied={!!job.firstResponseAt} followUpDue={job.followUpDue} />
      <Card>
        <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent><Timeline events={listEvents(account, job.id)} /></CardContent>
      </Card>
    </div>
  );
}
