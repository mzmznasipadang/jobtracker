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

describe("matchJob guards", () => {
  it("matches a recruiter's Outlook reply that quotes the owner's own From block", () => {
    const e = mail({ from: "HR <hr@acme.co.id>", body: "Thanks!\n\nFrom: Victor <Owner@x.com>\nSent: Monday\nTo: hr@acme.co.id" });
    expect(originalSender(e, null, " owner@x.com ")).toBe("hr@acme.co.id");
    expect(matchJob(e, [job(1, { companyDomain: "acme.co.id" })], null, "owner@x.com")).toBe(1);
  });

  it("ignores job-board and free-mail companyDomain values", () => {
    for (const companyDomain of ["linkedin.com", "gmail.com"])
      expect(matchJob(mail({ from: `x@${companyDomain}` }), [job(1, { companyDomain })], null)).toBeNull();
  });

  it("needs at least 3 normalised characters for a company-name match", () => {
    const e = mail({ from: "jobs-noreply@linkedin.com", subject: "Your application to PT AB" });
    expect(matchJob(e, [job(1, { company: "PT AB" })], null)).toBeNull();
    expect(matchJob(e, [job(1, { company: "AB Co" })], null)).toBeNull(); // not in the subject
    expect(matchJob(mail({ from: "jobs-noreply@linkedin.com", subject: "Your application to Zeta" }), [job(1, { company: "Zeta" })], null)).toBe(1);
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
  it("is true for a match, a job-board or ATS sender, or a keyword hit", () => {
    expect(isJobRelated(mail({}), 5, null)).toBe(true);
    expect(isJobRelated(mail({ from: "no-reply@us.greenhouse.io" }), null, null)).toBe(true);
    expect(isJobRelated(mail({ subject: "Interview invitation" }), null, null)).toBe(true);
  });

  it("does not treat mail from the owner's Outlook as related by itself, only via the original sender", () => {
    expect(isJobRelated(mail({ from: OUTLOOK, body: "FYI\n\nFrom: Mom <mom@gmail.com>\nTo: me" }), null, OUTLOOK)).toBe(false);
    expect(isJobRelated(mail({ from: OUTLOOK, body: "From: Jobs <jobs@glints.com>\nTo: me" }), null, OUTLOOK)).toBe(true);
  });

  it("is false for ordinary mail", () => {
    expect(isJobRelated(mail({ from: "mom@gmail.com", subject: "Dinner?" }), null, OUTLOOK)).toBe(false);
  });
});
