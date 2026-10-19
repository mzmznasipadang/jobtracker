import { askJson } from "../ai";
import { EXTRACT_JOB } from "../prompts";
import { JobFields } from "../types";

export function extractJob(text: string, url: string): Promise<JobFields> {
  return askJson({ schema: JobFields, system: EXTRACT_JOB, content: `Posting URL: ${url}\n\n${text}`, effort: "low" });
}
