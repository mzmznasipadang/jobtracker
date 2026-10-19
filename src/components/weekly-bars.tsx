import type { PublicStats } from "@/lib/metrics";

const HEIGHT = 120;
const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Single series, so no legend: the heading names it. Value labels only on the peak and latest weeks;
// every bar has a tooltip and the full data is in the table for screen readers.
export function WeeklyBars({ weekly }: { weekly: PublicStats["weekly"] }) {
  const max = Math.max(...weekly.map((w) => w.sent), 1);
  const peak = weekly.findIndex((w) => w.sent === max && max > 0);
  return (
    <figure>
      <div className="flex items-end gap-2 border-b border-border" style={{ height: HEIGHT + 20 }} aria-hidden>
        {weekly.map((w, i) => {
          const show = w.sent > 0 && (i === peak || i === weekly.length - 1);
          return (
            <div key={w.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`Week of ${label(w.weekStart)}: ${w.sent} sent`}>
              <span className="h-5 text-xs font-medium tabular-nums">{show ? w.sent : ""}</span>
              <div
                className="w-full max-w-6 rounded-t bg-primary"
                style={{ height: w.sent ? Math.max((w.sent / max) * HEIGHT, 4) : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>{label(weekly[0].weekStart)}</span>
        <span>{label(weekly[weekly.length - 1].weekStart)}</span>
      </div>
      <table className="sr-only">
        <caption>Applications sent per week</caption>
        <thead><tr><th>Week starting</th><th>Sent</th></tr></thead>
        <tbody>{weekly.map((w) => <tr key={w.weekStart}><td>{label(w.weekStart)}</td><td>{w.sent}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
