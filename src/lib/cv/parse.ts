import { askJson } from "../ai";
import { PARSE_CV } from "../prompts";
import { getKv, setKv } from "../settings";
import { MasterCv } from "../types";

// Claude's ids are untrusted (duplicates, collisions); regenerate them deterministically from position.
function renumber(cv: MasterCv): MasterCv {
  const bullets = (prefix: string, bs: MasterCv["experience"][number]["bullets"]) =>
    bs.map((b, i) => ({ ...b, id: `${prefix}-b${i + 1}` }));
  return {
    ...cv,
    experience: cv.experience.map((e, i) => ({ ...e, id: `exp-${i + 1}`, bullets: bullets(`exp-${i + 1}`, e.bullets) })),
    projects: cv.projects.map((p, i) => ({ ...p, id: `proj-${i + 1}`, bullets: bullets(`proj-${i + 1}`, p.bullets) })),
    education: cv.education.map((e, i) => ({ ...e, id: `edu-${i + 1}` })),
    skills: cv.skills.map((s, i) => ({ ...s, id: `skill-${i + 1}` })),
    certifications: cv.certifications.map((c, i) => ({ ...c, id: `cert-${i + 1}` })),
  };
}

export async function parseCv(input: { pdf: Buffer } | { text: string }): Promise<MasterCv> {
  const content =
    "pdf" in input
      ? [
          { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: input.pdf.toString("base64") } },
          { type: "text" as const, text: "Convert this CV." },
        ]
      : input.text;
  return renumber(await askJson({ schema: MasterCv, system: PARSE_CV, content, effort: "medium" }));
}

export function getMasterCv(): MasterCv | null {
  const raw = getKv("masterCv");
  return raw ? MasterCv.parse(raw) : null;
}

export function saveMasterCv(cv: MasterCv): void {
  setKv("masterCv", MasterCv.parse(cv));
}
