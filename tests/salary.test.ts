import { describe, expect, it } from "vitest";
import { salaryFit, toMonthlyIdr } from "@/lib/check/salary";
import type { JobFields, Settings } from "@/lib/types";

const s: Settings["salary"] = { expectedMonthlyIdr: 25_000_000, minimumMonthlyIdr: 18_000_000, expectedUsdHourly: 0, fx: { USD: 16000, SGD: 12000, EUR: 17500 }, hoursPerMonth: 173 };
type Pay = Pick<JobFields, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">;
const pay = (min: number | null, max: number | null, cur: string | null = "IDR", per: Pay["salaryPeriod"] = "month"): Pay =>
  ({ salaryMin: min, salaryMax: max, salaryCurrency: cur, salaryPeriod: per });
const M = 1_000_000;

describe("toMonthlyIdr", () => {
  it("converts periods and currencies", () => {
    expect(toMonthlyIdr(10, "USD", "hour", s)).toBe(10 * 16000 * 173);
    expect(toMonthlyIdr(300 * M, "IDR", "year", s)).toBe(25 * M);
    expect(toMonthlyIdr(1, "IDR", "day", s)).toBe(21.7);
    expect(toMonthlyIdr(1, "XYZ", "month", s)).toBeNull();
  });
});

describe("salaryFit", () => {
  it.each([
    ["below minimum", pay(15 * M, 17 * M), "below_minimum"],
    ["above range", pay(20 * M, 22 * M), "above_range"],
    ["reaches expected", pay(20 * M, 30 * M), "ok"],
    ["USD hourly", pay(10, 10, "USD", "hour"), "ok"],
    ["IDR yearly", pay(300 * M, 300 * M, "IDR", "year"), "ok"],
    ["all null", pay(null, null, null, null), "unknown"],
    ["unknown currency", pay(10, 20, "XYZ"), "unknown"],
    ["min only", pay(26 * M, null), "ok"],
    ["no period", pay(30 * M, 30 * M, "IDR", null), "unknown"],
  ])("%s", (_n, p, want) => expect(salaryFit(p, s)).toBe(want));

  it("is unknown when settings are unset", () => {
    expect(salaryFit(pay(1, 1), { ...s, minimumMonthlyIdr: 0 })).toBe("unknown");
    expect(salaryFit(pay(1, 1), { ...s, expectedMonthlyIdr: 0 })).toBe("unknown");
  });
});
