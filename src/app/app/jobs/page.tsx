import Link from "next/link";
import { BusyPoller } from "@/components/busy-poller";
import { JobCard } from "@/components/job-card";
import { jobLabel, toCardJob, SalaryFitBadge, ScamBadge, ScoreBadge, StatusBadge, STATUSES, statusLabel } from "@/components/job-status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireSession } from "@/lib/auth";
import { isBusy, listJobs } from "@/lib/jobs";
import { Source, Status } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

const COLUMNS = STATUSES.filter((s) => s !== "skipped");

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const account = await requireSession();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const status = Status.safeParse(one("status")).data;
  const source = Source.safeParse(one("source")).data;
  const all = listJobs(account);
  const rows = all.filter((j) => (!status || j.status === status) && (!source || j.source === source));
  const skipped = all.filter((j) => j.status === "skipped");
  const showSkipped = one("skipped") === "1";
  const columns = showSkipped ? [...COLUMNS, "skipped" as const] : COLUMNS;

  return (
    <div className="grid gap-6">
      <BusyPoller active={all.some(isBusy)} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-primary">Jobs</h1>
        <Button asChild><Link href="/app/new">New job</Link></Button>
      </div>
      <Tabs defaultValue={one("view") === "table" ? "table" : "board"}>
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="grid gap-3">
          <div className="flex justify-end">
            <Button asChild variant="link" size="sm">
              <Link href={showSkipped ? "/app/jobs" : "/app/jobs?skipped=1"}>{showSkipped ? "Hide skipped" : `Show skipped (${skipped.length})`}</Link>
            </Button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((s) => {
              const jobs = all.filter((j) => j.status === s);
              return (
                <section key={s} aria-label={statusLabel(s)} className="w-72 shrink-0 rounded-lg bg-muted/60 p-2">
                  <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                    {statusLabel(s)}<span className="text-xs font-medium text-muted-foreground">{jobs.length}</span>
                  </h2>
                  <div className="grid gap-2">
                    {jobs.map((j) => <JobCard key={j.id} job={toCardJob(j)} busy={isBusy(j)} />)}
                    {jobs.length === 0 && <p className="px-1 py-3 text-xs text-muted-foreground">Nothing here.</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="table" className="grid gap-4">
          <form className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="view" value="table" />
            <FilterSelect name="source" label="Source" value={source} options={Source.options} />
            <FilterSelect name="status" label="Status" value={status} options={Status.options} />
            <Button type="submit" variant="secondary">Filter</Button>
          </form>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead>
                <TableHead>Checks</TableHead><TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((j) => {
                const l = jobLabel(j, isBusy(j));
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Link href={`/app/jobs/${j.id}`} className="font-semibold text-primary hover:underline">{l.title}</Link>
                      <div className="text-xs text-muted-foreground">{l.company}</div>
                    </TableCell>
                    <TableCell className="capitalize">{j.source}</TableCell>
                    <TableCell><StatusBadge status={j.status} /></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5"><ScoreBadge score={j.matchScore} /><SalaryFitBadge fit={j.salaryFit} /><ScamBadge risk={j.scamRisk} /></div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(j.updatedAt)}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No jobs match.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: readonly string[] }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select name={name} defaultValue={value ?? "all"}>
        <SelectTrigger aria-label={label} className="w-40 capitalize"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
