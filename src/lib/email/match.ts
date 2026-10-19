import type { Job } from "../types";
import { emailText, keywordClassify } from "./classify";
import type { RawEmail } from "./gmail";

export const JOB_BOARD_DOMAINS = [
  "linkedin.com", "jobstreet.com", "jobstreet.co.id", "glints.com", "kalibrr.com", "dealls.com", "wellfound.com",
  "greenhouse.io", "lever.co", "workablemail.com", "ashbyhq.com", "smartrecruiters.com",
];

type MatchJob = Pick<Job, "id" | "company" | "companyDomain" | "recruiterEmail" | "status">;

const ACTIVE = ["applied", "interview", "offer"];
const addressOf = (header: string) => (header.match(/<([^>]+)>/)?.[1] ?? header.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0] ?? "").trim().toLowerCase();
const nameOf = (header: string) => header.replace(/<[^>]*>/, "").replace(/["']/g, "").trim();
const domainOf = (addr: string) => addr.split("@")[1] ?? "";
const underDomain = (domain: string, root: string) => domain === root || domain.endsWith(`.${root}`);

const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "ymail.com", "proton.me"];

// The raw From header of the forwarded/quoted message inside the body, if any. A sender that is the owner
// (e.g. the quoted original in a recruiter's reply) is not an original sender, so it is ignored.
function forwardedFrom(email: RawEmail, outlookAddress: string | null, ownerEmail: string | null): string | null {
  const body = email.body;
  const outlook = outlookAddress?.trim().toLowerCase();
  const fromOutlook = !!outlook && addressOf(email.from) === outlook;
  const m =
    body.match(/-{3,}\s*Forwarded message\s*-{3,}\s*\r?\n\s*From:[ \t]*(.+)/i) ??
    body.match(/^[ \t]*From:[ \t]*(.+)\r?\n[ \t]*Sent:/im) ??
    (fromOutlook ? body.match(/^[ \t]*From:[ \t]*(.+)/im) : null);
  const own = [outlook, ownerEmail?.trim().toLowerCase()];
  return m && !own.includes(addressOf(m[1])) ? m[1] : null;
}

export function originalSender(email: RawEmail, outlookAddress: string | null, ownerEmail: string | null = null): string {
  return addressOf(forwardedFrom(email, outlookAddress, ownerEmail) ?? email.from);
}

// Lowercase, drop punctuation and company-form words so "PT Acme Indonesia Tbk" == "Acme Indonesia".
const normName = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\b(pt|tbk|inc|ltd)\b/g, " ").replace(/\s+/g, " ").trim()} `;
const isBoardOrFree = (d: string) => [...JOB_BOARD_DOMAINS, ...FREE_MAIL].some((x) => underDomain(d, x));

export function matchJob(email: RawEmail, jobs: MatchJob[], outlookAddress: string | null, ownerEmail: string | null = null): number | null {
  const fwd = forwardedFrom(email, outlookAddress, ownerEmail);
  // Forwarded sender first, then the header sender (a quoted block can be misleading, so both are tried).
  const senders = [...new Set([addressOf(fwd ?? email.from), addressOf(email.from)])];
  const display = nameOf(fwd ?? email.from);
  // A single hit wins; several hits only count if exactly one of them is still active.
  const pick = (js: MatchJob[]) => {
    const one = js.length === 1 ? js : js.filter((j) => ACTIVE.includes(j.status));
    return one.length === 1 ? one[0].id : null;
  };

  const byRecruiter = pick(jobs.filter((j) => j.recruiterEmail && senders.includes(j.recruiterEmail.trim().toLowerCase())));
  if (byRecruiter !== null) return byRecruiter;
  const domains = senders.map(domainOf);
  const byDomain = pick(jobs.filter((j) => {
    const d = j.companyDomain?.trim().toLowerCase();
    return d && !isBoardOrFree(d) && domains.some((s) => underDomain(s, d));
  }));
  if (byDomain !== null) return byDomain;

  const hay = normName(`${email.subject} ${display}`);
  const named = jobs.filter((j) => ACTIVE.includes(j.status) && normName(j.company).trim().length >= 3 && hay.includes(normName(j.company)));
  return named.length === 1 ? named[0].id : null;
}

// Forwards count only through their original sender: being sent from the owner's own Outlook proves nothing.
export function isJobRelated(email: RawEmail, matchedJobId: number | null, outlookAddress: string | null, ownerEmail: string | null = null): boolean {
  if (matchedJobId !== null) return true;
  const domains = [domainOf(addressOf(email.from)), domainOf(originalSender(email, outlookAddress, ownerEmail))];
  if (domains.some((d) => JOB_BOARD_DOMAINS.some((b) => underDomain(d, b)))) return true;
  return keywordClassify(emailText(email)) !== null;
}
