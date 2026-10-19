import type { Account } from "../accounts";
import { askJson } from "../ai";
import { EXTRACT_JOB } from "../prompts";
import { JobFields } from "../types";

export function extractJob(account: Account, text: string, url: string): Promise<JobFields> {
  return askJson(account, { schema: JobFields, system: EXTRACT_JOB, content: `Posting URL: ${url}\n\n${text}`, effort: "low" });
}
