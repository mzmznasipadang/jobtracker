import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MasterCvCard } from "@/app/app/settings/master-cv-card";
import type { MasterCv } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/app/app/settings/actions", () => ({
  clearCvParse: vi.fn(), parseMasterCv: vi.fn(), saveMasterCvAction: vi.fn(),
}));

const cv: MasterCv = {
  basics: { name: "A", email: "", phone: "", location: "", links: [] },
  summary: "", experience: [], projects: [], skills: [], certifications: [], languages: [],
  education: [{ id: "edu-1", school: "Test University", degree: "BSc", start: "2018", end: "2022" }],
};

it("exposes saved education as editable labeled fields", () => {
  const html = renderToStaticMarkup(createElement(MasterCvCard, { initial: cv, parse: null }));
  for (const [field, value] of [["school", "Test University"], ["degree", "BSc"], ["start", "2018"], ["end", "2022"]]) {
    expect(html).toMatch(new RegExp(`<input[^>]*id="education-edu-1-${field}"[^>]*value="${value}"`));
    expect(html).toContain(`for="education-edu-1-${field}"`);
  }
  expect(html).toContain("Add education");
  expect(html).toContain("Remove education 1");
});

it("lets a CV without education start an education history", () => {
  const html = renderToStaticMarkup(createElement(MasterCvCard, { initial: { ...cv, education: [] }, parse: null }));
  expect(html).toContain("No education added yet.");
  expect(html).toContain("Add education");
});
