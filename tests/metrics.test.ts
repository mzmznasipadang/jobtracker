import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { saveSettings } from "@/lib/settings";
import { GET } from "@/app/api/public/stats/route";

const NOW = new Date("2026-10-19T00:00:00.000Z"); // a Monday, 07:00 in Jakarta
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const seed = (source: string, status: string, appliedDays: number | null, over: { response?: boolean; interview?: boolean } = {}) =>
  getDb().prepare("INSERT INTO jobs (url, source, company, title, status, applied_at, first_response_at, reached_interview) VALUES (?,?,?,?,?,?,?,?)")
    .run(`https://secret.example/${Math.random()}`, source, "SecretCorp", "Secret Title", status,
      appliedDays == null ? null : ago(appliedDays), over.response ? ago(20) : null, over.interview ? 1 : 0);

beforeEach(() => {
  resetDb();
  seed("linkedin", "rejected", 30, { response: true });
  seed("linkedin", "interview", 30, { response: true, interview: true });
  seed("linkedin", "ghosted", 30);
  seed("linkedin", "applied", 3);
  seed("kalibrr", "saved", null);
});

describe("computeMetrics", () => {
  it("aggregates per source over eligible applications only", () => {
    const s = computeMetrics(NOW);
    expect(s.sources).toHaveLength(1); // Kalibrr never applied
    const li = s.sources[0];
    expect(li).toMatchObject({ source: "linkedin", sent: 4 });
    expect(li.responseRate).toBeCloseTo(2 / 3);
    expect(li.interviewRate).toBeCloseTo(1 / 3);
    expect(li.ghostRate).toBeCloseTo(1 / 3);
    expect(s.totals).toMatchObject({ sent: 4, responseRate: li.responseRate });
  });

  it("has null rates when nothing is old enough, and no private data in the output", () => {
    resetDb();
    seed("glints", "applied", 2);
    const s = computeMetrics(NOW);
    expect(s.totals).toMatchObject({ sent: 1, responseRate: null, interviewRate: null, ghostRate: null });
    expect(JSON.stringify(s)).not.toMatch(/SecretCorp|Secret Title|secret\.example/);
  });

  it("zero-fills 12 Jakarta weeks, Monday start", () => {
    const { weekly } = computeMetrics(NOW);
    expect(weekly).toHaveLength(12);
    expect(weekly[11]).toEqual({ weekStart: "2026-10-19", sent: 0 });
    expect(weekly[10]).toEqual({ weekStart: "2026-10-12", sent: 1 }); // applied 3 days ago = Fri 16 Oct
    expect(weekly[9]).toEqual({ weekStart: "2026-10-05", sent: 0 });
    expect(weekly[6]).toEqual({ weekStart: "2026-09-14", sent: 3 }); // 30 days ago = Sat 19 Sep
  });

  it("buckets by Jakarta time, not UTC", () => {
    resetDb();
    // Sun 18 Oct 20:00 UTC = Mon 19 Oct 03:00 Jakarta
    getDb().prepare("INSERT INTO jobs (url, source, company, title, status, applied_at) VALUES ('u','glints','c','t','applied','2026-10-18T20:00:00.000Z')").run();
    expect(computeMetrics(NOW).weekly[11]).toEqual({ weekStart: "2026-10-19", sent: 1 });
  });
});

describe("GET /api/public/stats", () => {
  it("returns only PublicStats keys", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["sources", "totals", "updatedAt", "weekly"]);
    expect(Object.keys(body.totals).sort()).toEqual(["ghostRate", "interviewRate", "responseRate", "sent"]);
    expect(Object.keys(body.sources[0]).sort()).toEqual(["ghostRate", "interviewRate", "responseRate", "sent", "source"]);
  });

  it("is 404 when the public page is disabled", async () => {
    saveSettings({ publicPageEnabled: false });
    expect((await GET()).status).toBe(404);
  });
});
