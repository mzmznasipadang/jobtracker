import type { AiSelection } from "../ai-settings";
import type { Account } from "../accounts";
import { AiError, askJson, snapshotAi } from "../ai";
import { getAccountDb } from "../db";
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

export async function parseCv(account: Account, input: { pdf: Buffer } | { text: string }, ai: AiSelection = snapshotAi()): Promise<MasterCv> {
  const content =
    "pdf" in input
      ? [
          { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: input.pdf.toString("base64") } },
          { type: "text" as const, text: "Convert this CV." },
        ]
      : input.text;
  return renumber(await askJson(account, { ai, schema: MasterCv, system: PARSE_CV, content, effort: "medium" }));
}

export function getMasterCv(account: Account): MasterCv | null {
  const raw = getKv(account, "masterCv");
  return raw ? MasterCv.parse(raw) : null;
}

export function saveMasterCv(account: Account, cv: MasterCv): void {
  setKv(account, "masterCv", MasterCv.parse(cv));
}

// Background parse (Cloudflare cuts requests at ~100 s): the state lives in kv and the settings page polls it.
export type CvParseState =
  | { status: "running"; startedAt: string }
  | { status: "done"; result: MasterCv; startedAt: string }
  | { status: "error"; error: string; startedAt: string };

const PARSE_KEY = "cvParse";
const PARSE_STALE_MS = 15 * 60 * 1000;

// A run older than PARSE_STALE_MS is presumed orphaned (e.g. server restart) and reads as absent.
export function getCvParseState(account: Account): CvParseState | null {
  const s = getKv<CvParseState>(account, PARSE_KEY);
  return !s || (s.status === "running" && Date.now() - Date.parse(s.startedAt) > PARSE_STALE_MS) ? null : s;
}

export const clearCvParseState = (account: Account) => void getAccountDb(account).prepare("DELETE FROM kv WHERE key = ?").run(PARSE_KEY);

// Throws synchronously if a parse is already running. The returned promise never rejects.
export function startCvParse(account: Account, input: { pdf: Buffer } | { text: string }): Promise<void> {
  if (getCvParseState(account)?.status === "running") throw new Error("A CV parse is already running");
  const startedAt = new Date().toISOString();
  setKv(account, PARSE_KEY, { status: "running", startedAt });
  // Only the run that still owns the state may write its outcome.
  const finish = (state: CvParseState) => {
    if (getKv<CvParseState>(account, PARSE_KEY)?.startedAt === startedAt) setKv(account, PARSE_KEY, state);
  };
  return parseCv(account, input).then(
    (result) => finish({ status: "done", result, startedAt }),
    (e) => {
      if (!(e instanceof AiError)) console.error(e);
      finish({ status: "error", error: e instanceof AiError ? `AI error (${e.code}): ${e.message}` : "Parsing failed", startedAt });
    },
  ).catch(console.error);
}
