import { getOwnerAccount } from "@/lib/accounts";
import { computeMetrics } from "@/lib/metrics";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic"; // reads the DB per request, never at build time

export async function GET() {
  const account = getOwnerAccount();
  if (!getSettings(account).publicPageEnabled) return new Response(null, { status: 404 });
  return Response.json(computeMetrics(account), { headers: { "Cache-Control": "public, max-age=300" } });
}
