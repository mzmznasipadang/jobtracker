import { z } from "zod";
import type { MasterCv } from "../types";

const bullets = z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()) }));

export const TailorOutput = z.object({
  summary: z.string(),
  experience: z.array(z.object({ id: z.string(), bullets })),
  projects: z.array(z.object({ id: z.string(), bullets })),
  skillIds: z.array(z.string()),
  coverLetter: z.string(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
});
export type TailorOutput = z.infer<typeof TailorOutput>;

export type TailoredCv = MasterCv;

// Every digit run counts as a number ("40%", "1.5", "40k", "Rp 5jt"); only its digits are compared.
const numbers = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/\D/g, ""));
const covers = (source: string, text: string) => {
  const have = new Set(numbers(source));
  return numbers(text).every((n) => have.has(n));
};

type Entry = { id: string; bullets: { id: string; text: string }[] };

// Keeps only entries/bullets that trace back to the master CV; Claude never supplies employers, titles, dates or skills.
function guardEntries<T extends Entry>(claimed: TailorOutput["experience"], master: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const c of claimed) {
    const m = master.find((e) => e.id === c.id);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    const kept: Entry["bullets"] = [];
    for (const b of c.bullets) {
      const sources = b.sourceIds.map((id) => m.bullets.find((s) => s.id === id));
      const text = b.text.trim();
      if (!text || !sources.length || sources.includes(undefined)) continue;
      const cited = sources as Entry["bullets"];
      const final = covers(cited.map((s) => s.text).join(" "), text) ? text : cited[0].text;
      if (!kept.some((k) => k.text === final)) kept.push({ id: cited[0].id, text: final });
    }
    result.push({ ...m, bullets: kept });
  }
  return result;
}

export function applyGuard(out: TailorOutput, cv: MasterCv): TailoredCv {
  const skillIds = [...new Set(out.skillIds)];
  return {
    ...cv,
    // The summary has no cited source, so any number in it must exist somewhere in the master CV.
    summary: covers(JSON.stringify(cv), out.summary) && out.summary.trim() ? out.summary.trim() : cv.summary,
    experience: guardEntries(out.experience, cv.experience),
    projects: guardEntries(out.projects, cv.projects),
    skills: skillIds.flatMap((id) => cv.skills.find((s) => s.id === id) ?? []),
  };
}
