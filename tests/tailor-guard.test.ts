import { describe, expect, it } from "vitest";
import { applyGuard, type TailorOutput } from "@/lib/tailor/guard";
import type { MasterCv } from "@/lib/types";

const cv: MasterCv = {
  basics: { name: "Victor", email: "v@x.id", phone: "1", location: "Jakarta", links: [] },
  summary: "Engineer with 8 years of experience.",
  experience: [
    { id: "e1", company: "Acme", title: "Engineer", start: "2020-01", end: null, location: "Jakarta",
      bullets: [{ id: "e1-b1", text: "Built billing service" }, { id: "e1-b2", text: "Cut latency by 30% across 12 APIs" }] },
    { id: "e2", company: "Beta", title: "Intern", start: "2019-01", end: "2019-12", location: null,
      bullets: [{ id: "e2-b1", text: "Wrote docs" }] },
  ],
  projects: [{ id: "p1", name: "Tool", description: "A tool", bullets: [{ id: "p1-b1", text: "Shipped v1" }] }],
  education: [{ id: "edu1", school: "UI", degree: "BSc", start: "2012", end: "2016" }],
  skills: [{ id: "s1", name: "TypeScript", category: "Languages" }, { id: "s2", name: "SQL", category: "Languages" }],
  certifications: [], languages: ["English"],
};

const out = (over: Partial<TailorOutput> = {}): TailorOutput => ({
  summary: "Engineer with 8 years of experience.", experience: [], projects: [], skillIds: [], coverLetter: "", answers: [], ...over,
});

describe("applyGuard", () => {
  it("drops unknown entries, uncited or foreign-cited bullets, unknown skills, and ignores injected titles", () => {
    const o = out({
      experience: [
        { id: "e9", bullets: [{ text: "Ghost job", sourceIds: ["e9-b1"] }] },
        { id: "e1", title: "CTO", company: "Evil", bullets: [
          { text: "No sources", sourceIds: [] },
          { text: "Wrong entry", sourceIds: ["e2-b1"] },
          { text: "Built a billing service", sourceIds: ["e1-b1"] },
        ] } as never,
      ],
      skillIds: ["s2", "s99", "s1"],
    });
    const r = applyGuard(o, cv);
    expect(r.experience).toHaveLength(1);
    expect(r.experience[0]).toMatchObject({ id: "e1", title: "Engineer", company: "Acme", start: "2020-01", end: null, location: "Jakarta" });
    expect(r.experience[0].bullets.map((b) => b.text)).toEqual(["Built a billing service"]);
    expect(r.skills.map((s) => s.id)).toEqual(["s2", "s1"]);
    expect(r.basics).toEqual(cv.basics);
  });

  it("replaces a bullet carrying a number absent from its sources with the first cited original", () => {
    const r = applyGuard(out({ experience: [{ id: "e1", bullets: [
      { text: "Built billing service, cutting costs 40%", sourceIds: ["e1-b1"] },
      { text: "Reduced latency by 30% on 12 APIs", sourceIds: ["e1-b2"] },
      { text: "Cut latency 99% (up from 30%)", sourceIds: ["e1-b2", "e1-b1"] },
    ] }] }), cv);
    expect(r.experience[0].bullets.map((b) => b.text)).toEqual(["Built billing service", "Reduced latency by 30% on 12 APIs", "Cut latency by 30% across 12 APIs"]);
  });

  it("falls back to the master summary when the summary invents a number, and applies to projects", () => {
    const r = applyGuard(out({ summary: "Engineer with 15 years of experience.", projects: [{ id: "p1", bullets: [{ text: "Shipped v1 to 5000 users", sourceIds: ["p1-b1"] }] }, { id: "p2", bullets: [] }] }), cv);
    expect(r.summary).toBe(cv.summary);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].bullets[0].text).toBe("Shipped v1");
  });
});
