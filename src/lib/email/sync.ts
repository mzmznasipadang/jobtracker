import type { AiSelection } from "../ai-settings";
import type { Account } from "../accounts";
import { randomUUID } from "node:crypto";
import { AiError, snapshotAi } from "../ai";
import { getAccountDb } from "../db";
import { addEvent, listJobs, setStatus, requireActiveJob } from "../jobs";
import { getKv, getSettings, setKv } from "../settings";
import type { Status } from "../types";
import { classifyEmail, emailText, keywordClassify, type Classification } from "./classify";
import { listMessages, MAX_PER_RUN } from "./gmail";
import { isJobRelated, matchJob, originalSender } from "./match";
const BACKFILL_MS = 60 * 86400000;
const STATUS: Partial<Record<Classification, Status>> = { rejection: "rejected", interview: "interview", offer: "offer" };
// LinkedIn / JobStreet notify "X sent you a message"; that is a recruiter reply even though the mail itself is a notification.
const MESSAGE_NOTICE = /sent you a message|new message/i;
const BOARD_SENDER = /@([\w-]+\.)*(linkedin\.com|jobstreet\.(com|co\.id))$/;
type StoredEmail = {
    id: string;
    original_from: string;
    subject: string;
    snippet: string;
    received_at: string;
    classification: Classification;
};
// Shared by sync and the inbox's manual link; setStatus ignores user-locked jobs, the event is recorded regardless.
function applyEmail(account: Account, jobId: number, e: StoredEmail): void {
    getAccountDb(account).transaction(() => {
        addEvent(account, jobId, "email", { emailId: e.id, classification: e.classification, subject: e.subject, from: e.original_from }, e.received_at);
        const to = STATUS[e.classification];
        if (to)
            setStatus(account, jobId, to, "email", new Date(e.received_at));
        if (to || (BOARD_SENDER.test(e.original_from) && MESSAGE_NOTICE.test(`${e.subject} ${e.snippet}`)))
            getAccountDb(account).prepare("UPDATE jobs SET first_response_at = COALESCE(first_response_at, ?) WHERE id = ?").run(e.received_at, jobId);
    })();
}
export function linkEmail(account: Account, emailId: string, jobId: number): void {
    requireActiveJob(account, jobId);
    const e = getAccountDb(account).prepare("SELECT id, original_from, subject, snippet, received_at, classification, job_id FROM emails WHERE id = ?").get(emailId) as (StoredEmail & {
        job_id: number | null;
    }) | undefined;
    if (!e)
        throw new Error("Email not found");
    if (e.job_id !== null)
        throw new Error("Email is already linked to a job");
    getAccountDb(account).transaction(() => {
        getAccountDb(account).prepare("UPDATE emails SET job_id = ? WHERE id = ?").run(jobId, emailId); // FK rejects an unknown job
        applyEmail(account, jobId, e);
    })();
}
const isAuthError = (e: unknown) => {
    const x = e as {
        message?: string;
        status?: unknown;
        code?: unknown;
        response?: {
            status?: unknown;
        };
    };
    return /invalid_grant/.test(x?.message ?? "") || [x?.status, x?.code, x?.response?.status].includes(401);
};
async function run(account: Account, now: Date, ai: AiSelection): Promise<{
    stored: number;
    skipped: number;
}> {
    const result = { stored: 0, skipped: 0 };
    const connection = getKv(account, "gmailToken");
    if (!connection)
        return result;
    const since = getKv<string>(account, "gmailLastSync") ?? new Date(now.getTime() - BACKFILL_MS).toISOString();
    let messages;
    try {
        messages = await listMessages(account, Math.floor(Date.parse(since) / 1000));
    }
    catch (e) {
        if (!isAuthError(e))
            throw e;
        if (getKv(account, "gmailToken") === connection)
            setKv(account, "gmailError", "Gmail access was revoked or expired — reconnect Gmail");
        return result;
    }
    const { outlookAddress: outlook, profile } = getSettings(account);
    const owner = getKv<string>(account, "gmailAddress") ?? profile.email;
    const known = getAccountDb(account).prepare("SELECT 1 FROM emails WHERE id = ?");
    const insert = getAccountDb(account).prepare(`INSERT INTO emails (id, thread_id, from_addr, original_from, subject, snippet, received_at, classification, job_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const email of messages) {
        if (getKv(account, "gmailToken") !== connection)
            return result;
        if (known.get(email.id))
            continue;
        const jobId = matchJob(email, listJobs(account).filter(job => !job.archivedAt), outlook, owner);
        // Privacy: unrelated mail is neither stored nor sent to Claude, and Claude only ever sees mail matched to a job.
        if (!isJobRelated(email, jobId, outlook, owner)) {
            result.skipped++;
            continue;
        }
        let policyError: string | null = null;
        let classification: Classification;
        if (jobId === null) {
            const k = keywordClassify(emailText(email));
            if (k === null) {
                result.skipped++; // e.g. a job-board digest: sender alone is not enough to keep it
                continue;
            }
            classification = k === "ambiguous" ? "other" : k;
        }
        else {
            // An AI failure must not block the whole sync; the mail is kept as "other" and stays linked to its job.
            classification = await classifyEmail(account, email, ai).catch((e) => {
                if (!(e instanceof AiError))
                    throw e;
                if (e.code === "policy")
                    policyError = e.message;
                return "other" as const;
            });
        }
        if (getKv(account, "gmailToken") !== connection)
            return result;
        const stored: StoredEmail = { id: email.id, original_from: originalSender(email, outlook, owner), subject: email.subject, snippet: email.snippet, received_at: email.receivedAt, classification };
        getAccountDb(account).transaction(() => {
            insert.run(email.id, email.threadId, email.from, stored.original_from, email.subject, email.snippet, email.receivedAt, classification, jobId);
            if (jobId !== null)
                applyEmail(account, jobId, stored);
        })();
        result.stored++;
        if (policyError) {
            setKv(account, "aiPolicyError", policyError);
            return result;
        }
        setKv(account, "aiPolicyError", null);
    }
    // A capped run resumes from its newest message (1 s back: a same-second sibling may have been cut off).
    const capped = messages.length >= MAX_PER_RUN;
    if (getKv(account, "gmailToken") === connection)
        setKv(account, "gmailLastSync", capped ? new Date(Date.parse(messages[messages.length - 1].receivedAt) - 1000).toISOString() : now.toISOString());
    return result;
}
// One run at a time: a manual "Sync now" overlapping the worker would double-process messages.
// gmailSyncing lets the UI show progress; a marker older than SYNC_STALE_MS is an orphan from a dead process.
export const SYNC_STALE_MS = 15 * 60000;
export const isSyncing = (account: Account) => {
    const m = getKv<{
        startedAt: string;
    }>(account, "gmailSyncing");
    return !!m && Date.now() - Date.parse(m.startedAt) < SYNC_STALE_MS;
};
const inflight = new Map<number, ReturnType<typeof run>>();
export function syncInbox(account: Account, now = new Date()): ReturnType<typeof run> {
    const existing = inflight.get(account.id);
    if (existing)
        return existing;
    const db = getAccountDb(account);
    const ai = snapshotAi();
    const lease = randomUUID();
    const marker = JSON.stringify({ startedAt: new Date().toISOString(), lease });
    // SQLite arbitrates between the web process and worker, not just callers in this process.
    const claimed = db.prepare(`INSERT INTO kv (key,value_json) VALUES ('gmailSyncing',?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json
    WHERE COALESCE(json_extract(kv.value_json,'$.startedAt'),'') < ?`)
        .run(marker, new Date(Date.now() - SYNC_STALE_MS).toISOString());
    if (!claimed.changes)
        return Promise.resolve({ stored: 0, skipped: 0 });
    const promise = run(account, now, ai).finally(() => {
        inflight.delete(account.id);
        db.prepare("UPDATE kv SET value_json='null' WHERE key='gmailSyncing' AND json_extract(value_json,'$.lease')=?").run(lease);
    });
    inflight.set(account.id, promise);
    return promise;
}
