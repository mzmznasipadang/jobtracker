import { getOwnerAccount } from "@/lib/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, getAccountDb } from "@/lib/db";
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
const events = (id: number) => (getAccountDb(getOwnerAccount()).prepare("SELECT kind FROM events WHERE job_id = ?").all(id) as { kind: string }[]).map((e) => e.kind);

beforeEach(() => {
  resetDb();
  ask.mockReset();
  checks.mockReset();
  ask.mockResolvedValue(fields);
});

async function seed() {
  const { id, done } = await captureJob(getOwnerAccount(), { url: LI1, text: TEXT });
  await done;
  return id;
}

describe("captureJob", () => {
  it("extracts, round-trips a full job through the zod schema, and dedupes URL shapes", async () => {
    const a = await captureJob(getOwnerAccount(), { url: LI1, text: TEXT });
    expect(a.created).toBe(true);
    await a.done;
    const job = getJob(getOwnerAccount(), a.id)!;
    expect(Job.parse(job)).toEqual(job);
    expect(job).toMatchObject({ ...fields, url: "https://www.linkedin.com/jobs/view/4468726313", source: "linkedin", rawText: TEXT, busy: null, extractError: null, status: "saved" });
    const b = await captureJob(getOwnerAccount(), { url: LI2 });
    expect(b).toMatchObject({ id: a.id, created: false });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("keeps the job when extraction fails, then retries", async () => {
    ask.mockRejectedValueOnce(new AiError("api", "overloaded"));
    const { id, done } = await captureJob(getOwnerAccount(), { url: LI1, text: TEXT });
    await done;
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ rawText: TEXT, busy: null, extractError: expect.stringContaining("overloaded") });
    await retryExtraction(getOwnerAccount(), id);
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ company: "Acme", extractError: null, busy: null });
  });

  it("runs checks only after a successful extraction; a failing check keeps the extracted fields", async () => {
    ask.mockRejectedValueOnce(new AiError("api", "overloaded"));
    const a = await captureJob(getOwnerAccount(), { url: LI1, text: TEXT });
    await a.done;
    expect(checks).not.toHaveBeenCalled();
    await retryExtraction(getOwnerAccount(), a.id);
    expect(checks).toHaveBeenCalledWith(getOwnerAccount(), a.id, expect.objectContaining({provider:"anthropic"}));
    checks.mockRejectedValueOnce(new AiError("api", "check down"));
    await retryExtraction(getOwnerAccount(), a.id);
    expect(getJob(getOwnerAccount(), a.id)).toMatchObject({ company: "Acme", extractError: null, busy: null, busyError: expect.stringContaining("check down") });
  });

  it("throws when the page cannot be fetched and no text is given", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }));
    await expect(captureJob(getOwnerAccount(), { url: "https://example.com/job" })).rejects.toThrow("HTTP 403");
    vi.unstubAllGlobals();
    expect(listJobs(getOwnerAccount())).toHaveLength(0);
  });
});

describe("startJobWork", () => {
  it("stores busy_error and clears busy when work rejects", async () => {
    const id = await seed();
    await startJobWork(getOwnerAccount(), id, "checking", async () => { throw new Error("chromium died"); });
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ busy: null, busyError: "chromium died" });
  });

  it("throws synchronously while busy", async () => {
    const id = await seed();
    let release!: () => void;
    const p = startJobWork(getOwnerAccount(), id, "tailoring", () => new Promise<void>((r) => (release = r)));
    expect(getJob(getOwnerAccount(), id)!.busy).toBe("tailoring");
    expect(() => startJobWork(getOwnerAccount(), id, "checking", async () => {})).toThrow(/busy/);
    release();
    await p;
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ busy: null, busyError: null });
  });
});

describe("stale busy", () => {
  const busyAgo = (id: number, ms: number) =>
    getAccountDb(getOwnerAccount()).prepare("UPDATE jobs SET busy='checking', busy_since=? WHERE id=?").run(new Date(Date.now() - ms).toISOString(), id);

  it("claims a job busy for 16 min but not one busy for 1 min", async () => {
    const id = await seed();
    busyAgo(id, 1 * 60_000);
    expect(() => startJobWork(getOwnerAccount(), id, "tailoring", async () => {})).toThrow(/busy/);
    busyAgo(id, 16 * 60_000);
    await startJobWork(getOwnerAccount(), id, "tailoring", async () => {});
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ busy: null, busySince: null });
  });
});

describe("setStatus", () => {
  it("user status locks; email/ghost then no-op", async () => {
    const id = await seed();
    setStatus(getOwnerAccount(), id, "rejected", "user");
    setStatus(getOwnerAccount(), id, "interview", "email");
    setStatus(getOwnerAccount(), id, "ghosted", "ghost");
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ status: "rejected", statusLocked: true, reachedInterview: false });
    expect(events(id)).toEqual(["status"]);
  });

  it("applied by user does not lock and stamps applied_at once", async () => {
    const id = await seed();
    const t1 = new Date("2026-01-01T00:00:00Z");
    setStatus(getOwnerAccount(), id, "applied", "user", t1);
    setStatus(getOwnerAccount(), id, "applied", "user", new Date("2026-02-01T00:00:00Z"));
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ status: "applied", statusLocked: false, appliedAt: t1.toISOString() });
    setStatus(getOwnerAccount(), id, "interview", "email");
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ status: "interview", reachedInterview: true });
    expect(events(id)).toHaveLength(3);
  });

  it("markRepliedElsewhere sets first_response_at once; addNote writes an event", async () => {
    const id = await seed();
    markRepliedElsewhere(getOwnerAccount(), id);
    const first = getJob(getOwnerAccount(), id)!.firstResponseAt;
    expect(first).not.toBeNull();
    markRepliedElsewhere(getOwnerAccount(), id);
    addNote(getOwnerAccount(), id, "called them");
    expect(getJob(getOwnerAccount(), id)!.firstResponseAt).toBe(first);
    expect(events(id)).toEqual(["status", "status", "note"]);
  });
});

describe("listEvents", () => {
  it("returns events newest first with parsed data", async () => {
    const id = await seed();
    addNote(getOwnerAccount(), id, "first");
    getAccountDb(getOwnerAccount()).prepare("UPDATE events SET at = '2026-01-01T00:00:00.000Z' WHERE job_id = ?").run(id);
    setStatus(getOwnerAccount(), id, "applied", "user", new Date("2026-02-01T00:00:00Z"));
    addNote(getOwnerAccount(), id, "last");
    const e = listEvents(getOwnerAccount(), id);
    expect(e.map((x) => x.kind)).toEqual(["note", "status", "note"]);
    expect(e[0].data).toEqual({ text: "last" });
    expect(e[1].data).toEqual({ from: "saved", to: "applied", by: "user" });
  });
});

describe("retryExtraction with edited text", () => {
  it("stores the new text and extracts from it", async () => {
    const id = await seed();
    await retryExtraction(getOwnerAccount(), id, "edited text");
    expect(getJob(getOwnerAccount(), id)!.rawText).toBe("edited text");
    expect(ask).toHaveBeenLastCalledWith(getOwnerAccount(), expect.objectContaining({ content: expect.stringContaining("edited text") }));
  });
  it("does not touch the text while the job is busy", async () => {
    const id = await seed();
    getAccountDb(getOwnerAccount()).prepare("UPDATE jobs SET busy='checking', busy_since=? WHERE id=?").run(new Date().toISOString(), id);
    expect(() => retryExtraction(getOwnerAccount(), id, "x")).toThrow(/busy/);
    expect(getJob(getOwnerAccount(), id)!.rawText).toBe(TEXT);
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
    setStatus(getOwnerAccount(), id, "applied", "user");
    expect(listJobs(getOwnerAccount(), { status: "applied" })).toHaveLength(1);
    expect(listJobs(getOwnerAccount(), { status: "saved" })).toHaveLength(0);
    expect(listJobs(getOwnerAccount(), { source: "glints" })).toHaveLength(0);
  });
});
