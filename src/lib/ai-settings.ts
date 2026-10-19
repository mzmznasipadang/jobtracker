import { z } from "zod";
import { getActiveAccount, getOwnerAccount, getRegistry, type Account } from "./accounts";
import { getSettings } from "./settings";
import { DEFAULT_TAILOR_SKILL } from "./prompts";
export const AiProvider = z.enum(["anthropic", "openai"]);
export type AiProvider = z.infer<typeof AiProvider>;
export type AiSelection = Readonly<{ provider: AiProvider; model: string }>;
export type AiConfig = AiSelection & { revision: number; primarySkillId: number; additionalSkillId: number | null };
type ConfigRow = { provider: AiProvider; model: string; revision: number; primary_skill_id: number; additional_skill_id: number | null };
export function requireOwner(account: Account): void {
  if (!account || getActiveAccount(account.id)?.role !== "owner") throw new Error("Only the owner can manage AI settings and skills");
}
export function providerAvailability() { return { anthropic: !!process.env.ANTHROPIC_API_KEY?.trim(), openai: !!process.env.OPENAI_API_KEY?.trim() }; }
export function getAiConfig(): AiConfig {
  const db = getRegistry();
  const read = () => db.prepare("SELECT * FROM ai_config WHERE id=1").get() as ConfigRow | undefined;
  let row = read();
  if (!row) {
    const model = getSettings(getOwnerAccount()).aiModel;
    db.transaction(() => {
      if (read()) return;
      const skill = db.prepare("INSERT INTO cv_skills(filename,body,updated_at) VALUES ('resume-tailor.md',?,?)").run(DEFAULT_TAILOR_SKILL, new Date().toISOString());
      db.prepare("INSERT INTO ai_config(id,provider,model,primary_skill_id) VALUES (1,'anthropic',?,?)").run(model, skill.lastInsertRowid);
    }).immediate();
    row = read()!;
  }
  return { provider: row.provider, model: row.model, revision: row.revision, primarySkillId: row.primary_skill_id, additionalSkillId: row.additional_skill_id };
}
export function saveAiSelection(account: Account, input: { provider: AiProvider; model: string; revision: number }): AiConfig {
  requireOwner(account); getAiConfig();
  const data = z.object({ provider: AiProvider, model: z.string().trim().min(1).max(200), revision: z.number().int().positive() }).parse(input);
  if (!providerAvailability()[data.provider]) throw new Error("Configure this provider's API key on the server first");
  const result = getRegistry().prepare("UPDATE ai_config SET provider=?,model=?,revision=revision+1 WHERE id=1 AND revision=?").run(data.provider, data.model, data.revision);
  if (!result.changes) throw new Error("Settings changed in another tab. Reload and try again.");
  return getAiConfig();
}
