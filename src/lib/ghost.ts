import type { Account } from "./accounts";
import { getAccountDb } from "./db";
import { addEvent, setStatus, requireActiveJob, getJob } from "./jobs";
import { getSettings } from "./settings";
const DAY_MS = 86400000;
// Locked jobs are skipped: the user set that status on purpose.
export function runGhostDetection(account: Account, now = new Date()): {
    flagged: number;
    ghosted: number;
} {
    const { followUpDays, ghostDays } = getSettings(account).pipeline;
    const rows = getAccountDb(account)
        .prepare("SELECT id, applied_at, follow_up_due FROM jobs WHERE archived_at IS NULL AND status = 'applied' AND first_response_at IS NULL AND status_locked = 0 AND applied_at IS NOT NULL")
        .all() as {
        id: number;
        applied_at: string;
        follow_up_due: number;
    }[];
    let flagged = 0, ghosted = 0;
    for (const candidate of rows) {
      getAccountDb(account).transaction(()=>{
        const current=getJob(account,candidate.id);
        if(!current||current.archivedAt||current.status!=='applied'||current.statusLocked||current.firstResponseAt||!current.appliedAt)return;
        const r={id:current.id,applied_at:current.appliedAt,follow_up_due:current.followUpDue};
        const days = (now.getTime() - Date.parse(r.applied_at)) / DAY_MS;
        if (days >= ghostDays) {
            setStatus(account, r.id, "ghosted", "ghost", now);
            getAccountDb(account).prepare("UPDATE jobs SET follow_up_due = 0 WHERE id = ?").run(r.id);
            ghosted++;
        }
        else if (days >= followUpDays && !r.follow_up_due) {
            getAccountDb(account).prepare("UPDATE jobs SET follow_up_due = 1, updated_at = ? WHERE id = ?").run(now.toISOString(), r.id);
            addEvent(account, r.id, "note", { text: `Follow-up due: no reply after ${followUpDays} days` }, now.toISOString());
            flagged++;
        }
      }).immediate();
    }
    return { flagged, ghosted };
}
export function clearFollowUp(account: Account, id: number): void {
    getAccountDb(account).transaction(() => {
        requireActiveJob(account, id);
        getAccountDb(account).prepare("UPDATE jobs SET follow_up_due = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
        addEvent(account, id, "note", { text: "Followed up" });
    }).immediate();
}
