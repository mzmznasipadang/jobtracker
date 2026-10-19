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

// The raw From header of the forwarded message inside the body, if this mail is a forward.
function forwardedFrom(email: RawEmail, outlookAddress: string | null): string | null {
  const body = email.body;
  const fromOutlook = !!outlookAddress && addressOf(email.from) === outlookAddress.toLowerCase();
  const m =
    body.match(/-{3,}\s*Forwarded message\s*-{3,}\s*\r?\n\s*From:[ \t]*(.+)/i) ??
    body.match(/^[ \t]*From:[ \t]*(.+)\r?\n[ \t]*Sent:/im) ??
    (fromOutlook ? body.match(/^[ \t]*From:[ \t]*(.+)/im) : null);
  return m?.[1] ?? null;
}

export function originalSender(email: RawEmail, outlookAddress: string | null): string {
  const fwd = forwardedFrom(email, outlookAddress);
  return addressOf(fwd ?? email.from);
}

// Lowercase, drop punctuation and company-form words so "PT Acme Indonesia Tbk" == "Acme Indonesia".
const normName = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\b(pt|tbk|inc|ltd)\b/g, " ").replace(/\s+/g, " ").trim()} `;

export function matchJob(email: RawEmail, jobs: MatchJob[], outlookAddress: string | null): number | null {
  const fwd = forwardedFrom(email, outlookAddress);
  const sender = addressOf(fwd ?? email.from);
  const display = nameOf(fwd ?? email.from);
  // A single hit wins; several hits only count if exactly one of them is still active.
  const pick = (js: MatchJob[]) => {
    const one = js.length === 1 ? js : js.filter((j) => ACTIVE.includes(j.status));
    return one.length === 1 ? one[0].id : null;
  };

  const byRecruiter = pick(jobs.filter((j) => j.recruiterEmail && j.recruiterEmail.toLowerCase() === sender));
  if (byRecruiter !== null) return byRecruiter;
  const domain = domainOf(sender);
  const byDomain = pick(jobs.filter((j) => j.companyDomain && underDomain(domain, j.companyDomain.toLowerCase())));
  if (byDomain !== null) return byDomain;

  const hay = normName(`${email.subject} ${display}`);
  const named = jobs.filter((j) => ACTIVE.includes(j.status) && normName(j.company).trim() && hay.includes(normName(j.company)));
  return named.length === 1 ? named[0].id : null;
}

export function isJobRelated(email: RawEmail, matchedJobId: number | null, outlookAddress: string | null): boolean {
  if (matchedJobId !== null) return true;
  const domains = [domainOf(addressOf(email.from)), domainOf(originalSender(email, outlookAddress))];
  if (domains.some((d) => JOB_BOARD_DOMAINS.some((b) => underDomain(d, b)))) return true;
  if (outlookAddress && addressOf(email.from) === outlookAddress.toLowerCase()) return true;
  return keywordClassify(emailText(email)) !== null;
}
