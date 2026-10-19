import { beforeEach, describe, expect, it, vi } from "vitest";
import { askJson } from "@/lib/ai";
import { saveMasterCv } from "@/lib/cv/parse";
import { getDb, resetDb } from "@/lib/db";
import { saveSettings } from "@/lib/settings";
import { TAILOR } from "@/lib/prompts";
import { cvFilename, getTailored, getTailoredPdf, tailorJob } from "@/lib/tailor/tailor";
import type { MasterCv } from "@/lib/types";

vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson: vi.fn() }));
vi.mock("@/lib/tailor/pdf", () => ({ htmlToPdf: vi.fn(async (html: string) => Buffer.from(`%PDF ${html.slice(0, 20)}`)) }));
const ask = vi.mocked(askJson);

const cv: MasterCv = {
  basics: { name: "Victor Chandra", email: "v@x.id", phone: "", location: "Jakarta", links: [] }, summary: "Dev",
  experience: [{ id: "e1", company: "Acme", title: "Engineer", start: "2020", end: null, location: null, bullets: [{ id: "e1-b1", text: "Built billing" }] }],
  projects: [], education: [], skills: [], certifications: [], languages: [],
};
const reply = { summary: "Dev", experience: [{ id: "e1", bullets: [{ text: "Built billing, saving 40%", sourceIds: ["e1-b1"] }] }], projects: [], skillIds: [], coverLetter: "Dear team", answers: [{ question: "Why?", answer: "Because" }] };

const seedJob = (language: "en" | "id") =>
  Number(getDb().prepare("INSERT INTO jobs (url, source, company, title, language) VALUES ('u' || abs(random()), 'glints', 'Acme & Co.', 'Eng', ?)").run(language).lastInsertRowid);

beforeEach(() => {
  resetDb();
  ask.mockReset();
  ask.mockResolvedValue(reply as never);
  saveMasterCv(cv);
});

describe("tailorJob", () => {
  it("stores guarded versions with incrementing numbers, a PDF and a tailor event", async () => {
    const id = seedJob("id");
    expect(await tailorJob(id, ["Notice period?"])).toEqual({ version: 1 });
    expect(await tailorJob(id)).toEqual({ version: 2 });

    const call = ask.mock.calls[0][0];
    expect(call).toMatchObject({ system: TAILOR, effort: "high", maxTokens: 16000 });
    expect(JSON.parse(call.content as string)).toMatchObject({ language: "id", extraQuestions: ["Notice period?"] });

    const [v2, v1] = getTailored(id);
    expect([v2.version, v1.version]).toEqual([2, 1]);
    expect(v1.cv.experience[0].bullets[0].text).toBe("Built billing"); // invented 40% dropped by the guard
    expect(v1).toMatchObject({ coverLetter: "Dear team", answers: [{ question: "Why?", answer: "Because" }] });
    expect(getTailoredPdf(id, 1)!.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(getTailoredPdf(id, 1)!.name).toBe("Victor Chandra");
    expect(getTailoredPdf(id, 9)).toBeNull();
    expect(getDb().prepare("SELECT data_json FROM events WHERE job_id=? AND kind='tailor'").all(id)).toHaveLength(2);
  });

  it("uses the settings language over the job's, and fails without a master CV or job", async () => {
    saveSettings({ pipeline: { cvLanguage: "en" } });
    await tailorJob(seedJob("id"));
    expect(JSON.parse(ask.mock.calls[0][0].content as string).language).toBe("en");
    await expect(tailorJob(999)).rejects.toThrow("not found");
    getDb().prepare("DELETE FROM kv WHERE key='masterCv'").run();
    await expect(tailorJob(seedJob("en"))).rejects.toThrow("master CV");
  });

  it("stores nothing when the AI call fails", async () => {
    ask.mockRejectedValue(new Error("boom"));
    const id = seedJob("en");
    await expect(tailorJob(id)).rejects.toThrow("boom");
    expect(getTailored(id)).toEqual([]);
  });
});

it("sanitises the PDF filename", () => {
  expect(cvFilename("Victor Chandra", "Acme & Co.")).toBe("Victor-Chandra-Acme-Co-CV.pdf");
  expect(cvFilename("!!", "")).toBe("CV-Company-CV.pdf");
});
