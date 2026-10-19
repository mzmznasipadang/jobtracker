import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccountFixture } from "./helpers/accounts";
import { getAccountDb } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
vi.mock("@/lib/auth", () => ({ requireSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { requireSession } from "@/lib/auth";
import { GET as pdf } from "@/app/api/jobs/[id]/cv/[version]/route";
import { GET as stats } from "@/app/api/public/stats/route";
import { GET as health } from "@/app/api/health/route";
import { saveGeneral } from "@/app/app/settings/actions";
let fixture: ReturnType<typeof createAccountFixture>;
beforeEach(() => { fixture = createAccountFixture(); vi.mocked(requireSession).mockResolvedValue(fixture.member); });
afterEach(() => fixture.cleanup());
it("PDF lookup cannot access an owner document even when its id/version is known", async () => {
  const db = getAccountDb(fixture.owner);
  db.prepare("INSERT INTO jobs (id,url,source,company,title) VALUES (1,'u','other','Private','Role')").run();
  db.prepare("INSERT INTO tailored (job_id,version,cv_json,pdf) VALUES (1,1,?,?)").run(JSON.stringify({ basics: { name: "Owner" } }), Buffer.from("%PDF"));
  const response = await pdf(new Request("https://example.com/api/jobs/1/cv/1"), { params: Promise.resolve({ id: "1", version: "1" }) });
  expect(response.status).toBe(404);
});
it("public metrics use only owner and health requires no authenticated session", async () => {
  const db = getAccountDb(fixture.member);
  db.prepare("INSERT INTO jobs (url,source,company,title,status,applied_at) VALUES ('private','other','Private','Role','applied','2026-01-01')").run();
  saveSettings(fixture.owner, { publicPageEnabled: true });
  expect((await (await stats()).json()).totals.sent).toBe(0);
  vi.mocked(requireSession).mockRejectedValue(new Error("unauthenticated"));
  expect(await (await health()).json()).toEqual({ ok: true });
  await expect(pdf(new Request("https://example.com"), { params: Promise.resolve({ id: "1", version: "1" }) })).rejects.toThrow("unauthenticated");
});
it("member cannot publish themselves or change the owner's public toggle", async () => {
  saveSettings(fixture.owner, { publicPageEnabled: false });
  const form = new FormData(); form.set("publicPageEnabled", "on"); form.set("aiModel", "claude-opus-5-5");
  await saveGeneral(form);
  expect(getSettings(fixture.member).publicPageEnabled).toBe(false);
  expect(getSettings(fixture.owner).publicPageEnabled).toBe(false);
});
