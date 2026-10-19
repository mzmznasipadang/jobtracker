import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { jobLabel } from "@/components/job-status-badge";
import { requireSession } from "@/lib/auth";
import { getAccountDb } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import { fmtDate } from "@/lib/utils";
import { LinkEmail } from "./link-email";

type Row = { id: string; from_addr: string; subject: string; received_at: string; classification: string };

export default async function InboxPage() {
  const account = await requireSession();
  const rows = getAccountDb(account).prepare("SELECT id, from_addr, subject, received_at, classification FROM emails WHERE job_id IS NULL ORDER BY received_at DESC").all() as Row[];
  const jobs = listJobs(account).map((j) => {
    const l = jobLabel(j, false);
    return { id: j.id, label: `${l.company} — ${l.title}` };
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Inbox</h1>
        <p className="text-sm text-muted-foreground">Job-related emails that matched no job. Link one to apply its status.</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to sort.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>Subject</TableHead><TableHead>Date</TableHead><TableHead>Job</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Badge variant={r.classification === "other" || r.classification === "auto_ack" ? "secondary" : "default"}>{r.classification.replace("_", " ")}</Badge></TableCell>
                <TableCell className="max-w-48 truncate">{r.from_addr}</TableCell>
                <TableCell className="max-w-80 truncate">{r.subject}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(r.received_at)}</TableCell>
                <TableCell><LinkEmail emailId={r.id} jobs={jobs} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
