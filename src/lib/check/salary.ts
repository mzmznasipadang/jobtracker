import type { JobFields, SalaryFit, Settings } from "../types";

const WORKDAYS_PER_MONTH = 21.7;

export function toMonthlyIdr(amount: number, currency: string, period: "hour" | "day" | "month" | "year", s: Settings["salary"]): number | null {
  const cur = currency.toUpperCase();
  const rate = cur === "IDR" ? 1 : Object.hasOwn(s.fx, cur) ? s.fx[cur as keyof Settings["salary"]["fx"]] : null;
  if (rate == null) return null;
  const perMonth = { hour: s.hoursPerMonth, day: WORKDAYS_PER_MONTH, month: 1, year: 1 / 12 }[period];
  return amount * rate * perMonth;
}

export function salaryFit(job: Pick<JobFields, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">, s: Settings["salary"]): SalaryFit {
  const top = job.salaryMax ?? job.salaryMin;
  if (top == null || !job.salaryCurrency || !job.salaryPeriod || !s.minimumMonthlyIdr || !s.expectedMonthlyIdr) return "unknown";
  const monthly = toMonthlyIdr(top, job.salaryCurrency, job.salaryPeriod, s);
  if (monthly == null) return "unknown";
  return monthly < s.minimumMonthlyIdr ? "below_minimum" : monthly < s.expectedMonthlyIdr ? "above_range" : "ok";
}
