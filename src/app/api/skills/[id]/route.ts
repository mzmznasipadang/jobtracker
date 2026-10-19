import {requireSession} from "@/lib/auth";
import {getSkill} from "@/lib/cv-skills";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const account=await requireSession();if(account.role!=="owner")return new Response("Forbidden",{status:403});
  const {id}=await params;const number=/^\d+$/.test(id)?Number(id):NaN;
  if(!Number.isSafeInteger(number)||number<1)return new Response("Not found",{status:404});
  const skill=getSkill(account,number);if(!skill)return new Response("Not found",{status:404});
  return new Response(skill.body,{headers:{"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":`attachment; filename="${skill.filename}"`,"Cache-Control":"no-store"}});
}
