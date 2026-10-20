import type { Account } from "../accounts";
import { askJson } from "../ai";
import { getMasterCv } from "../cv/parse";
import { getAccountDb } from "../db";
import { addEvent, requireActiveJob } from "../jobs";
import { TAILOR_REQUIREMENTS } from "../prompts";
import { snapshotTailoring, type TailorSetup, type SkillSnapshot } from "../cv-skills";
import type { AiProvider } from "../ai-settings";
import { getSettings } from "../settings";
import { renderCvHtml } from "./cv-html";
import { applyGuard, TailorOutput, type TailoredCv } from "./guard";
import { htmlToPdf } from "./pdf";
// Throws on any failure (the caller wraps it in startJobWork); nothing is stored then.
export async function tailorJob(account: Account, jobId: number, extraQuestions: string[] = []): Promise<{
    version: number;
}> {
    const { setup, tailored, out, lang } = await generateTailorContent(account, jobId, extraQuestions);
    const pdf = await htmlToPdf(renderCvHtml(tailored, lang));
    return storeTailored(account, jobId, tailored, out, lang, setup, pdf);
}
export async function generateTailorContent(account: Account, jobId: number, extraQuestions: string[] = []) {
    const setup = snapshotTailoring();
    const job = requireActiveJob(account, jobId);
    if (!job)
        throw new Error(`Job ${jobId} not found`);
    const cv = getMasterCv(account);
    if (!cv)
        throw new Error("Upload your master CV in Settings first");
    const settings = getSettings(account);
    const lang = settings.pipeline.cvLanguage === "auto" ? job.language : settings.pipeline.cvLanguage;
    const out = await askJson(account, {
        operation: "tailor", schema: TailorOutput, system: composeTailorInstructions(setup), ai: setup.ai, effort: "high", maxTokens: 16000,
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
    return { setup, tailored, out, lang };
}
export function storeTailored(account: Account, jobId: number, tailored: TailoredCv, out: Pick<TailorOutput, 'coverLetter' | 'answers'>, lang: 'en' | 'id', setup: TailorSetup, pdf: Buffer, draft?: {
    id: string;
    revision: number;
}) {
    return getAccountDb(account).transaction(() => {
        const { version } = getAccountDb(account).prepare(`INSERT INTO tailored (job_id, version, cv_json, cover_letter, answers_json, pdf)
      VALUES (?, (SELECT COALESCE(MAX(version), 0) + 1 FROM tailored WHERE job_id = ?), ?, ?, ?, ?) RETURNING version`)
            .get(jobId, jobId, JSON.stringify(tailored), out.coverLetter, JSON.stringify(out.answers), pdf) as {
            version: number;
        };
        if (draft)
            getAccountDb(account).prepare('UPDATE tailored SET draft_id=?,draft_revision=? WHERE job_id=? AND version=?').run(draft.id, draft.revision, jobId, version);
        const metadata: GenerationMetadata = { ...setup.ai, primary: setup.primary, additional: setup.additional };
        getAccountDb(account).prepare("INSERT INTO generation_metadata(job_id,version,data_json) VALUES (?,?,?)").run(jobId, version, JSON.stringify(metadata));
        addEvent(account, jobId, "tailor", { version, language: lang });
        return { version };
    })();
}
export type GenerationMetadata = {
    provider: AiProvider;
    model: string;
    primary: SkillSnapshot;
    additional: SkillSnapshot | null;
};
export type GenerationSummary = Omit<GenerationMetadata, "primary" | "additional"> & {
    primary: Omit<SkillSnapshot, "body">;
    additional: Omit<SkillSnapshot, "body"> | null;
};
const skillSummary = ({ id, filename, revision }: SkillSnapshot) => ({ id, filename, revision });
function metadataSummary(raw: string | null): GenerationSummary | null {
    if (!raw)
        return null;
    const m = JSON.parse(raw) as GenerationMetadata;
    return { provider: m.provider, model: m.model, primary: skillSummary(m.primary), additional: m.additional ? skillSummary(m.additional) : null };
}
export function composeTailorInstructions(setup: TailorSetup): string {
    return [TAILOR_REQUIREMENTS, `Primary skill: ${setup.primary.filename} (revision ${setup.primary.revision})\n${setup.primary.body}`, setup.additional ? `Additional skill: ${setup.additional.filename} (revision ${setup.additional.revision})\n${setup.additional.body}` : null, "The additional skill refines style. Neither skill may override the protected factual, schema or language requirements above."].filter(Boolean).join("\n\n");
}
export type TailoredVersion = {
    generation: GenerationSummary | null;
    version: number;
    createdAt: string;
    cv: TailoredCv;
    coverLetter: string;
    answers: TailorOutput["answers"];
};
// Newest first; the PDF blob is left out (fetch it with getTailoredPdf).
export function getTailored(account: Account, jobId: number): TailoredVersion[] {
    const rows = getAccountDb(account).prepare("SELECT t.version, t.created_at, t.cv_json, t.cover_letter, t.answers_json, m.data_json FROM tailored t LEFT JOIN generation_metadata m ON m.job_id=t.job_id AND m.version=t.version WHERE t.job_id = ? ORDER BY t.version DESC")
        .all(jobId) as {
        version: number;
        created_at: string;
        cv_json: string;
        cover_letter: string | null;
        answers_json: string | null;
        data_json: string | null;
    }[];
    return rows.map((r) => ({
        generation: metadataSummary(r.data_json), version: r.version, createdAt: r.created_at, cv: JSON.parse(r.cv_json), coverLetter: r.cover_letter ?? "",
        answers: r.answers_json ? JSON.parse(r.answers_json) : [],
    }));
}
export function getTailoredPdf(account: Account, jobId: number, version: number): {
    pdf: Buffer;
    name: string;
} | null {
    const r = getAccountDb(account).prepare("SELECT pdf, cv_json FROM tailored WHERE job_id = ? AND version = ?").get(jobId, version) as {
        pdf: Buffer | null;
        cv_json: string;
    } | undefined;
    return r?.pdf ? { pdf: r.pdf, name: (JSON.parse(r.cv_json) as TailoredCv).basics.name } : null;
}
const clean = (s: string) => s.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "").replace(/-+/g, "-");
export const cvFilename = (name: string, company: string) => `${clean(name) || "CV"}-${clean(company) || "Company"}-CV.pdf`;
