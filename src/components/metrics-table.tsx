import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PublicStats } from "@/lib/metrics";
import type { Source } from "@/lib/types";

export const SOURCE_LABEL: Record<Source, string> = {
  linkedin: "LinkedIn", jobstreet: "JobStreet", glints: "Glints", wellfound: "Wellfound", kalibrr: "Kalibrr",
  dealls: "Dealls", upwork: "Upwork", contra: "Contra", toptal: "Toptal", projects: "Projects.co.id",
  sribulancer: "Sribulancer", fastwork: "Fastwork", other: "Other",
};

export const notEnoughData = (ghostDays: number) => `Not enough data yet (applications under ${ghostDays} days old aren't counted)`;

export function Rate({ value, ghostDays }: { value: number | null; ghostDays: number }) {
  if (value == null) return <span title={notEnoughData(ghostDays)} aria-label={notEnoughData(ghostDays)}>—</span>;
  return <>{Math.round(value * 100)}%</>;
}

export function MetricsTable({ sources, ghostDays }: { sources: PublicStats["sources"]; ghostDays: number }) {
  if (!sources.length) return <p className="text-sm text-muted-foreground">No applications sent yet.</p>;
  return (
    <div>
      <Table className="text-xs tabular-nums sm:text-sm [&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-2 sm:[&_th]:px-2">
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Response</TableHead>
            <TableHead className="text-right">Interview</TableHead>
            <TableHead className="text-right">Ghosted</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((s) => (
            <TableRow key={s.source}>
              <TableCell className="font-medium">{SOURCE_LABEL[s.source]}</TableCell>
              <TableCell className="text-right">{s.sent}</TableCell>
              <TableCell className="text-right"><Rate value={s.responseRate} ghostDays={ghostDays} /></TableCell>
              <TableCell className="text-right"><Rate value={s.interviewRate} ghostDays={ghostDays} /></TableCell>
              <TableCell className="text-right"><Rate value={s.ghostRate} ghostDays={ghostDays} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Rates count only applications at least {ghostDays} days old. “—” means {notEnoughData(ghostDays).toLowerCase()}.</p>
    </div>
  );
}
