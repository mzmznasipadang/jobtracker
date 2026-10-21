import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { StatusBadge, STATUSES } from "@/components/job-status-badge";
import { MetricsTable } from "@/components/metrics-table";
import { WeeklyBars } from "@/components/weekly-bars";
import type { PublicStats } from "@/lib/metrics";

export const metadata: Metadata = {
  title: "Explore the JobTracker demo",
  description: "Explore a sample job search, tailored CV draft and application results. No sign-in needed.",
};

// Fixed fictional fixtures only: this public route never reads account data.
const counts = { saved: 6, ready: 4, applied: 14, interview: 4, offer: 1, rejected: 7, ghosted: 4, skipped: 2 };
const sources: PublicStats["sources"] = [
  { source: "linkedin", sent: 12, responseRate: 6 / 12, interviewRate: 3 / 12, ghostRate: 2 / 12 },
  { source: "jobstreet", sent: 8, responseRate: 3 / 8, interviewRate: 1 / 8, ghostRate: 1 / 8 },
  { source: "dealls", sent: 6, responseRate: 2 / 6, interviewRate: 1 / 6, ghostRate: 1 / 6 },
  { source: "kalibrr", sent: 4, responseRate: 1 / 4, interviewRate: 0, ghostRate: 0 },
];
const weekly = [6, 8, 9, 7].map((sent, i) => ({ weekStart: ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"][i], sent }));
const actions = [
  { role: "Junior Software Engineer", company: "Northstar Labs", action: "Ready to apply" },
  { role: "Frontend Developer", company: "Maple Cloud", action: "Follow-up due" },
  { role: "iOS Developer", company: "Orbit Studio", action: "New reply" },
];
const summary = "Software engineer building reliable web applications with TypeScript, React and PostgreSQL. At Cedar Digital, developed internal tools that helped a five-person operations team manage customer requests. Built and deployed a personal job-tracking project, with a focus on clear interfaces and maintainable code.";
const views = [{ id: "overview", label: "Overview" }, { id: "draft", label: "CV draft" }, { id: "results", label: "Results" }];

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const { view: requested } = await searchParams;
  const view = views.some(v => v.id === requested) ? requested : "overview";
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-accent selection:text-accent-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/demo" aria-label="JobTracker demo"><Wordmark className="h-10 w-auto max-w-full text-primary" /></Link>
          <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">Demo data · For illustration</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-xl">
            <h1 className="text-3xl font-semibold tracking-tight text-primary">Explore JobTracker</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Take a look around a sample job search. All companies, candidate details and results here are fictional. No sign-in needed.</p>
          </div>
          <Button asChild><Link href="/beta">Try the beta</Link></Button>
        </div>
        <nav aria-label="Demo views" className="mb-8 flex gap-1 border-b border-border">
          {views.map(v => <Link key={v.id} href={`/demo?view=${v.id}`} aria-current={view === v.id ? "page" : undefined} className={`rounded-t-md border-b-2 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${view === v.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{v.label}</Link>)}
        </nav>
        {view === "overview" && <section aria-labelledby="overview-heading" className="space-y-8">
          <h2 id="overview-heading" className="text-2xl font-semibold text-primary">Overview</h2>
          <div aria-label="Pipeline" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATUSES.map(status => <div key={status} className="rounded-xl border border-border bg-card p-4"><StatusBadge status={status} /><p className="mt-2 text-3xl font-semibold tabular-nums">{counts[status]}</p></div>)}
          </div>
          <section><h3 className="mb-3 text-lg font-semibold">Needs action</h3>
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {actions.map(job => <li key={job.company} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-primary">{job.role}</p><p className="mt-1 text-xs text-muted-foreground">{job.company}</p></div><span className="text-xs text-muted-foreground">{job.action}</span></li>)}
            </ul>
          </section>
          <p className="text-sm leading-6 text-muted-foreground">See what is ready, what needs a follow-up, and where a reply has arrived.</p>
        </section>}
        {view === "draft" && <section aria-labelledby="draft-heading" className="space-y-6">
          <div><h2 id="draft-heading" className="text-2xl font-semibold text-primary">Junior Software Engineer</h2><p className="mt-2 text-sm text-muted-foreground">Northstar Labs · Remote · Fictional candidate: Alex Morgan</p></div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <h3 className="text-lg font-semibold">Review your application draft</h3>
            <p className="mt-2 text-xs text-muted-foreground">Sample draft · revision 1 · Read-only preview</p>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">In your tracker, review and edit the draft before exporting. Check every claim for accuracy.</p>
            <h4 className="mt-6 mb-3 font-semibold">CV summary · changed</h4>
            <p className="rounded-lg border border-border bg-muted p-4 text-sm leading-7">{summary}</p>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">Master: Software engineer with experience building web applications and internal tools. Comfortable with TypeScript, React, SQL and Git. Enjoys turning everyday problems into useful software.</p>
            <div className="mt-6 divide-y divide-border border-t border-border">
              {[
                ["Experience", "Software Engineer · Cedar Digital · 2025–2026. Built internal tools with React, TypeScript and PostgreSQL."],
                ["Projects", "Application tracker · Designed and deployed a web app to organise job applications and follow-ups."],
                ["Skills", "TypeScript · React · PostgreSQL · SQL · Git"],
                ["Cover letter", "Dear Northstar Labs team, I am applying for the Junior Software Engineer role. My experience building internal web tools with TypeScript, React and PostgreSQL aligns with your team's work. I would welcome the opportunity to discuss how I could contribute. Kind regards, Alex Morgan."],
              ].map(([title, text]) => <details key={title} className="py-4"><summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{title}</summary><p className="mt-3 text-sm leading-7 text-muted-foreground">{text}</p></details>)}
            </div>
          </div>
        </section>}
        {view === "results" && <section aria-labelledby="results-heading" className="space-y-8">
          <div><h2 id="results-heading" className="text-2xl font-semibold text-primary">Job search results</h2><p className="mt-2 text-sm text-muted-foreground">Sample reporting period · 1–28 September 2026</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[["Applications sent", "30"], ["Response rate", "40%"], ["Interview rate", "17%"], ["Ghost rate", "13%"]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div>)}
          </div>
          <section><h3 className="mb-3 text-lg font-semibold">By source</h3><MetricsTable sources={sources} ghostDays={7} /><p className="mt-3 text-xs leading-6 text-muted-foreground">All 30 sample applications are at least 7 days old. Twelve received replies; five reached an interview, including the one now at offer stage. Rates are rounded.</p></section>
          <section><h3 className="mb-3 text-lg font-semibold">Applications sent per week</h3><WeeklyBars weekly={weekly} /></section>
          <p className="text-sm text-muted-foreground">Illustrative numbers · Not actual user outcomes.</p>
        </section>}
      </main>
      <footer className="border-t border-border px-4 py-6"><div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-4 text-xs text-muted-foreground"><span>JobTracker · Naspad Studio</span><Link href="/beta" className="rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Start your own job search tracker</Link></div></footer>
    </div>
  );
}
