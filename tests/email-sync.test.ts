import { beforeEach, describe, expect, it, vi } from "vitest";
import { askJson } from "@/lib/ai";
import { getDb, resetDb } from "@/lib/db";
import { listMessages, type RawEmail } from "@/lib/email/gmail";
import { syncInbox } from "@/lib/email/sync";
import { getJob } from "@/lib/jobs";
import { getKv, setKv } from "@/lib/settings";

vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson: vi.fn() }));
vi.mock("@/lib/email/gmail", () => ({ listMessages: vi.fn(), MAX_PER_RUN: 200 }));
const ask = vi.mocked(askJson);
const list = vi.mocked(listMessages);

const NOW = new Date("2026-10-19T00:00:00.000Z");
const mail = (over: Partial<RawEmail>): RawEmail => ({
  id: "m1", threadId: "t1", from: "hr@acme.test", subject: "Update", snippet: "", body: "", receivedAt: "2026-10-18T08:00:00.000Z", ...over,
});
const seed = (over: { status?: string; locked?: number; company?: string } = {}) =>
  Number(getDb().prepare("INSERT INTO jobs (url, source, company, title, company_domain, status, status_locked) VALUES ('u' || abs(random()),'glints',?,'Eng','acme.test',?,?)")
    .run(over.company ?? "Acme", over.status ?? "applied", over.locked ?? 0).lastInsertRowid);
const stored = () => getDb().prepare("SELECT id, job_id, classification FROM emails").all();
const events = (id: number) => getDb().prepare("SELECT kind, data_json FROM events WHERE job_id=? AND kind='email'").all(id);

beforeEach(() => {
  resetDb();
  ask.mockReset();
  list.mockReset();
  setKv("gmailToken", "enc");
});

describe("syncInbox", () => {
  it("does nothing without a connected token", async () => {
    getDb().prepare("DELETE FROM kv WHERE key='gmailToken'").run();
    expect(await syncInbox(NOW)).toEqual({ stored: 0, skipped: 0 });
    expect(list).not.toHaveBeenCalled();
  });

  it("backfills 60 days on first run and ignores unrelated mail entirely", async () => {
    list.mockResolvedValue([mail({ id: "p1", from: "mom@gmail.com", subject: "Dinner?", body: "See you Sunday" })]);
    expect(await syncInbox(NOW)).toEqual({ stored: 0, skipped: 1 });
    expect(list).toHaveBeenCalledWith(Math.floor((NOW.getTime() - 60 * 86_400_000) / 1000));
    expect(stored()).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
    expect(getKv("gmailLastSync")).toBe(NOW.toISOString());
  });

  it("moves an applied job to rejected, sets first_response_at and records the event", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ subject: "Your application", body: "Unfortunately we will not be proceeding." })]);
    expect(await syncInbox(NOW)).toEqual({ stored: 1, skipped: 0 });
    expect(getJob(id)).toMatchObject({ status: "rejected", firstResponseAt: "2026-10-18T08:00:00.000Z" });
    expect(stored()).toEqual([{ id: "m1", job_id: id, classification: "rejection" }]);
    expect(events(id)).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it("records the event but keeps the status of a user-locked job", async () => {
    const id = seed({ locked: 1 });
    list.mockResolvedValue([mail({ body: "Unfortunately we will not be proceeding." })]);
    await syncInbox(NOW);
    expect(getJob(id)!.status).toBe("applied");
    expect(events(id)).toHaveLength(1);
  });

  it("auto-acknowledgements never set first_response_at", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ body: "We have received your application" })]);
    await syncInbox(NOW);
    expect(getJob(id)).toMatchObject({ status: "applied", firstResponseAt: null });
    expect(stored()).toMatchObject([{ classification: "auto_ack" }]);
  });

  it("a LinkedIn new-message notification on a matched job counts as a reply", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ from: "messages-noreply@linkedin.com", subject: "Rina at Acme sent you a message" })]);
    ask.mockResolvedValue({ classification: "other" });
    await syncInbox(NOW);
    expect(getJob(id)).toMatchObject({ status: "applied", firstResponseAt: "2026-10-18T08:00:00.000Z" });
  });

  it("stores unmatched related mail with no job, and asks Claude when keywords are absent", async () => {
    list.mockResolvedValue([mail({ from: "no-reply@greenhouse.io", subject: "Thanks" })]);
    ask.mockResolvedValue({ classification: "other" });
    expect(await syncInbox(NOW)).toEqual({ stored: 1, skipped: 0 });
    expect(stored()).toEqual([{ id: "m1", job_id: null, classification: "other" }]);
  });

  it("does not reprocess a message that is already stored", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ body: "Unfortunately we will not be proceeding." })]);
    await syncInbox(NOW);
    expect(await syncInbox(NOW)).toEqual({ stored: 0, skipped: 0 });
    expect(events(id)).toHaveLength(1);
  });

  it("on invalid_grant records gmailError, resolves, and leaves gmailLastSync alone", async () => {
    setKv("gmailLastSync", "2026-10-01T00:00:00.000Z");
    list.mockRejectedValue(new Error("invalid_grant"));
    expect(await syncInbox(NOW)).toEqual({ stored: 0, skipped: 0 });
    expect(getKv("gmailError")).toEqual(expect.stringContaining("reconnect"));
    expect(getKv("gmailLastSync")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("propagates other errors", async () => {
    list.mockRejectedValue(new Error("boom"));
    await expect(syncInbox(NOW)).rejects.toThrow("boom");
  });

  it("when the run hit the cap, resumes from the last processed message", async () => {
    list.mockResolvedValue(Array.from({ length: 200 }, (_, i) => mail({ id: `p${i}`, from: "mom@gmail.com", receivedAt: i === 199 ? "2026-10-10T12:00:00.000Z" : "2026-10-09T00:00:00.000Z" })));
    await syncInbox(NOW);
    expect(getKv("gmailLastSync")).toBe("2026-10-10T11:59:59.000Z"); // newest processed message minus 1s
  });
});
