import Link from "next/link";
import { MetricsTable } from "@/components/metrics-table";
import { jobLabel, StatusBadge, STATUSES } from "@/components/job-status-badge";
import { requireSession } from "@/lib/auth";
import { getAccountDb } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import { computeMetrics } from "@/lib/metrics";
import { getSettings } from "@/lib/settings";
export const dynamic = "force-dynamic";
export default async function Overview() {
    const account = await requireSession();
    const jobs = listJobs(account).filter(job => !job.archivedAt);
    const counts = Object.fromEntries(STATUSES.map((s) => [s, jobs.filter((j) => j.status === s).length]));
    const reasons = new Map<number, string[]>();
    const add = (id: number, why: string) => reasons.set(id, [...(reasons.get(id) ?? []), why]);
    for (const j of jobs) {
        if (j.status === "ready")
            add(j.id, "Ready to apply");
        if (j.followUpDue)
            add(j.id, "Follow-up due");
    }
    const emails = getAccountDb(account).prepare("SELECT job_id, count(*) AS n FROM emails WHERE job_id IS NOT NULL AND classification IN ('rejection','interview','offer') AND received_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') GROUP BY job_id").all() as {
        job_id: number;
        n: number;
    }[];
    for (const e of emails)
        add(e.job_id, e.n > 1 ? `${e.n} new replies` : "New reply");
    const actionable = jobs.filter((j) => reasons.has(j.id));
    return (<div className="space-y-8">
      <h1 className="text-2xl font-semibold text-primary">Overview</h1>

      <section aria-label="Pipeline" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => (<div key={s} className="rounded-xl border border-border bg-card p-3">
            <StatusBadge status={s}/>
            <p className="mt-2 text-3xl font-semibold">{counts[s]}</p>
          </div>))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Needs action</h2>
        {actionable.length === 0 ? (<p className="text-sm text-muted-foreground">Nothing needs action.</p>) : (<ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {actionable.map((j) => {
                const { company, title } = jobLabel(j, false);
                return (<li key={j.id}>
                  <Link href={`/app/jobs/${j.id}`} className="flex items-center justify-between gap-4 p-3 hover:bg-muted">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-primary">{title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{company}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{reasons.get(j.id)!.join(" · ")}</span>
                  </Link>
                </li>);
            })}
          </ul>)}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Results by source</h2>
        <MetricsTable sources={computeMetrics(account).sources} ghostDays={getSettings(account).pipeline.ghostDays}/>
      </section>
    </div>);
}
