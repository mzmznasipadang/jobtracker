import { z } from "zod";
import { askJson } from "../ai";
import { getMasterCv } from "../cv/parse";
import { getDb } from "../db";
import { addEvent, getJob } from "../jobs";
import { MATCH_JOB, SCAM_REVIEW } from "../prompts";
import { getSettings } from "../settings";
import { salaryFit } from "./salary";
import { ruleRisk, scamSignals, type Risk } from "./scam";

const MatchResult = z.object({
  score: z.number(),
  reasons: z.array(z.string()),
  gaps: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  dealBreakerHit: z.string().nullable(),
});
const ScamResult = z.object({ risk: z.enum(["low", "medium", "high"]), reasons: z.array(z.string()) });

const ORDER: Risk[] = ["low", "medium", "high"];
const RAW_LIMIT = 20_000;

// Throws AiError on a failed Claude call; nothing is stored then, so the caller's extraction stays intact.
export async function runChecks(jobId: number): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const settings = getSettings();
  const cv = getMasterCv();
  const posting = {
    company: job.company, title: job.title, location: job.location, workMode: job.workMode, employmentType: job.employmentType,
    salary: { min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency, period: job.salaryPeriod },
    requirements: job.requirements, niceToHave: job.niceToHave, description: job.description,
  };

  const fit = salaryFit(job, settings.salary);
  const signals = scamSignals(job, job.rawText ?? "", settings.salary);

  let score: number | null = null;
  let matchJson = '{"reason":"no master CV"}';
  if (cv) {
    const m = await askJson({
      schema: MatchResult, system: MATCH_JOB, effort: "medium",
      content: JSON.stringify({ posting, cv, preferences: settings.preferences }),
    });
    const clamped = Math.round(Math.min(100, Math.max(0, m.score)));
    score = m.dealBreakerHit ? Math.min(clamped, 40) : clamped;
    matchJson = JSON.stringify({ reasons: m.reasons, gaps: m.gaps, missingKeywords: m.missingKeywords, dealBreakerHit: m.dealBreakerHit });
  }

  const ai = await askJson({
    schema: ScamResult, system: SCAM_REVIEW, effort: "low",
    content: JSON.stringify({ posting, source: job.source, recruiterEmail: job.recruiterEmail, applyEmail: job.applyEmail, ruleSignals: signals, rawText: (job.rawText ?? "").slice(0, RAW_LIMIT) }),
  });
  const risk = ORDER[Math.max(ORDER.indexOf(ruleRisk(signals)), ORDER.indexOf(ai.risk))];

  const promote = job.status === "saved" && job.extractError == null;
  getDb().transaction(() => {
    getDb().prepare(`UPDATE jobs SET match_score=?, match_json=?, salary_fit=?, scam_risk=?, scam_json=?,
      status = CASE WHEN ? THEN 'ready' ELSE status END, updated_at=? WHERE id=?`)
      .run(score, matchJson, fit, risk, JSON.stringify({ signals, reasons: ai.reasons }), promote ? 1 : 0, new Date().toISOString(), jobId);
    addEvent(jobId, "check", { matchScore: score, salaryFit: fit, scamRisk: risk });
    if (promote) addEvent(jobId, "status", { from: "saved", to: "ready", by: "check" });
  })();
}
