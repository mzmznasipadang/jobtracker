import { describe, expect, it } from "vitest";
import { renderCvHtml } from "@/lib/tailor/cv-html";
import type { MasterCv } from "@/lib/types";

const cv: MasterCv = {
  basics: { name: "Victor <Chandra>", email: "v@x.id", phone: "123", location: "Jakarta", links: ["github.com/v"] },
  summary: "Summary here",
  experience: [{ id: "e1", company: "Acme", title: "Engineer", start: "2020-01", end: null, location: "Jakarta", bullets: [{ id: "e1-b1", text: "Built billing & invoicing" }] }],
  projects: [{ id: "p1", name: "Tool", description: "A tool", bullets: [{ id: "p1-b1", text: "Shipped v1" }] }],
  education: [{ id: "edu1", school: "UI", degree: "BSc", start: "2012", end: "2016" }],
  skills: [{ id: "s1", name: "TypeScript", category: "Languages" }],
  certifications: [], languages: ["English"],
};

describe("renderCvHtml", () => {
  it("renders escaped text, every bullet, English headings and no tables", () => {
    const h = renderCvHtml(cv, "en");
    expect(h).toContain("Victor &lt;Chandra&gt;");
    expect(h).toContain("Built billing &amp; invoicing");
    expect(h).toContain("Shipped v1");
    expect(h).toContain("TypeScript");
    expect(h).toContain("Experience");
    expect(h).toContain("Montserrat");
    expect(h).not.toContain("<table");
  });

  it("localises headings for Indonesian", () => {
    const h = renderCvHtml(cv, "id");
    for (const t of ["Pengalaman", "Pendidikan", "Keahlian", "Proyek", "Sekarang"]) expect(h).toContain(t);
  });
});
