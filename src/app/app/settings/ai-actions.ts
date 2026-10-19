"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireSession} from "@/lib/auth";
import {getActiveAccount,type Account} from "@/lib/accounts";
import {AiProvider,saveAiSelection} from "@/lib/ai-settings";
import {createSkill,updateSkill,deleteSkill,selectSkills,decodeSkillUpload} from "@/lib/cv-skills";
type Result<T> = {ok:true;value:T}|{ok:false;error:string};
async function manage<T>(fn:(account:Account)=>T|Promise<T>):Promise<Result<T>> {
  const account=await requireSession();
  if(getActiveAccount(account.id)?.role!=="owner")return {ok:false,error:"Only the owner can manage AI settings and skills"};
  try {const value=await fn(account);revalidatePath("/app/settings");revalidatePath("/app/jobs","layout");return {ok:true,value};}
  catch(e){
    let error="Could not save this change. Reload the list and try again.";
    if(e instanceof z.ZodError)error=e.issues.map(i=>i.message).join("; ");
    else if(e instanceof TypeError)error="Import a valid UTF-8 Markdown file";
    else if(e instanceof Error){
      if(/UNIQUE/.test(e.message))error="A skill with that filename already exists";
      else if(/^(Settings changed|Skill changed|Replace or clear|Select a primary|Configure this provider|Maximum skill)/.test(e.message))error=e.message;
    }
    return {ok:false,error};
  }
}
const Id=z.number().int().positive();
const Skill=z.object({filename:z.string(),body:z.string()});
export async function saveAiConfigAction(input:unknown){return manage(a=>saveAiSelection(a,z.object({provider:AiProvider,model:z.string(),revision:Id}).parse(input)));}
export async function createSkillAction(input:unknown){return manage(a=>createSkill(a,Skill.parse(input)));}
export async function updateSkillAction(input:unknown){return manage(a=>updateSkill(a,Skill.extend({id:Id,revision:Id}).parse(input)));}
export async function deleteSkillAction(id:number,revision:number){return manage(a=>deleteSkill(a,Id.parse(id),Id.parse(revision)));}
export async function selectSkillsAction(input:unknown){return manage(a=>selectSkills(a,z.object({primarySkillId:Id,additionalSkillId:Id.nullable(),revision:Id}).parse(input)));}
export async function importSkillAction(form:FormData){return manage(async a=>{
  const file=form.get("file");if(!(file instanceof File))throw new TypeError("Missing file");
  if(file.size>65536)throw new Error("Maximum skill size is 64 KiB");
  return createSkill(a,decodeSkillUpload(file.name,new Uint8Array(await file.arrayBuffer())));
});}
