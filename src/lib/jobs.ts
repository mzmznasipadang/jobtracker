import type { Account } from "./accounts";
import { AiError } from "./ai";
import { runChecks } from "./check/run";
import { extractJob } from "./capture/extract";
import { fetchJobText } from "./capture/fetch";
import { canonicalUrl, fetchUrlFor, sourceFromUrl } from "./capture/url";
import { getAccountDb } from "./db";
import { Job, Source, type Status } from "./types";

type Row = Record<string, unknown>;
type Busy = NonNullable<Job["busy"]>;
type EventKind = "status" | "email" | "note" | "check" | "tailor";

export const BUSY_STALE_MS = 15 * 60 * 1000;

const now = () => new Date().toISOString();

function toJob(r: Row): Job {
  return Job.parse({
    id: r.id, url: r.url, source: Source.safeParse(r.source).success ? r.source : "other", status: r.status, busy: r.busy, busySince: r.busy_since, busyError: r.busy_error,
    statusLocked: !!r.status_locked, company: r.company, companyDomain: r.company_domain, title: r.title,
    location: r.location, workMode: r.work_mode, employmentType: r.employment_type,
    salaryMin: r.salary_min, salaryMax: r.salary_max, salaryCurrency: r.salary_currency, salaryPeriod: r.salary_period,
    requirements: JSON.parse(r.requirements as string), niceToHave: JSON.parse(r.nice_to_have as string),
    description: r.description, applyMethod: r.apply_method, applyEmail: r.apply_email, applyUrl: r.apply_url,
    recruiterEmail: r.recruiter_email, language: r.language, rawText: r.raw_text, extractError: r.extract_error,
    matchScore: r.match_score, matchJson: r.match_json, salaryFit: r.salary_fit, scamRisk: r.scam_risk,
    scamJson: r.scam_json, followUpDue: !!r.follow_up_due, appliedAt: r.applied_at, firstResponseAt: r.first_response_at,
    reachedInterview: !!r.reached_interview, createdAt: r.created_at, updatedAt: r.updated_at,
  });
}

export function getJob(account: Account, id: number): Job | null {
  const r = getAccountDb(account).prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
  return r ? toJob(r) : null;
}

export function listJobs(account: Account, filter: { status?: Status; source?: Source } = {}): Job[] {
  const rows = getAccountDb(account)
    .prepare("SELECT * FROM jobs WHERE (@status IS NULL OR status = @status) AND (@source IS NULL OR source = @source) ORDER BY updated_at DESC, id DESC")
    .all({ status: filter.status ?? null, source: filter.source ?? null }) as Row[];
  return rows.map(toJob);
}

export function addEvent(account: Account, jobId: number, kind: EventKind, data: unknown, at = now()): void {
  getAccountDb(account).prepare("INSERT INTO events (job_id, at, kind, data_json) VALUES (?, ?, ?, ?)").run(jobId, at, kind, JSON.stringify(data));
}

export type JobEvent = { id: number; at: string; kind: EventKind; data: Record<string, unknown> };

export function listEvents(account: Account, jobId: number): JobEvent[] {
  const rows = getAccountDb(account).prepare("SELECT id, at, kind, data_json FROM events WHERE job_id = ? ORDER BY at DESC, id DESC").all(jobId) as
    { id: number; at: string; kind: EventKind; data_json: string | null }[];
  return rows.map((r) => ({ id: r.id, at: r.at, kind: r.kind, data: r.data_json ? JSON.parse(r.data_json) : {} }));
}

export const addNote = (account: Account, jobId: number, text: string) => addEvent(account, jobId, "note", { text });

// A busy marker older than BUSY_STALE_MS is an orphan, not work in progress.
export const isBusy = (j: Pick<Job, "busy" | "busySince">) => !!j.busy && !!j.busySince && Date.now() - Date.parse(j.busySince) < BUSY_STALE_MS;

// Throws synchronously if the job is already busy. The returned promise never rejects.
export function startJobWork(account: Account, jobId: number, kind: Busy, work: () => Promise<void>): Promise<void> {
  // Single conditional UPDATE so two callers can't both claim the job; a busy job older than
  // BUSY_STALE_MS is presumed orphaned (e.g. server restart mid-work) and can be re-claimed.
  const t = now();
  const stale = new Date(Date.now() - BUSY_STALE_MS).toISOString();
  const claimed = getAccountDb(account)
    .prepare("UPDATE jobs SET busy = ?, busy_since = ?, busy_error = NULL, updated_at = ? WHERE id = ? AND (busy IS NULL OR busy_since < ?)")
    .run(kind, t, t, jobId, stale);
  if (claimed.changes === 0) throw new Error(getJob(account, jobId) ? `Job ${jobId} is busy` : `Job ${jobId} not found`);
  const finish = (error: string | null) =>
    getAccountDb(account).prepare("UPDATE jobs SET busy = NULL, busy_since = NULL, busy_error = ?, updated_at = ? WHERE id = ?").run(error, now(), jobId);
  return work().then(
    () => void finish(null),
    (e) => void finish(e instanceof Error ? e.message : String(e)),
  ).catch(() => {});
}

async function extractWork(account: Account, id: number): Promise<void> {
  const job = getJob(account, id)!;
  try {
    const f = await extractJob(account, job.rawText ?? "", job.url);
    getAccountDb(account).prepare(`UPDATE jobs SET company=?, company_domain=?, title=?, location=?, work_mode=?, employment_type=?,
      salary_min=?, salary_max=?, salary_currency=?, salary_period=?, requirements=?, nice_to_have=?, description=?,
      apply_method=?, apply_email=?, apply_url=?, recruiter_email=?, language=?, extract_error=NULL, updated_at=? WHERE id=?`)
      .run(f.company, f.companyDomain, f.title, f.location, f.workMode, f.employmentType, f.salaryMin, f.salaryMax,
        f.salaryCurrency, f.salaryPeriod, JSON.stringify(f.requirements), JSON.stringify(f.niceToHave), f.description,
        f.applyMethod, f.applyEmail, f.applyUrl, f.recruiterEmail, f.language, now(), id);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    getAccountDb(account).prepare("UPDATE jobs SET extract_error = ?, updated_at = ? WHERE id = ?").run(`${e.code}: ${e.message}`, now(), id);
    return; // job and raw_text are kept so retryExtraction can run later
  }
  // Not caught: a failed check surfaces as busy_error while the extracted fields stay saved.
  await runChecks(account, id);
}

// `text` replaces the stored text first (the user edited it); written only after the job is claimed.
export function retryExtraction(account: Account, id: number, text?: string): Promise<void> {
  if (text === undefined && getJob(account, id)?.rawText == null) throw new Error(`Job ${id} has no stored text to extract`);
  return startJobWork(account, id, "extracting", async () => {
    if (text !== undefined) getAccountDb(account).prepare("UPDATE jobs SET raw_text = ? WHERE id = ?").run(text, id);
    await extractWork(account, id);
  });
}

export async function captureJob(account: Account, input: { url: string; text?: string }): Promise<{ id: number; created: boolean; done: Promise<void> }> {
  const url = canonicalUrl(input.url);
  const existing = getAccountDb(account).prepare("SELECT id FROM jobs WHERE url = ?").get(url) as { id: number } | undefined;
  if (existing) return { id: existing.id, created: false, done: Promise.resolve() };

  let text = input.text;
  if (text === undefined) {
    const r = await fetchJobText(fetchUrlFor(url));
    if (!r.ok) throw new Error(`Could not fetch the posting (${r.reason}); paste its text instead`);
    text = r.text;
  }
  // company/title are NOT NULL; extraction fills them in.
  const id = Number(getAccountDb(account).prepare("INSERT INTO jobs (url, source, company, title, raw_text) VALUES (?, ?, '', '', ?)").run(url, sourceFromUrl(url), text).lastInsertRowid);
  return { id, created: true, done: startJobWork(account, id, "extracting", () => extractWork(account, id)) };
}

export function setStatus(account: Account, id: number, status: Status, by: "user" | "email" | "ghost", at = new Date()): void {
  const job = getJob(account, id);
  if (!job) throw new Error(`Job ${id} not found`);
  if (by !== "user" && job.statusLocked) return;
  const iso = at.toISOString();
  getAccountDb(account).transaction(() => {
    getAccountDb(account).prepare(`UPDATE jobs SET status = @status,
      status_locked = CASE WHEN @lock THEN 1 ELSE status_locked END,
      applied_at = CASE WHEN @status = 'applied' THEN COALESCE(applied_at, @at) ELSE applied_at END,
      reached_interview = CASE WHEN @status IN ('interview','offer') THEN 1 ELSE reached_interview END,
      updated_at = @at WHERE id = @id`)
      .run({ id, status, at: iso, lock: by === "user" && status !== "applied" ? 1 : 0 });
    addEvent(account, id, "status", { from: job.status, to: status, by }, iso);
  })();
}

export function markRepliedElsewhere(account: Account, id: number): void {
  const iso = now();
  getAccountDb(account).transaction(() => {
    getAccountDb(account).prepare("UPDATE jobs SET first_response_at = COALESCE(first_response_at, ?), updated_at = ? WHERE id = ?").run(iso, iso, id);
    addEvent(account, id, "status", { repliedElsewhere: true }, iso);
  })();
}
