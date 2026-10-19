import type { JobFields, Settings } from "../types";
import { toMonthlyIdr } from "./salary";

export type Risk = "low" | "medium" | "high";
const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "ymail.com", "proton.me"];
const CHAT = /t\.me\/|wa\.me\/|telegram|whatsapp/i;
const FEE = /\b(biaya|deposit|bayar|registration fee|training fee|transfer)\b/i;

// The pay rule needs the user's settings; without them it is skipped.
export function scamSignals(job: JobFields, rawText: string, salary?: Settings["salary"]): string[] {
  const out: string[] = [];
  if (CHAT.test(rawText) && !job.applyEmail && !job.applyUrl) out.push("Contact only through Telegram/WhatsApp, no company email or application site");
  const fee = FEE.exec(rawText);
  if (fee) out.push(`Mentions a possible fee or payment ("${fee[0]}")`);
  for (const email of [job.recruiterEmail, job.applyEmail]) {
    const domain = email?.split("@")[1]?.toLowerCase();
    if (domain && FREE_MAIL.includes(domain) && domain !== job.companyDomain?.toLowerCase()) {
      out.push(`Recruiter uses a free-mail address (${email})`);
      break;
    }
  }
  const top = job.salaryMax ?? job.salaryMin;
  if (salary?.expectedMonthlyIdr && top != null && job.salaryCurrency && job.salaryPeriod) {
    const monthly = toMonthlyIdr(top, job.salaryCurrency, job.salaryPeriod, salary);
    if (monthly != null && monthly > 3 * salary.expectedMonthlyIdr) out.push("Pay is more than 3x your expected salary");
  }
  return out;
}

export const ruleRisk = (signals: string[]): Risk => (signals.length === 0 ? "low" : signals.length === 1 ? "medium" : "high");
