import { getOwnerAccount } from "@/lib/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiError, askJson } from "@/lib/ai";
import { getAccountDb, resetDb } from "@/lib/db";
import { listMessages, type RawEmail } from "@/lib/email/gmail";
import { isSyncing, syncInbox } from "@/lib/email/sync";
import { getJob } from "@/lib/jobs";
import { getKv, saveSettings, setKv } from "@/lib/settings";

vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson: vi.fn() }));
vi.mock("@/lib/email/gmail", () => ({ listMessages: vi.fn(), MAX_PER_RUN: 200 }));
const ask = vi.mocked(askJson);
const list = vi.mocked(listMessages);

const NOW = new Date("2026-10-19T00:00:00.000Z");
const mail = (over: Partial<RawEmail>): RawEmail => ({
  id: "m1", threadId: "t1", from: "hr@acme.test", subject: "Update", snippet: "", body: "", receivedAt: "2026-10-18T08:00:00.000Z", ...over,
});
const seed = (over: { status?: string; locked?: number; company?: string } = {}) =>
  Number(getAccountDb(getOwnerAccount()).prepare("INSERT INTO jobs (url, source, company, title, company_domain, status, status_locked) VALUES ('u' || abs(random()),'glints',?,'Eng','acme.test',?,?)")
    .run(over.company ?? "Acme", over.status ?? "applied", over.locked ?? 0).lastInsertRowid);
const stored = () => getAccountDb(getOwnerAccount()).prepare("SELECT id, job_id, classification FROM emails").all();
const events = (id: number) => getAccountDb(getOwnerAccount()).prepare("SELECT kind, data_json FROM events WHERE job_id=? AND kind='email'").all(id);

beforeEach(() => {
  resetDb();
  ask.mockReset();
  list.mockReset();
  setKv(getOwnerAccount(), "gmailToken", "enc");
});

describe("syncInbox", () => {
  it("does nothing without a connected token", async () => {
    getAccountDb(getOwnerAccount()).prepare("DELETE FROM kv WHERE key='gmailToken'").run();
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 0, skipped: 0 });
    expect(list).not.toHaveBeenCalled();
  });

  it("backfills 60 days on first run and ignores unrelated mail entirely", async () => {
    list.mockResolvedValue([mail({ id: "p1", from: "mom@gmail.com", subject: "Dinner?", body: "See you Sunday" })]);
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 0, skipped: 1 });
    expect(list).toHaveBeenCalledWith(getOwnerAccount(), Math.floor((NOW.getTime() - 60 * 86_400_000) / 1000));
    expect(stored()).toEqual([]);
    expect(ask).not.toHaveBeenCalled();
    expect(getKv(getOwnerAccount(), "gmailLastSync")).toBe(NOW.toISOString());
  });

  it("moves an applied job to rejected, sets first_response_at and records the event", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ subject: "Your application", body: "Unfortunately we will not be proceeding." })]);
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 1, skipped: 0 });
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ status: "rejected", firstResponseAt: "2026-10-18T08:00:00.000Z" });
    expect(stored()).toEqual([{ id: "m1", job_id: id, classification: "rejection" }]);
    expect(events(id)).toHaveLength(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it("records the event but keeps the status of a user-locked job", async () => {
    const id = seed({ locked: 1 });
    list.mockResolvedValue([mail({ body: "Unfortunately we will not be proceeding." })]);
    await syncInbox(getOwnerAccount(), NOW);
    expect(getJob(getOwnerAccount(), id)!.status).toBe("applied");
    expect(events(id)).toHaveLength(1);
  });

  it("auto-acknowledgements never set first_response_at", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ body: "We have received your application" })]);
    await syncInbox(getOwnerAccount(), NOW);
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ status: "applied", firstResponseAt: null });
    expect(stored()).toMatchObject([{ classification: "auto_ack" }]);
  });

  it("a LinkedIn new-message notification on a matched job counts as a reply", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ from: "messages-noreply@linkedin.com", subject: "Rina at Acme sent you a message" })]);
    ask.mockResolvedValue({ classification: "other" });
    await syncInbox(getOwnerAccount(), NOW);
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ status: "applied", firstResponseAt: "2026-10-18T08:00:00.000Z" });
  });

  it("stores unmatched mail only on a keyword hit, without calling Claude", async () => {
    list.mockResolvedValue([
      mail({ id: "a", from: "jobs-listings@linkedin.com", subject: "Jobs you may like" }),
      mail({ id: "b", from: "recruiter@other.test", subject: "Interview invitation" }),
      mail({ id: "c", from: "recruiter@other.test", subject: "Thanks for interviewing", body: "Unfortunately no" }),
    ]);
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 2, skipped: 1 });
    expect(stored()).toEqual([{ id: "b", job_id: null, classification: "interview" }, { id: "c", job_id: null, classification: "other" }]);
    expect(ask).not.toHaveBeenCalled();
  });

  it("keeps an email stored as 'other' when classification fails with an AiError, and carries on", async () => {
    const id = seed();
    list.mockResolvedValue([
      mail({ id: "a", subject: "Hello from Acme" }),
      mail({ id: "b", subject: "Re", body: "Unfortunately we will not be proceeding." }),
    ]);
    ask.mockRejectedValue(new AiError("api", "down"));
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 2, skipped: 0 });
    expect(stored()).toEqual([{ id: "a", job_id: id, classification: "other" }, { id: "b", job_id: id, classification: "rejection" }]);
    expect(getKv(getOwnerAccount(), "gmailLastSync")).toBe(NOW.toISOString());
  });

  it("does not store or classify a forwarded personal email from the owner's Outlook", async () => {
    saveSettings(getOwnerAccount(), { outlookAddress: "victor@outlook.com" });
    list.mockResolvedValue([mail({ from: "victor@outlook.com", subject: "FW: dinner", body: "From: Mom <mom@gmail.com>\nSent: Sunday" })]);
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 0, skipped: 1 });
    expect(ask).not.toHaveBeenCalled();
  });

  it("matches a forwarded recruiter rejection to its job via the original sender", async () => {
    saveSettings(getOwnerAccount(), { outlookAddress: "victor@outlook.com" });
    const id = seed();
    list.mockResolvedValue([mail({ from: "victor@outlook.com", subject: "FW: Update", body: "From: HR <hr@acme.test>\nSent: Mon\n\nUnfortunately we will not be proceeding." })]);
    await syncInbox(getOwnerAccount(), NOW);
    expect(getJob(getOwnerAccount(), id)!.status).toBe("rejected");
  });

  it("marks gmailSyncing while a run is in flight and clears it afterwards", async () => {
    let during: unknown;
    list.mockImplementation(async () => ((during = getKv(getOwnerAccount(), "gmailSyncing")), []));
    await syncInbox(getOwnerAccount(), NOW);
    expect(during).toMatchObject({ startedAt: expect.any(String) });
    expect(getKv(getOwnerAccount(), "gmailSyncing")).toBeNull();
    expect(isSyncing(getOwnerAccount())).toBe(false);
  });

  it("does not reprocess a message that is already stored", async () => {
    const id = seed();
    list.mockResolvedValue([mail({ body: "Unfortunately we will not be proceeding." })]);
    await syncInbox(getOwnerAccount(), NOW);
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 0, skipped: 0 });
    expect(events(id)).toHaveLength(1);
  });

  it("on invalid_grant records gmailError, resolves, and leaves gmailLastSync alone", async () => {
    setKv(getOwnerAccount(), "gmailLastSync", "2026-10-01T00:00:00.000Z");
    list.mockRejectedValue(new Error("invalid_grant"));
    expect(await syncInbox(getOwnerAccount(), NOW)).toEqual({ stored: 0, skipped: 0 });
    expect(getKv(getOwnerAccount(), "gmailError")).toEqual(expect.stringContaining("reconnect"));
    expect(getKv(getOwnerAccount(), "gmailLastSync")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("propagates other errors", async () => {
    list.mockRejectedValue(new Error("boom"));
    await expect(syncInbox(getOwnerAccount(), NOW)).rejects.toThrow("boom");
  });

  it("when the run hit the cap, resumes from the last processed message", async () => {
    list.mockResolvedValue(Array.from({ length: 200 }, (_, i) => mail({ id: `p${i}`, from: "mom@gmail.com", receivedAt: i === 199 ? "2026-10-10T12:00:00.000Z" : "2026-10-09T00:00:00.000Z" })));
    await syncInbox(getOwnerAccount(), NOW);
    expect(getKv(getOwnerAccount(), "gmailLastSync")).toBe("2026-10-10T11:59:59.000Z"); // newest processed message minus 1s
  });
});
