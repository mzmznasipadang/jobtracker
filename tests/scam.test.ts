import { describe, expect, it } from "vitest";
import { ruleRisk, scamSignals } from "@/lib/check/scam";
import type { JobFields, Settings } from "@/lib/types";

const job: JobFields = {
  company: "Acme", companyDomain: "company.co.id", title: "Engineer", location: null, workMode: null, employmentType: null,
  salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, requirements: [], niceToHave: [],
  description: "", applyMethod: "email", applyEmail: "jobs@company.co.id", applyUrl: null, recruiterEmail: null, language: "id",
};
const sal: Settings["salary"] = { expectedMonthlyIdr: 25_000_000, minimumMonthlyIdr: 18_000_000, expectedUsdHourly: 0, fx: { USD: 16000, SGD: 12000, EUR: 17500 }, hoursPerMonth: 173 };

describe("scamSignals", () => {
  it("flags chat-only contact plus a fee", () => {
    const s = scamSignals({ ...job, applyEmail: null }, "Hubungi via WhatsApp wa.me/62812345 biaya pelatihan Rp500.000");
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(ruleRisk(s)).toBe("high");
  });

  it("is clean for a normal posting with a company email", () => {
    const s = scamSignals(job, "Send your CV to jobs@company.co.id. Follow us on WhatsApp channel for news.");
    expect(s).toEqual([]);
    expect(ruleRisk(s)).toBe("low");
  });

  it("flags a free-mail recruiter that is not the company domain", () => {
    const s = scamSignals({ ...job, recruiterEmail: "hr.company@gmail.com" }, "Apply now");
    expect(s).toHaveLength(1);
    expect(ruleRisk(s)).toBe("medium");
  });

  it("flags pay above 3x expected", () => {
    const pay = { ...job, salaryMin: 100_000_000, salaryMax: 120_000_000, salaryCurrency: "IDR", salaryPeriod: "month" as const };
    expect(scamSignals(pay, "x", sal)).toHaveLength(1);
    expect(scamSignals({ ...pay, salaryMax: 70_000_000 }, "x", sal)).toEqual([]);
  });
});
