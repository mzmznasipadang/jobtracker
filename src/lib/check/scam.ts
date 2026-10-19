import type { JobFields, Settings } from "../types";
import { toMonthlyIdr } from "./salary";

export type Risk = "low" | "medium" | "high";
const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "ymail.com", "proton.me"];
const APP = "(?:whatsapp|wa|telegram)";
const VERB = "(?:hubungi|kontak|contact|chat|kirim|send|apply|lamar|daftar|reach)";
// A chat link, or a chat app named close to a contact/apply verb; a bare skill mention does not match.
const CHAT = new RegExp(`\\b(?:wa|t)\\.me/|\\b${VERB}[^]{0,40}\\b${APP}\\b|\\b${APP}\\b[^]{0,40}${VERB}`, "i");
const FEE = /\b(biaya|deposit|bayar|registration fee|training fee|transfer)\b/i;

// The pay rule needs the user's settings; without them it is skipped.
export function scamSignals(job: JobFields, rawText: string, salary?: Settings["salary"]): string[] {
  const out: string[] = [];
  if (!job.applyEmail && CHAT.test(rawText)) out.push("Directs applicants to Telegram/WhatsApp and gives no company email");
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
