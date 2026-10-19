import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, getDb } from "@/lib/db";
import { AiError, askJson } from "@/lib/ai";
import { runChecks } from "@/lib/check/run";
import { Job } from "@/lib/types";
import {
  addNote, captureJob, getJob, isBusy, listEvents, listJobs, markRepliedElsewhere, retryExtraction, setStatus, startJobWork,
} from "@/lib/jobs";

vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson: vi.fn() }));
vi.mock("@/lib/check/run", () => ({ runChecks: vi.fn(async () => {}) }));
const ask = vi.mocked(askJson);
const checks = vi.mocked(runChecks);

const fields = {
  company: "Acme", companyDomain: "acme.test", title: "Engineer", location: "Jakarta", workMode: "remote" as const,
  employmentType: "full-time", salaryMin: 10, salaryMax: 20, salaryCurrency: "USD", salaryPeriod: "month" as const,
  requirements: ["TS"], niceToHave: ["Go"], description: "Build.", applyMethod: "email" as const,
  applyEmail: "jobs@acme.test", applyUrl: null, recruiterEmail: null, language: "en" as const,
};
const TEXT = "posting text";
const LI1 = "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4468726313";
const LI2 = "https://id.linkedin.com/jobs/view/4468726313/?refId=abc";
const events = (id: number) => (getDb().prepare("SELECT kind FROM events WHERE job_id = ?").all(id) as { kind: string }[]).map((e) => e.kind);

beforeEach(() => {
  resetDb();
  ask.mockReset();
  checks.mockReset();
  ask.mockResolvedValue(fields);
});

async function seed() {
  const { id, done } = await captureJob({ url: LI1, text: TEXT });
  await done;
  return id;
}

describe("captureJob", () => {
  it("extracts, round-trips a full job through the zod schema, and dedupes URL shapes", async () => {
    const a = await captureJob({ url: LI1, text: TEXT });
    expect(a.created).toBe(true);
    await a.done;
    const job = getJob(a.id)!;
    expect(Job.parse(job)).toEqual(job);
    expect(job).toMatchObject({ ...fields, url: "https://www.linkedin.com/jobs/view/4468726313", source: "linkedin", rawText: TEXT, busy: null, extractError: null, status: "saved" });
    const b = await captureJob({ url: LI2 });
    expect(b).toMatchObject({ id: a.id, created: false });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps the job when extraction fails, then retries", async () => {
    ask.mockRejectedValueOnce(new AiError("api", "overloaded"));
    const { id, done } = await captureJob({ url: LI1, text: TEXT });
    await done;
    expect(getJob(id)).toMatchObject({ rawText: TEXT, busy: null, extractError: expect.stringContaining("overloaded") });
    await retryExtraction(id);
    expect(getJob(id)).toMatchObject({ company: "Acme", extractError: null, busy: null });
  });

  it("runs checks only after a successful extraction; a failing check keeps the extracted fields", async () => {
    ask.mockRejectedValueOnce(new AiError("api", "overloaded"));
    const a = await captureJob({ url: LI1, text: TEXT });
    await a.done;
    expect(checks).not.toHaveBeenCalled();
    await retryExtraction(a.id);
    expect(checks).toHaveBeenCalledWith(a.id);
    checks.mockRejectedValueOnce(new AiError("api", "check down"));
    await retryExtraction(a.id);
    expect(getJob(a.id)).toMatchObject({ company: "Acme", extractError: null, busy: null, busyError: expect.stringContaining("check down") });
  });

  it("throws when the page cannot be fetched and no text is given", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }));
    await expect(captureJob({ url: "https://example.com/job" })).rejects.toThrow("HTTP 403");
    vi.unstubAllGlobals();
    expect(listJobs()).toHaveLength(0);
  });
});

describe("startJobWork", () => {
  it("stores busy_error and clears busy when work rejects", async () => {
    const id = await seed();
    await startJobWork(id, "checking", async () => { throw new Error("chromium died"); });
    expect(getJob(id)).toMatchObject({ busy: null, busyError: "chromium died" });
  });

  it("throws synchronously while busy", async () => {
    const id = await seed();
    let release!: () => void;
    const p = startJobWork(id, "tailoring", () => new Promise<void>((r) => (release = r)));
    expect(getJob(id)!.busy).toBe("tailoring");
    expect(() => startJobWork(id, "checking", async () => {})).toThrow(/busy/);
    release();
    await p;
    expect(getJob(id)).toMatchObject({ busy: null, busyError: null });
  });
});

describe("stale busy", () => {
  const busyAgo = (id: number, ms: number) =>
    getDb().prepare("UPDATE jobs SET busy='checking', busy_since=? WHERE id=?").run(new Date(Date.now() - ms).toISOString(), id);

  it("claims a job busy for 16 min but not one busy for 1 min", async () => {
    const id = await seed();
    busyAgo(id, 1 * 60_000);
    expect(() => startJobWork(id, "tailoring", async () => {})).toThrow(/busy/);
    busyAgo(id, 16 * 60_000);
    await startJobWork(id, "tailoring", async () => {});
    expect(getJob(id)).toMatchObject({ busy: null, busySince: null });
  });
});

describe("setStatus", () => {
  it("user status locks; email/ghost then no-op", async () => {
    const id = await seed();
    setStatus(id, "rejected", "user");
    setStatus(id, "interview", "email");
    setStatus(id, "ghosted", "ghost");
    expect(getJob(id)).toMatchObject({ status: "rejected", statusLocked: true, reachedInterview: false });
    expect(events(id)).toEqual(["status"]);
  });

  it("applied by user does not lock and stamps applied_at once", async () => {
    const id = await seed();
    const t1 = new Date("2026-01-01T00:00:00Z");
    setStatus(id, "applied", "user", t1);
    setStatus(id, "applied", "user", new Date("2026-02-01T00:00:00Z"));
    expect(getJob(id)).toMatchObject({ status: "applied", statusLocked: false, appliedAt: t1.toISOString() });
    setStatus(id, "interview", "email");
    expect(getJob(id)).toMatchObject({ status: "interview", reachedInterview: true });
    expect(events(id)).toHaveLength(3);
  });

  it("markRepliedElsewhere sets first_response_at once; addNote writes an event", async () => {
    const id = await seed();
    markRepliedElsewhere(id);
    const first = getJob(id)!.firstResponseAt;
    expect(first).not.toBeNull();
    markRepliedElsewhere(id);
    addNote(id, "called them");
    expect(getJob(id)!.firstResponseAt).toBe(first);
    expect(events(id)).toEqual(["status", "status", "note"]);
  });
});

describe("listEvents", () => {
  it("returns events newest first with parsed data", async () => {
    const id = await seed();
    addNote(id, "first");
    getDb().prepare("UPDATE events SET at = '2026-01-01T00:00:00.000Z' WHERE job_id = ?").run(id);
    setStatus(id, "applied", "user", new Date("2026-02-01T00:00:00Z"));
    addNote(id, "last");
    const e = listEvents(id);
    expect(e.map((x) => x.kind)).toEqual(["note", "status", "note"]);
    expect(e[0].data).toEqual({ text: "last" });
    expect(e[1].data).toEqual({ from: "saved", to: "applied", by: "user" });
  });
});

describe("retryExtraction with edited text", () => {
  it("stores the new text and extracts from it", async () => {
    const id = await seed();
    await retryExtraction(id, "edited text");
    expect(getJob(id)!.rawText).toBe("edited text");
    expect(ask).toHaveBeenLastCalledWith(expect.objectContaining({ content: expect.stringContaining("edited text") }));
  });
  it("does not touch the text while the job is busy", async () => {
    const id = await seed();
    getDb().prepare("UPDATE jobs SET busy='checking', busy_since=? WHERE id=?").run(new Date().toISOString(), id);
    expect(() => retryExtraction(id, "x")).toThrow(/busy/);
    expect(getJob(id)!.rawText).toBe(TEXT);
  });
});

describe("isBusy", () => {
  it("ignores a stale marker", () => {
    const at = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(isBusy({ busy: "checking", busySince: at(60_000) })).toBe(true);
    expect(isBusy({ busy: "checking", busySince: at(16 * 60_000) })).toBe(false);
    expect(isBusy({ busy: null, busySince: null })).toBe(false);
  });
});

describe("listJobs", () => {
  it("filters by status and source", async () => {
    const id = await seed();
    setStatus(id, "applied", "user");
    expect(listJobs({ status: "applied" })).toHaveLength(1);
    expect(listJobs({ status: "saved" })).toHaveLength(0);
    expect(listJobs({ source: "glints" })).toHaveLength(0);
  });
});
