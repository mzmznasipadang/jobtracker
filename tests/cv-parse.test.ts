import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { getMasterCv, parseCv, saveMasterCv } from "@/lib/cv/parse";
import type { MasterCv } from "@/lib/types";

const askJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai", () => ({ askJson }));

const exp = (company: string, ...bullets: string[]) => ({
  id: "e1", company, title: "Dev", start: "2020-01", end: null, location: null,
  bullets: bullets.map((text) => ({ id: "b1", text })),
});

const cv = (over: Partial<MasterCv> = {}): MasterCv => ({
  basics: { name: "A", email: "a@x.com", phone: "", location: "", links: [] },
  summary: "s", experience: [], projects: [], education: [], skills: [], certifications: [], languages: [],
  ...over,
});

beforeEach(() => {
  resetDb();
  askJson.mockReset();
});

describe("parseCv", () => {
  it("renumbers duplicate ids and keeps bullets under their parent in order", async () => {
    askJson.mockResolvedValue(cv({
      experience: [exp("Acme", "one", "two"), exp("Beta", "three")],
      skills: [{ id: "s", name: "TS", category: "" }, { id: "s", name: "Go", category: "" }],
    }));
    const out = await parseCv({ text: "cv text" });
    expect(out.experience.map((e) => e.id)).toEqual(["exp-1", "exp-2"]);
    expect(out.experience[0].bullets).toEqual([{ id: "exp-1-b1", text: "one" }, { id: "exp-1-b2", text: "two" }]);
    expect(out.experience[1].bullets).toEqual([{ id: "exp-2-b1", text: "three" }]);
    expect(out.skills.map((s) => s.id)).toEqual(["skill-1", "skill-2"]);
  });

  it("sends a PDF as a base64 document block and text as a text block", async () => {
    askJson.mockResolvedValue(cv());
    await parseCv({ pdf: Buffer.from("%PDF-1") });
    const pdfBlock = askJson.mock.calls[0][0].content[0];
    expect(pdfBlock).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from("%PDF-1").toString("base64") } });
    await parseCv({ text: "hello" });
    expect(askJson.mock.calls[1][0].content).toBe("hello");
  });
});

describe("master CV storage", () => {
  it("is null until saved, then round-trips", () => {
    expect(getMasterCv()).toBeNull();
    saveMasterCv(cv({ summary: "saved" }));
    expect(getMasterCv()?.summary).toBe("saved");
  });

  it("rejects an invalid CV", () => {
    expect(() => saveMasterCv({ summary: 1 } as unknown as MasterCv)).toThrow();
    expect(getMasterCv()).toBeNull();
  });
});
