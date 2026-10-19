import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { clearFollowUp, runGhostDetection } from "@/lib/ghost";
import { getJob, listEvents } from "@/lib/jobs";

const NOW = new Date("2026-10-19T00:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const seed = (days: number, over: { response?: string | null; locked?: number; status?: string; due?: number } = {}) =>
  Number(getDb().prepare("INSERT INTO jobs (url, source, company, title, status, status_locked, applied_at, first_response_at, follow_up_due) VALUES ('u' || abs(random()),'glints','Acme','Eng',?,?,?,?,?)")
    .run(over.status ?? "applied", over.locked ?? 0, ago(days), over.response ?? null, over.due ?? 0).lastInsertRowid);

beforeEach(() => resetDb());

describe("runGhostDetection", () => {
  it("leaves a 6-day-old application alone", () => {
    const id = seed(6);
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 0 });
    expect(getJob(id)).toMatchObject({ status: "applied", followUpDue: false });
  });

  it("flags follow-up at 7 days, once, with a timeline note", () => {
    const id = seed(7);
    expect(runGhostDetection(NOW)).toEqual({ flagged: 1, ghosted: 0 });
    expect(getJob(id)).toMatchObject({ status: "applied", followUpDue: true });
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 0 });
    expect(listEvents(id).filter((e) => e.kind === "note")).toHaveLength(1);
  });

  it("ghosts at 14 days and drops the follow-up flag", () => {
    const id = seed(14, { due: 1 });
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 1 });
    expect(getJob(id)).toMatchObject({ status: "ghosted", followUpDue: false });
    expect(listEvents(id).some((e) => e.kind === "status" && e.data.by === "ghost")).toBe(true);
  });

  it("ignores jobs that already had a response", () => {
    const id = seed(20, { response: ago(15) });
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 0 });
    expect(getJob(id)?.status).toBe("applied");
  });

  it("ignores jobs whose status the user locked", () => {
    const id = seed(20, { locked: 1 });
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 0 });
    expect(getJob(id)?.status).toBe("applied");
  });

  it("still ghosts when only an auto_ack email arrived (it never sets first_response_at)", () => {
    const id = seed(20);
    getDb().prepare("INSERT INTO emails (id, job_id, original_from, subject, snippet, received_at, classification) VALUES ('m1', ?, 'hr@acme.test', 'Thanks for applying', '', ?, 'auto_ack')")
      .run(id, ago(19));
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 1 });
    expect(getJob(id)?.status).toBe("ghosted");
  });

  it("ignores jobs that are not applied", () => {
    seed(20, { status: "interview" });
    expect(runGhostDetection(NOW)).toEqual({ flagged: 0, ghosted: 0 });
  });
});

describe("clearFollowUp", () => {
  it("clears the flag and records a note", () => {
    const id = seed(8, { due: 1 });
    clearFollowUp(id);
    expect(getJob(id)?.followUpDue).toBe(false);
    expect(listEvents(id)[0]).toMatchObject({ kind: "note", data: { text: "Followed up" } });
  });
});
