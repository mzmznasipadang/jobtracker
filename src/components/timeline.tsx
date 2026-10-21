import type { JobEvent } from "@/lib/jobs";
import { fmtDate } from "@/lib/utils";

function describe(e: JobEvent): string {
  const d = e.data as Record<string, string | number | boolean | null>;
  switch (e.kind) {
    case "status":
      return d.repliedElsewhere ? "Replied elsewhere" : `Status ${d.from} → ${d.to} (${d.by})`;
    case "note":
      return String(d.text ?? "");
    case "check":
      return `Checks ran: ${d.matchScore ?? "no"} match score, salary ${d.salaryFit}, ${d.scamRisk} scam risk`;
    case "tailor":
      return `Tailored version ${d.version}`;
    case "email":
      return [
        `Email received${d.classification ? ` · ${String(d.classification).replaceAll("_", " ")}` : ""}`,
        d.from ? `From: ${d.from}` : null,
        d.subject ? `Subject: ${d.subject}` : null,
      ].filter(Boolean).join("\n");
  }
}

export function Timeline({ events }: { events: JobEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="grid gap-3 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-accent" aria-hidden />
          <p className="whitespace-pre-wrap">{describe(e)}</p>
          <time dateTime={e.at} className="text-xs text-muted-foreground">{fmtDate(e.at)}</time>
        </li>
      ))}
    </ol>
  );
}
