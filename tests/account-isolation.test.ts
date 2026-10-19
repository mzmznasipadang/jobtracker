import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccountFixture } from "./helpers/accounts";
import { getAccountDb } from "@/lib/db";
import { getKv, getSettings, saveSettings, setKv } from "@/lib/settings";
import { getJob, listJobs, startJobWork } from "@/lib/jobs";
import { computeMetrics } from "@/lib/metrics";
import { getTailoredPdf } from "@/lib/tailor/tailor";
vi.mock("@/lib/ai", () => ({ askJson: vi.fn(), AiError: class extends Error {} }));
vi.mock("@/lib/check/run", () => ({ runChecks: vi.fn(async () => {}) }));
vi.mock("@/lib/email/gmail", () => ({ listMessages: vi.fn(), MAX_PER_RUN: 200 }));
let fixture: ReturnType<typeof createAccountFixture>;
beforeEach(() => { fixture = createAccountFixture(); });
afterEach(() => { vi.clearAllMocks(); fixture.cleanup(); });
const insert = (account: typeof fixture.owner, company: string) => getAccountDb(account).prepare("INSERT INTO jobs (url,source,company,title) VALUES ('https://example.com/job','other',?,'Role')").run(company);

it("keeps identical job ids, settings, Gmail tokens and PDFs in separate stores", () => {
  const { owner, member } = fixture;
  insert(owner, "Owner company"); insert(member, "Member company");
  saveSettings(owner, { pipeline: { ghostDays: 31 } }); saveSettings(member, { pipeline: { ghostDays: 7 } });
  setKv(owner, "gmailToken", "owner-token"); setKv(member, "gmailToken", "member-token");
  expect(getSettings(owner).pipeline.ghostDays).toBe(31);
  expect(getSettings(member).pipeline.ghostDays).toBe(7);
  expect(getKv(owner, "gmailToken")).toBe("owner-token");
  expect(getJob(owner, 1)?.company).toBe("Owner company");
  expect(getJob(member, 1)?.company).toBe("Member company");
  expect(listJobs(member)).toHaveLength(1);
  expect(getJob(member, 99)).toBeNull();
  getAccountDb(owner).prepare("INSERT INTO tailored (job_id,version,cv_json,pdf) VALUES (1,1,?,?)").run(JSON.stringify({ basics: { name: "Owner" } }), Buffer.from("%PDF owner"));
  expect(getTailoredPdf(member, 1, 1)).toBeNull();
  expect(getTailoredPdf(owner, 1, 1)?.pdf.toString()).toBe("%PDF owner");
});
it("delayed background completion retains the original account", async () => {
  const { owner, member } = fixture;
  insert(owner, "Owner"); insert(member, "Member");
  let finish!: () => void;
  const gate = new Promise<void>(r => { finish = r; });
  const work = startJobWork(owner, 1, "checking", async () => { await gate; setKv(owner, "result", "owner result"); });
  expect(getJob(owner, 1)?.busy).toBe("checking");
  expect(getJob(member, 1)?.busy).toBeNull();
  setKv(member, "result", "member result"); finish(); await work;
  expect(getKv(owner, "result")).toBe("owner result");
  expect(getKv(member, "result")).toBe("member result");
  expect(getJob(owner, 1)?.busy).toBeNull();
});
it("members' applications never alter owner public metrics", () => {
  const { owner, member } = fixture;
  insert(member, "Private");
  getAccountDb(member).prepare("UPDATE jobs SET applied_at='2026-01-01', status='applied'").run();
  expect(computeMetrics(owner).totals.sent).toBe(0);
  expect(computeMetrics(member).totals.sent).toBe(1);
});

it("does not share in-flight Gmail sync between accounts or steal a DB lease", async () => {
  const { owner, member } = fixture;
  const { syncInbox } = await import("@/lib/email/sync");
  const { listMessages } = await import("@/lib/email/gmail");
  vi.mocked(listMessages).mockResolvedValue([]);
  setKv(owner, "gmailToken", "owner-token"); setKv(member, "gmailToken", "member-token");
  const a = syncInbox(owner), b = syncInbox(member);
  expect(a).not.toBe(b);
  await Promise.all([a, b]);
  expect(getKv(owner, "gmailLastSync")).not.toBeNull();
  expect(getKv(member, "gmailLastSync")).not.toBeNull();
  setKv(owner, "gmailSyncing", { startedAt: new Date().toISOString(), lease: "other-process" });
  vi.mocked(listMessages).mockClear();
  await syncInbox(owner);
  expect(listMessages).not.toHaveBeenCalled();
  expect(getKv(owner, "gmailSyncing")).toMatchObject({ lease: "other-process" });
});
it("new member settings are private before the first save", () => {
  expect(getSettings(fixture.member).publicPageEnabled).toBe(false);
});
