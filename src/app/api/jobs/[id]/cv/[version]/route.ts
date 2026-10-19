import { requireSession } from "@/lib/auth";
import { getJob } from "@/lib/jobs";
import { cvFilename, getTailoredPdf } from "@/lib/tailor/tailor";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const account = await requireSession();
  const p = await params;
  const id = /^\d+$/.test(p.id) ? Number(p.id) : NaN;
  const version = /^\d+$/.test(p.version) ? Number(p.version) : NaN;
  const found = getTailoredPdf(account, id, version);
  const job = getJob(account, id);
  if (!found || !job) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cvFilename(found.name, job.company)}"` },
  });
}
