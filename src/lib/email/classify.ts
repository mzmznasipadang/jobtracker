import type { AiSelection } from "../ai-settings";
import type { Account } from "../accounts";
import { z } from "zod";
import { askJson, snapshotAi } from "../ai";
import { CLASSIFY_EMAIL } from "../prompts";
import type { RawEmail } from "./gmail";

export const Classification = z.enum(["rejection", "interview", "offer", "auto_ack", "other"]);
export type Classification = z.infer<typeof Classification>;

const OFFER = ["offer letter", "pleased to offer", "penawaran kerja", "surat penawaran"];
const REJECTION = ["unfortunately", "not moving forward", "other candidates", "will not be proceeding", "decided not to",
  "tidak dapat melanjutkan", "belum dapat melanjutkan", "tidak lolos", "mohon maaf"];
const INTERVIEW = ["interview", "wawancara", "assessment", "technical test", "schedule a call", "jadwal", "undangan"];
const AUTO_ACK = ["we have received your application", "application was viewed", "thank you for applying",
  "lamaran anda telah kami terima", "application received"];

export function keywordClassify(text: string): Exclude<Classification, "other"> | "ambiguous" | null {
  const t = text.toLowerCase();
  const has = (words: string[]) => words.some((w) => t.includes(w));
  if (has(OFFER)) return "offer";
  const [rej, int] = [has(REJECTION), has(INTERVIEW)];
  if (rej && int) return "ambiguous";
  if (rej) return "rejection";
  if (int) return "interview";
  return has(AUTO_ACK) ? "auto_ack" : null;
}

export const emailText = (e: Pick<RawEmail, "subject" | "snippet" | "body">) => `${e.subject}\n${e.snippet}\n${e.body}`;

export async function classifyEmail(account: Account, email: RawEmail, ai: AiSelection = snapshotAi()): Promise<Classification> {
  const k = keywordClassify(emailText(email));
  if (k && k !== "ambiguous") return k;
  const { subject, from, body } = email;
  const r = await askJson(account, { ai,
    schema: z.object({ classification: Classification }),
    system: CLASSIFY_EMAIL,
    content: JSON.stringify({ from, subject, body: body.slice(0, 6000) }),
    effort: "low",
    maxTokens: 200,
  });
  return r.classification;
}
