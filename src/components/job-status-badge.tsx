import { Badge } from "@/components/ui/badge";
import type { Job, Status } from "@/lib/types";
import { cn } from "@/lib/utils";

// Tinted fills over the --success/--warning/--danger tokens stay readable in light and dark.
const GOOD = "bg-success/15 text-success";
const WARN = "bg-warning/15 text-warning";
const BAD = "bg-danger/15 text-danger";

const STATUS: Record<Status, string> = {
  saved: "bg-secondary text-secondary-foreground",
  ready: "bg-primary/10 text-primary",
  applied: "bg-accent/25 text-foreground",
  interview: WARN,
  offer: GOOD,
  rejected: BAD,
  ghosted: "bg-muted text-muted-foreground",
  skipped: "border-border bg-transparent text-muted-foreground",
};

export const STATUSES = Object.keys(STATUS) as Status[];
export const statusLabel = (s: string) => s[0].toUpperCase() + s.slice(1);

export const StatusBadge = ({ status }: { status: Status }) => <Badge className={STATUS[status]}>{statusLabel(status)}</Badge>;

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  return <Badge className={score >= 70 ? GOOD : score >= 50 ? WARN : BAD} title="Match score">{score}% match</Badge>;
}

const FIT: Record<NonNullable<Job["salaryFit"]>, [string, string]> = {
  ok: ["Salary ok", GOOD],
  above_range: ["Above range", WARN],
  below_minimum: ["Below minimum", BAD],
  unknown: ["Salary unknown", "bg-muted text-muted-foreground"],
};

export function SalaryFitBadge({ fit }: { fit: Job["salaryFit"] }) {
  if (!fit) return null;
  const [label, cls] = FIT[fit];
  return <Badge className={cls}>{label}</Badge>;
}

export function ScamBadge({ risk, always }: { risk: Job["scamRisk"]; always?: boolean }) {
  if (!risk || (risk === "low" && !always)) return null; // a low risk is noise on a card
  return <Badge className={cn(risk === "high" ? BAD : risk === "medium" ? WARN : GOOD)}>{statusLabel(risk)} scam risk</Badge>;
}

// Placeholder rows have empty company/title until extraction finishes.
export function jobLabel(j: Pick<Job, "company" | "title" | "url" | "extractError" | "busy">, busy: boolean): { company: string; title: string } {
  if (j.company || j.title) return { company: j.company, title: j.title };
  const host = new URL(j.url).hostname.replace(/^www\./, "");
  return { company: host, title: busy && j.busy === "extracting" ? "Extracting…" : j.extractError ? "Extraction failed" : "Untitled job" };
}
