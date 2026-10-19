import { getDb } from "./db";
import { addEvent, setStatus } from "./jobs";
import { getSettings } from "./settings";

const DAY_MS = 86_400_000;

// Locked jobs are skipped: the user set that status on purpose.
export function runGhostDetection(now = new Date()): { flagged: number; ghosted: number } {
  const { followUpDays, ghostDays } = getSettings().pipeline;
  const rows = getDb()
    .prepare("SELECT id, applied_at, follow_up_due FROM jobs WHERE status = 'applied' AND first_response_at IS NULL AND status_locked = 0 AND applied_at IS NOT NULL")
    .all() as { id: number; applied_at: string; follow_up_due: number }[];
  let flagged = 0, ghosted = 0;
  for (const r of rows) {
    const days = (now.getTime() - Date.parse(r.applied_at)) / DAY_MS;
    if (days >= ghostDays) {
      setStatus(r.id, "ghosted", "ghost", now);
      getDb().prepare("UPDATE jobs SET follow_up_due = 0 WHERE id = ?").run(r.id);
      ghosted++;
    } else if (days >= followUpDays && !r.follow_up_due) {
      getDb().prepare("UPDATE jobs SET follow_up_due = 1, updated_at = ? WHERE id = ?").run(now.toISOString(), r.id);
      addEvent(r.id, "note", { text: `Follow-up due: no reply after ${followUpDays} days` }, now.toISOString());
      flagged++;
    }
  }
  return { flagged, ghosted };
}

export function clearFollowUp(id: number): void {
  getDb().transaction(() => {
    getDb().prepare("UPDATE jobs SET follow_up_due = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    addEvent(id, "note", { text: "Followed up" });
  })();
}
