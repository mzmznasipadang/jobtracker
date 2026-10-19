import { getDb } from "../db";
import { addEvent, listJobs, setStatus } from "../jobs";
import { getKv, getSettings, setKv } from "../settings";
import type { Status } from "../types";
import { classifyEmail, type Classification } from "./classify";
import { listMessages, MAX_PER_RUN } from "./gmail";
import { isJobRelated, matchJob, originalSender } from "./match";

const BACKFILL_MS = 60 * 86_400_000;
const STATUS: Partial<Record<Classification, Status>> = { rejection: "rejected", interview: "interview", offer: "offer" };
// LinkedIn / JobStreet notify "X sent you a message"; that is a recruiter reply even though the mail itself is a notification.
const MESSAGE_NOTICE = /sent you a message|new message/i;
const BOARD_SENDER = /@([\w-]+\.)*(linkedin\.com|jobstreet\.(com|co\.id))$/;

type StoredEmail = { id: string; original_from: string; subject: string; snippet: string; received_at: string; classification: Classification };

// Shared by sync and the inbox's manual link; setStatus ignores user-locked jobs, the event is recorded regardless.
function applyEmail(jobId: number, e: StoredEmail): void {
  getDb().transaction(() => {
    addEvent(jobId, "email", { emailId: e.id, classification: e.classification, subject: e.subject, from: e.original_from }, e.received_at);
    const to = STATUS[e.classification];
    if (to) setStatus(jobId, to, "email", new Date(e.received_at));
    if (to || (BOARD_SENDER.test(e.original_from) && MESSAGE_NOTICE.test(`${e.subject} ${e.snippet}`)))
      getDb().prepare("UPDATE jobs SET first_response_at = COALESCE(first_response_at, ?) WHERE id = ?").run(e.received_at, jobId);
  })();
}

export function linkEmail(emailId: string, jobId: number): void {
  const e = getDb().prepare("SELECT id, original_from, subject, snippet, received_at, classification, job_id FROM emails WHERE id = ?").get(emailId) as
    (StoredEmail & { job_id: number | null }) | undefined;
  if (!e) throw new Error("Email not found");
  if (e.job_id !== null) throw new Error("Email is already linked to a job");
  getDb().transaction(() => {
    getDb().prepare("UPDATE emails SET job_id = ? WHERE id = ?").run(jobId, emailId); // FK rejects an unknown job
    applyEmail(jobId, e);
  })();
}

const isAuthError = (e: unknown) => {
  const x = e as { message?: string; status?: unknown; code?: unknown; response?: { status?: unknown } };
  return /invalid_grant/.test(x?.message ?? "") || [x?.status, x?.code, x?.response?.status].includes(401);
};

async function run(now: Date): Promise<{ stored: number; skipped: number }> {
  const result = { stored: 0, skipped: 0 };
  if (!getKv("gmailToken")) return result;
  const since = getKv<string>("gmailLastSync") ?? new Date(now.getTime() - BACKFILL_MS).toISOString();
  let messages;
  try {
    messages = await listMessages(Math.floor(Date.parse(since) / 1000));
  } catch (e) {
    if (!isAuthError(e)) throw e;
    setKv("gmailError", "Gmail access was revoked or expired — reconnect Gmail");
    return result;
  }

  const outlook = getSettings().outlookAddress;
  const known = getDb().prepare("SELECT 1 FROM emails WHERE id = ?");
  const insert = getDb().prepare(`INSERT INTO emails (id, thread_id, from_addr, original_from, subject, snippet, received_at, classification, job_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const email of messages) {
    if (known.get(email.id)) continue;
    const jobId = matchJob(email, listJobs(), outlook);
    // Privacy: unrelated mail is neither stored nor sent to Claude.
    if (!isJobRelated(email, jobId, outlook)) {
      result.skipped++;
      continue;
    }
    const classification = await classifyEmail(email);
    const stored: StoredEmail = { id: email.id, original_from: originalSender(email, outlook), subject: email.subject, snippet: email.snippet, received_at: email.receivedAt, classification };
    getDb().transaction(() => {
      insert.run(email.id, email.threadId, email.from, stored.original_from, email.subject, email.snippet, email.receivedAt, classification, jobId);
      if (jobId !== null) applyEmail(jobId, stored);
    })();
    result.stored++;
  }

  // A capped run resumes from its newest message (1 s back: a same-second sibling may have been cut off).
  const capped = messages.length >= MAX_PER_RUN;
  setKv("gmailLastSync", capped ? new Date(Date.parse(messages[messages.length - 1].receivedAt) - 1000).toISOString() : now.toISOString());
  return result;
}

// One run at a time: a manual "Sync now" overlapping the worker would double-process messages.
let inflight: ReturnType<typeof run> | null = null;
export function syncInbox(now = new Date()): ReturnType<typeof run> {
  return (inflight ??= run(now).finally(() => (inflight = null)));
}
