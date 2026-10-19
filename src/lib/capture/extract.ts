import type { AiSelection } from "../ai-settings";
import type { Account } from "../accounts";
import { askJson, snapshotAi } from "../ai";
import { EXTRACT_JOB } from "../prompts";
import { JobFields } from "../types";

export function extractJob(account: Account, text: string, url: string, ai: AiSelection = snapshotAi()): Promise<JobFields> {
  return askJson(account, { ai, schema: JobFields, system: EXTRACT_JOB, content: `Posting URL: ${url}\n\n${text}`, effort: "low" });
}
