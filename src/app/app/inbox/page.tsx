import Link from "next/link";
import { getKv } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { EmailRelevanceControl, RelevanceFilter } from "./email-relevance";
import type { EmailRelevance } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { jobLabel } from "@/components/job-status-badge";
import { requireSession } from "@/lib/auth";
import { getAccountDb } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import { fmtDate } from "@/lib/utils";
import { LinkEmail } from "./link-email";
type Row = {
    id: string;
    relevance: EmailRelevance;
    from_addr: string;
    original_from: string | null;
    job_id: number | null;
    company: string | null;
    title: string | null;
    archived_at: string | null;
    subject: string;
    received_at: string;
    classification: string;
};
export default async function InboxPage({ searchParams }: {
    searchParams: Promise<{ view?: string; relevance?: string }>;
}) {
    const account = await requireSession();
    const sp = await searchParams;
    const view = sp.view === "linked" || sp.view === "unmatched" ? sp.view : "all";
    const relevance = ['relevant', 'not_relevant', 'unreviewed'].includes(sp.relevance ?? '') ? sp.relevance! : 'all';
    const mailbox = getKv<string>(account, "gmailAddress");
    const rows = getAccountDb(account).prepare(`
        SELECT e.*, j.company, j.title, j.archived_at,
          COALESCE(json_extract(review.value_json, '$'), 'unreviewed') AS relevance
        FROM emails e
        LEFT JOIN jobs j ON j.id=e.job_id
        LEFT JOIN kv review ON review.key='emailRelevance:' || e.id
        WHERE (e.job_id IS NULL OR (j.id IS NOT NULL AND (j.purge_after IS NULL OR j.purge_after>@now)))
          AND (@view='all' OR (@view='unmatched' AND e.job_id IS NULL) OR (@view='linked' AND e.job_id IS NOT NULL))
          AND (@relevance='all' OR COALESCE(json_extract(review.value_json, '$'), 'unreviewed')=@relevance)
        ORDER BY e.received_at DESC
    `).all({ view, relevance, now: new Date().toISOString() }) as Row[];
    const jobs = listJobs(account).filter(job => !job.archivedAt).map((j) => {
        const l = jobLabel(j, false);
        return { id: j.id, label: `${l.company} — ${l.title}` };
    });
    return (<div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Inbox</h1>
        <p className="text-sm text-muted-foreground">Find emails linked to your applications, or sort unmatched messages.</p>
      </div>
      <nav aria-label="Inbox views" className="flex flex-wrap gap-4 border-b pb-3">
        {([['all', 'All emails'], ['linked', 'Linked emails'], ['unmatched', 'Unmatched emails']] as const).map(([key, label]) => <Link key={key} href={`/app/inbox?view=${key}&relevance=${relevance}`} aria-current={view === key ? "page" : undefined} className={view === key ? "font-semibold text-primary underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>{label}</Link>)}
      </nav>
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <RelevanceFilter key={`${view}:${relevance}`} value={relevance} />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <p className="max-w-prose text-sm text-muted-foreground">Review whether each email is relevant to your applications. Your choice is saved here; it does not change Gmail or undo a job status update. Classification shows how the message was interpreted.</p>
      {rows.length === 0 ? (<p className="text-sm text-muted-foreground">No emails match this view.</p>) : (<Table>
          <TableHeader>
            <TableRow><TableHead>Classification</TableHead><TableHead>From</TableHead><TableHead>Subject</TableHead><TableHead>Date</TableHead><TableHead>Job</TableHead><TableHead>Relevance</TableHead><TableHead><span className="sr-only">Email link</span></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (<TableRow key={r.id}>
                <TableCell><Badge variant={r.classification === "other" || r.classification === "auto_ack" ? "secondary" : "default"}>{r.classification.replace("_", " ")}</Badge></TableCell>
                <TableCell className="max-w-48 whitespace-normal break-words">{r.original_from || r.from_addr}</TableCell>
                <TableCell className="min-w-48 max-w-80 whitespace-normal break-words">{r.subject || "(No subject)"}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.received_at)}</TableCell>
                <TableCell>{r.job_id !== null ? <Link href={`/app/jobs/${r.job_id}`} className="text-primary underline underline-offset-4">{r.company} — {r.title}{r.archived_at ? " (archived)" : ""}</Link> : r.relevance === 'not_relevant' ? <span className="text-sm text-muted-foreground">Mark Relevant to link</span> : <LinkEmail emailId={r.id} jobs={jobs}/>}</TableCell>
                <TableCell><EmailRelevanceControl key={`${r.id}:${r.relevance}`} emailId={r.id} relevance={r.relevance} /></TableCell>
                <TableCell><a href={`https://mail.google.com/mail/?${mailbox ? `authuser=${encodeURIComponent(mailbox)}` : ""}#all/${encodeURIComponent(r.id)}`} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4" aria-label={`Open in Gmail: ${r.subject || "No subject"} (opens in a new tab)`}>Open in Gmail</a></TableCell>
              </TableRow>))}
          </TableBody>
        </Table>)}
    </div>);
}
