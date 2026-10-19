import { z } from "zod";
import { getRegistry, type Account } from "./accounts";
import { getAiConfig, requireOwner, type AiSelection } from "./ai-settings";
export type CvSkill = { id: number; filename: string; body: string; revision: number; updatedAt: string };
export type SkillSnapshot = Readonly<Omit<CvSkill,"updatedAt">>;
export type TailorSetup = Readonly<{ ai: AiSelection; primary: SkillSnapshot; additional: SkillSnapshot | null }>;
const Id = z.number().int().positive();
const filename = z.string().trim().min(4).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/).refine(s=>!s.includes(".."),"Use a simple .md filename, not a path");
const document = z.object({ filename, body: z.string().refine(s=>s.trim().length>0,"Instructions cannot be empty").refine(s=>Buffer.byteLength(s,"utf8")<=65536,"Maximum skill size is 64 KiB") });
const row = (r: Record<string,unknown>): CvSkill => ({ id:r.id as number, filename:r.filename as string, body:r.body as string, revision:r.revision as number, updatedAt:r.updated_at as string });
function read(id: number): CvSkill | null { const r=getRegistry().prepare("SELECT * FROM cv_skills WHERE id=?").get(Id.parse(id)); return r?row(r as Record<string,unknown>):null; }
export function listSkills(account: Account): CvSkill[] { requireOwner(account); getAiConfig(); return getRegistry().prepare("SELECT * FROM cv_skills ORDER BY filename").all().map(r=>row(r as Record<string,unknown>)); }
export function getSkill(account: Account,id:number):CvSkill|null { requireOwner(account); getAiConfig();return read(id); }
export function createSkill(account: Account,input:{filename:string;body:string}):CvSkill {
  requireOwner(account);getAiConfig();const data=document.parse(input);
  const result=getRegistry().prepare("INSERT INTO cv_skills(filename,body,updated_at) VALUES (?,?,?)").run(data.filename,data.body,new Date().toISOString());
  return read(Number(result.lastInsertRowid))!;
}
export function updateSkill(account: Account,input:{id:number;revision:number;filename:string;body:string}):CvSkill {
  requireOwner(account);const data=document.extend({id:Id,revision:Id}).parse(input);
  const result=getRegistry().prepare("UPDATE cv_skills SET filename=?,body=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?").run(data.filename,data.body,new Date().toISOString(),data.id,data.revision);
  if(!result.changes)throw new Error("Skill changed in another tab. Reload before saving.");return read(data.id)!;
}
export function deleteSkill(account:Account,id:number,revision:number):void {
  requireOwner(account);Id.parse(id);Id.parse(revision);
  getRegistry().transaction(()=>{
    const config=getAiConfig();if([config.primarySkillId,config.additionalSkillId].includes(id))throw new Error("Replace or clear this selected skill before deleting it");
    const result=getRegistry().prepare("DELETE FROM cv_skills WHERE id=? AND revision=?").run(id,revision);
    if(!result.changes)throw new Error("Skill changed in another tab. Reload before deleting.");
  }).immediate();
}
export function selectSkills(account:Account,input:{primarySkillId:number;additionalSkillId:number|null;revision:number}) {
  requireOwner(account);const data=z.object({primarySkillId:Id,additionalSkillId:Id.nullable(),revision:Id}).parse(input);
  return getRegistry().transaction(()=>{
    const config=getAiConfig();
    if(config.revision!==data.revision)throw new Error("Settings changed in another tab. Reload.");
    if(data.primarySkillId===data.additionalSkillId || !read(data.primarySkillId) || (data.additionalSkillId!==null&&!read(data.additionalSkillId)))throw new Error("Select a primary skill and a different additional skill");
    getRegistry().prepare("UPDATE ai_config SET primary_skill_id=?,additional_skill_id=?,revision=revision+1 WHERE id=1").run(data.primarySkillId,data.additionalSkillId);
    return getAiConfig();
  }).immediate();
}
export function decodeSkillUpload(name:string,bytes:Uint8Array) {
  if(bytes.byteLength>65536)throw new Error("Maximum skill size is 64 KiB");
  return document.parse({filename:name,body:new TextDecoder("utf-8",{fatal:true}).decode(bytes)});
}
export function snapshotTailoring():TailorSetup {
  getAiConfig();
  return getRegistry().transaction(()=>{
    const config=getAiConfig(); const primary=read(config.primarySkillId), additional=config.additionalSkillId?read(config.additionalSkillId):null;
    if(!primary || (config.additionalSkillId&&!additional))throw new Error("Selected skill is missing");
    const freeze=(s:CvSkill)=>Object.freeze({id:s.id,filename:s.filename,body:s.body,revision:s.revision});
    return Object.freeze({ai:Object.freeze({provider:config.provider,model:config.model}),primary:freeze(primary),additional:additional?freeze(additional):null});
  })();
}
export function getEffectiveAiSummary() { const s=snapshotTailoring(); return {...s.ai,primary:s.primary.filename,additional:s.additional?.filename??null}; }
