import { describe, expect, it } from "vitest";
import type { RawEmail } from "@/lib/email/gmail";
import { isJobRelated, matchJob, originalSender } from "@/lib/email/match";

const OUTLOOK = "victor@outlook.com";
const mail = (over: Partial<RawEmail>): RawEmail => ({
  id: "m1", threadId: "t1", from: "x@example.org", subject: "Hello", snippet: "", body: "", receivedAt: "2026-10-01T00:00:00.000Z", ...over,
});
const job = (id: number, over: Record<string, unknown> = {}) =>
  ({ id, company: "Other Co", companyDomain: null, recruiterEmail: null, status: "applied", ...over }) as Parameters<typeof matchJob>[1][number];

describe("matchJob", () => {
  it("matches the recruiter email exactly (case-insensitive, display name ignored)", () => {
    expect(matchJob(mail({ from: "Rina <Rina@Acme.test>" }), [job(1), job(2, { recruiterEmail: "rina@acme.test" })], null)).toBe(2);
  });

  it("matches the sender domain to companyDomain", () => {
    expect(matchJob(mail({ from: "talent@acme.co.id" }), [job(1, { companyDomain: "acme.co.id" })], null)).toBe(1);
    expect(matchJob(mail({ from: "a@notacme.co.id" }), [job(1, { companyDomain: "acme.co.id" })], null)).toBeNull();
  });

  it("matches a normalised company name in the subject, even from a job board", () => {
    const e = mail({ from: "jobs-noreply@linkedin.com", subject: "Your application to PT Acme Indonesia Tbk" });
    expect(matchJob(e, [job(1, { company: "Acme Indonesia" })], null)).toBe(1);
  });

  it("returns null when two active jobs share the company name", () => {
    const e = mail({ from: "jobs-noreply@linkedin.com", subject: "Your application to Acme" });
    expect(matchJob(e, [job(1, { company: "Acme" }), job(2, { company: "Acme Inc." })], null)).toBeNull();
  });

  it("ignores saved/rejected jobs for name matching", () => {
    const e = mail({ from: "jobs-noreply@linkedin.com", subject: "Your application to Acme" });
    expect(matchJob(e, [job(1, { company: "Acme", status: "saved" })], null)).toBeNull();
  });

  it("matches an Outlook-forwarded email by its original sender", () => {
    const e = mail({ from: OUTLOOK, subject: "FW: Interview", body: "FYI\n\nFrom: HR <hr@acme.co.id>\nTo: me" });
    expect(originalSender(e, OUTLOOK)).toBe("hr@acme.co.id");
    expect(matchJob(e, [job(1, { companyDomain: "acme.co.id" })], OUTLOOK)).toBe(1);
  });
});

describe("originalSender", () => {
  it("reads Gmail and Outlook forwarded header blocks; plain mail keeps its sender", () => {
    const gmail = mail({ from: "me@gmail.com", body: "x\n---------- Forwarded message ---------\nFrom: Acme HR <HR@acme.test>\nDate: Mon" });
    const outlook = mail({ from: "me@gmail.com", body: "From: Acme HR <hr@acme.test>\nSent: Monday\nTo: me" });
    expect(originalSender(gmail, null)).toBe("hr@acme.test");
    expect(originalSender(outlook, null)).toBe("hr@acme.test");
    expect(originalSender(mail({ from: "Mom <mom@gmail.com>", body: "Hi" }), OUTLOOK)).toBe("mom@gmail.com");
  });
});

describe("isJobRelated", () => {
  it("is true for a match, a job-board or ATS sender, Outlook forwards, or a keyword hit", () => {
    expect(isJobRelated(mail({}), 5, null)).toBe(true);
    expect(isJobRelated(mail({ from: "no-reply@us.greenhouse.io" }), null, null)).toBe(true);
    expect(isJobRelated(mail({ from: OUTLOOK }), null, OUTLOOK)).toBe(true);
    expect(isJobRelated(mail({ subject: "Interview invitation" }), null, null)).toBe(true);
  });

  it("is false for ordinary mail", () => {
    expect(isJobRelated(mail({ from: "mom@gmail.com", subject: "Dinner?" }), null, OUTLOOK)).toBe(false);
  });
});
