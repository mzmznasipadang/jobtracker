import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic"; // must hit the DB per request, never at build time

export async function GET() {
  getDb(); // throws (500) if the database cannot be opened
  return Response.json({ ok: true });
}
