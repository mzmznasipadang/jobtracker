import type { Account } from "../accounts";
import { askJson } from "../ai";
import { getMasterCv } from "../cv/parse";
import { getAccountDb } from "../db";
import { addEvent, getJob } from "../jobs";
import { TAILOR } from "../prompts";
import { getSettings } from "../settings";
import { renderCvHtml } from "./cv-html";
import { applyGuard, TailorOutput, type TailoredCv } from "./guard";
import { htmlToPdf } from "./pdf";

// Throws on any failure (the caller wraps it in startJobWork); nothing is stored then.
export async function tailorJob(account: Account, jobId: number, extraQuestions: string[] = []): Promise<{ version: number }> {
  const job = getJob(account, jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const cv = getMasterCv(account);
  if (!cv) throw new Error("Upload your master CV in Settings first");
  const settings = getSettings(account);
  const lang = settings.pipeline.cvLanguage === "auto" ? job.language : settings.pipeline.cvLanguage;

  const out = await askJson(account, {
    schema: TailorOutput, system: TAILOR, effort: "high", maxTokens: 16000,
    content: JSON.stringify({
      posting: {
        company: job.company, title: job.title, location: job.location, workMode: job.workMode, employmentType: job.employmentType,
        salary: { min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency, period: job.salaryPeriod },
        requirements: job.requirements, niceToHave: job.niceToHave, description: job.description,
      },
      cv, preferences: settings.preferences, salary: settings.salary, language: lang, extraQuestions,
    }),
  });
  const tailored = applyGuard(out, cv);
  const pdf = await htmlToPdf(renderCvHtml(tailored, lang));
  // shortcut: cover letter/answers aren't fact-checked against the master CV; add a claim check if fabrications show up

  return getAccountDb(account).transaction(() => {
    const { version } = getAccountDb(account).prepare(`INSERT INTO tailored (job_id, version, cv_json, cover_letter, answers_json, pdf)
      VALUES (?, (SELECT COALESCE(MAX(version), 0) + 1 FROM tailored WHERE job_id = ?), ?, ?, ?, ?) RETURNING version`)
      .get(jobId, jobId, JSON.stringify(tailored), out.coverLetter, JSON.stringify(out.answers), pdf) as { version: number };
    addEvent(account, jobId, "tailor", { version, language: lang });
    return { version };
  })();
}

export type TailoredVersion = {
  version: number; createdAt: string; cv: TailoredCv; coverLetter: string; answers: TailorOutput["answers"];
};

// Newest first; the PDF blob is left out (fetch it with getTailoredPdf).
export function getTailored(account: Account, jobId: number): TailoredVersion[] {
  const rows = getAccountDb(account).prepare("SELECT version, created_at, cv_json, cover_letter, answers_json FROM tailored WHERE job_id = ? ORDER BY version DESC")
    .all(jobId) as { version: number; created_at: string; cv_json: string; cover_letter: string | null; answers_json: string | null }[];
  return rows.map((r) => ({
    version: r.version, createdAt: r.created_at, cv: JSON.parse(r.cv_json), coverLetter: r.cover_letter ?? "",
    answers: r.answers_json ? JSON.parse(r.answers_json) : [],
  }));
}

export function getTailoredPdf(account: Account, jobId: number, version: number): { pdf: Buffer; name: string } | null {
  const r = getAccountDb(account).prepare("SELECT pdf, cv_json FROM tailored WHERE job_id = ? AND version = ?").get(jobId, version) as { pdf: Buffer | null; cv_json: string } | undefined;
  return r?.pdf ? { pdf: r.pdf, name: (JSON.parse(r.cv_json) as TailoredCv).basics.name } : null;
}

const clean = (s: string) => s.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "").replace(/-+/g, "-");
export const cvFilename = (name: string, company: string) => `${clean(name) || "CV"}-${clean(company) || "Company"}-CV.pdf`;
