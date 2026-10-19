import type { Source } from "../types";

export function canonicalUrl(input: string): string {
  const u = new URL(input.trim());
  if (/(^|\.)linkedin\.com$/.test(u.hostname)) {
    const id = u.searchParams.get("currentJobId") ?? u.pathname.match(/\/jobs\/view\/(?:[^/?]*-)?(\d+)/)?.[1];
    if (id) return `https://www.linkedin.com/jobs/view/${id}`;
  }
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
  return u.toString().replace(/\/+(?=\?|$)/, "");
}

const SOURCES: [string, Source][] = [
  ["linkedin.com", "linkedin"], ["jobstreet.com", "jobstreet"], ["jobstreet.co.id", "jobstreet"],
  ["glints.com", "glints"], ["wellfound.com", "wellfound"], ["kalibrr.com", "kalibrr"],
  ["dealls.com", "dealls"], ["upwork.com", "upwork"], ["contra.com", "contra"], ["toptal.com", "toptal"],
  ["projects.co.id", "projects"], ["sribulancer.com", "sribulancer"], ["fastwork.id", "fastwork"],
];

export function sourceFromUrl(url: string): Source {
  const host = new URL(url).hostname;
  return SOURCES.find(([d]) => host === d || host.endsWith(`.${d}`))?.[1] ?? "other";
}

export function fetchUrlFor(canonical: string): string {
  const id = canonical.match(/^https:\/\/www\.linkedin\.com\/jobs\/view\/(\d+)$/)?.[1];
  return id ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}` : canonical;
}
