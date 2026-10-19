import { describe, expect, it } from "vitest";
import { canonicalUrl, fetchUrlFor, sourceFromUrl } from "@/lib/capture/url";

describe("canonicalUrl", () => {
  it("reduces LinkedIn URLs to /jobs/view/<id>", () => {
    const want = "https://www.linkedin.com/jobs/view/4468726313";
    expect(canonicalUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4468726313&x=1")).toBe(want);
    expect(canonicalUrl("https://id.linkedin.com/jobs/view/4468726313/?refId=abc")).toBe(want);
    expect(canonicalUrl("https://www.linkedin.com/jobs/view/senior-dev-at-acme-4468726313?trk=x")).toBe(want);
  });

  it("strips utm_*, hash and trailing slash but keeps other params", () => {
    expect(canonicalUrl("https://example.com/jobs/12/?utm_source=a&id=7&utm_medium=b#apply")).toBe("https://example.com/jobs/12?id=7");
  });
});

describe("sourceFromUrl", () => {
  it.each([
    ["https://id.jobstreet.com/job/1", "jobstreet"],
    ["https://glints.com/id/opportunities/jobs/x", "glints"],
    ["https://www.kalibrr.com/c/x/jobs/1", "kalibrr"],
    ["https://dealls.com/loker/x", "dealls"],
    ["https://wellfound.com/jobs/1", "wellfound"],
    ["https://www.upwork.com/jobs/~01", "upwork"],
    ["https://projects.co.id/public/browse_projects/view/1", "projects"],
    ["https://www.linkedin.com/jobs/view/1", "linkedin"],
    ["https://example.com/job", "other"],
  ])("%s -> %s", (url, source) => expect(sourceFromUrl(url)).toBe(source));
});

describe("fetchUrlFor", () => {
  it("maps LinkedIn to the guest API and leaves others alone", () => {
    expect(fetchUrlFor("https://www.linkedin.com/jobs/view/4468726313")).toBe("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4468726313");
    expect(fetchUrlFor("https://example.com/job")).toBe("https://example.com/job");
  });
});
