import { listJobs } from "./jobs";
import { getSettings } from "./settings";
import type { Job, Source } from "./types";

export type Rates = { responseRate: number | null; interviewRate: number | null; ghostRate: number | null };
export type PublicStats = {
  updatedAt: string;
  totals: Rates & { sent: number };
  sources: (Rates & { source: Source; sent: number })[];
  weekly: { weekStart: string; sent: number }[];
};

const DAY = 86_400_000;
const WEEKS = 12;
const JAKARTA_OFFSET = 7 * 3_600_000; // fixed +07:00, no DST

// Monday (Jakarta) of the week containing `ms`, as YYYY-MM-DD.
function weekStart(ms: number): string {
  const local = new Date(ms + JAKARTA_OFFSET); // read with UTC getters = Jakarta wall clock
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday)).toISOString().slice(0, 10);
}

function summarize(sent: Job[], cutoff: number): Rates & { sent: number } {
  const eligible = sent.filter((j) => Date.parse(j.appliedAt!) <= cutoff);
  const rate = (n: number) => (eligible.length ? n / eligible.length : null);
  return {
    sent: sent.length,
    responseRate: rate(eligible.filter((j) => j.firstResponseAt).length),
    interviewRate: rate(eligible.filter((j) => j.reachedInterview).length),
    ghostRate: rate(eligible.filter((j) => j.status === "ghosted").length),
  };
}

export function computeMetrics(now = new Date()): PublicStats {
  const sent = listJobs().filter((j) => j.appliedAt);
  const cutoff = now.getTime() - getSettings().pipeline.ghostDays * DAY;

  const bySource = new Map<Source, Job[]>();
  for (const j of sent) bySource.set(j.source, [...(bySource.get(j.source) ?? []), j]);

  const weeks = new Map<string, number>();
  for (let i = WEEKS - 1; i >= 0; i--) weeks.set(weekStart(now.getTime() - i * 7 * DAY), 0);
  for (const j of sent) {
    const w = weekStart(Date.parse(j.appliedAt!));
    if (weeks.has(w)) weeks.set(w, weeks.get(w)! + 1);
  }

  return {
    updatedAt: now.toISOString(),
    totals: summarize(sent, cutoff),
    sources: [...bySource].map(([source, jobs]) => ({ source, ...summarize(jobs, cutoff) })).sort((a, b) => b.sent - a.sent),
    weekly: [...weeks].map(([start, n]) => ({ weekStart: start, sent: n })),
  };
}
