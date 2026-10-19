import { getOwnerAccount } from "@/lib/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountDb, resetDb } from "@/lib/db";
import { askJson } from "@/lib/ai";
import { runChecks } from "@/lib/check/run";
import { getJob } from "@/lib/jobs";
import { saveSettings } from "@/lib/settings";
import { saveMasterCv } from "@/lib/cv/parse";
import { MATCH_JOB } from "@/lib/prompts";
import type { MasterCv } from "@/lib/types";

vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson: vi.fn() }));
const ask = vi.mocked(askJson);

const cv: MasterCv = {
  basics: { name: "V", email: "v@x.id", phone: "", location: "Jakarta", links: [] }, summary: "", experience: [],
  projects: [], education: [], skills: [], certifications: [], languages: [],
};
const match = { score: 85, reasons: ["fit"], gaps: [], missingKeywords: [], dealBreakerHit: null as string | null };
const reply = (m: object, scam: object) => ask.mockImplementation((async (_account: unknown, o: { system: string }) => (o.system === MATCH_JOB ? m : scam)) as never);

function seed(over: { rawText?: string; recruiter?: string } = {}) {
  return Number(getAccountDb(getOwnerAccount()).prepare("INSERT INTO jobs (url, source, company, title, raw_text, company_domain, recruiter_email, salary_min, salary_max, salary_currency, salary_period) VALUES ('u' || abs(random()),'glints','Acme','Eng',?,'acme.test',?,10000000,15000000,'IDR','month')")
    .run(over.rawText ?? "normal posting", over.recruiter ?? null).lastInsertRowid);
}

beforeEach(() => {
  resetDb();
  ask.mockReset();
  saveSettings(getOwnerAccount(), { salary: { expectedMonthlyIdr: 25_000_000, minimumMonthlyIdr: 18_000_000 } });
  saveMasterCv(getOwnerAccount(), cv);
});

describe("runChecks", () => {
  it("stores the higher of rule and AI scam risk, salary fit, and moves saved to ready", async () => {
    reply(match, { risk: "low", reasons: [] });
    const id = seed({ rawText: "Hubungi wa.me/628123, biaya training Rp1jt" });
    await runChecks(getOwnerAccount(), id);
    const j = getJob(getOwnerAccount(), id)!;
    expect(j).toMatchObject({ scamRisk: "high", salaryFit: "below_minimum", matchScore: 85, status: "ready" });
    expect(JSON.parse(j.matchJson!)).toMatchObject({ reasons: ["fit"] });
    expect(JSON.parse(j.scamJson!).signals.length).toBeGreaterThanOrEqual(2);
    expect(getAccountDb(getOwnerAccount()).prepare("SELECT kind FROM events WHERE job_id=?").all(id)).toContainEqual({ kind: "check" });
    expect(ask.mock.calls.map((c) => c[1].effort)).toEqual(["medium", "low"]);
  });

  it("takes the AI risk when it is higher than the rules", async () => {
    reply(match, { risk: "medium", reasons: ["vague company"] });
    const id = seed();
    await runChecks(getOwnerAccount(), id);
    expect(getJob(getOwnerAccount(), id)!.scamRisk).toBe("medium");
  });

  it("caps the score at 40 on a deal-breaker hit", async () => {
    reply({ ...match, dealBreakerHit: "onsite" }, { risk: "low", reasons: [] });
    const id = seed();
    await runChecks(getOwnerAccount(), id);
    expect(getJob(getOwnerAccount(), id)!.matchScore).toBe(40);
  });

  it("without a master CV skips the match call and stores a null score", async () => {
    getAccountDb(getOwnerAccount()).prepare("DELETE FROM kv WHERE key = 'masterCv'").run();
    reply(match, { risk: "low", reasons: [] });
    const id = seed();
    await runChecks(getOwnerAccount(), id);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(getJob(getOwnerAccount(), id)).toMatchObject({ matchScore: null, matchJson: '{"reason":"no master CV"}', salaryFit: "below_minimum", status: "ready" });
  });

  it("does not promote when the user changed the status while the AI calls were pending", async () => {
    const id = seed();
    ask.mockImplementation((async (_account: unknown, o: { system: string }) => {
      getAccountDb(getOwnerAccount()).prepare("UPDATE jobs SET status='skipped' WHERE id=?").run(id);
      return o.system === MATCH_JOB ? match : { risk: "low", reasons: [] };
    }) as never);
    await runChecks(getOwnerAccount(), id);
    expect(getJob(getOwnerAccount(), id)!.status).toBe("skipped");
    expect(getAccountDb(getOwnerAccount()).prepare("SELECT data_json FROM events WHERE job_id=? AND kind='status'").all(id)).toEqual([]);
  });

  it("does not move a non-saved job or one whose extraction failed", async () => {
    reply(match, { risk: "low", reasons: [] });
    const a = seed();
    getAccountDb(getOwnerAccount()).prepare("UPDATE jobs SET status='applied' WHERE id=?").run(a);
    const b = seed();
    getAccountDb(getOwnerAccount()).prepare("UPDATE jobs SET extract_error='x' WHERE id=?").run(b);
    await runChecks(getOwnerAccount(), a);
    await runChecks(getOwnerAccount(), b);
    expect(getJob(getOwnerAccount(), a)!.status).toBe("applied");
    expect(getJob(getOwnerAccount(), b)!.status).toBe("saved");
  });
});
