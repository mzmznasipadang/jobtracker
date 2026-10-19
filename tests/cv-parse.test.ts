import { getOwnerAccount } from "@/lib/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/lib/db";
import { AiError } from "@/lib/ai";
import { clearCvParseState, getCvParseState, getMasterCv, parseCv, saveMasterCv, startCvParse } from "@/lib/cv/parse";
import { setKv } from "@/lib/settings";
import type { MasterCv } from "@/lib/types";

const askJson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson }));

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
    const out = await parseCv(getOwnerAccount(), { text: "cv text" });
    expect(out.experience.map((e) => e.id)).toEqual(["exp-1", "exp-2"]);
    expect(out.experience[0].bullets).toEqual([{ id: "exp-1-b1", text: "one" }, { id: "exp-1-b2", text: "two" }]);
    expect(out.experience[1].bullets).toEqual([{ id: "exp-2-b1", text: "three" }]);
    expect(out.skills.map((s) => s.id)).toEqual(["skill-1", "skill-2"]);
  });

  it("sends a PDF as a base64 document block and text as a text block", async () => {
    askJson.mockResolvedValue(cv());
    await parseCv(getOwnerAccount(), { pdf: Buffer.from("%PDF-1") });
    const pdfBlock = askJson.mock.calls[0][1].content[0];
    expect(pdfBlock).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from("%PDF-1").toString("base64") } });
    await parseCv(getOwnerAccount(), { text: "hello" });
    expect(askJson.mock.calls[1][1].content).toBe("hello");
  });
});

describe("master CV storage", () => {
  it("is null until saved, then round-trips", () => {
    expect(getMasterCv(getOwnerAccount())).toBeNull();
    saveMasterCv(getOwnerAccount(), cv({ summary: "saved" }));
    expect(getMasterCv(getOwnerAccount())?.summary).toBe("saved");
  });

  it("rejects an invalid CV", () => {
    expect(() => saveMasterCv(getOwnerAccount(), { summary: 1 } as unknown as MasterCv)).toThrow();
    expect(getMasterCv(getOwnerAccount())).toBeNull();
  });
});

describe("background parse", () => {
  it("stores the renumbered CV as done", async () => {
    let release!: (v: MasterCv) => void;
    askJson.mockReturnValue(new Promise((r) => (release = r)));
    const run = startCvParse(getOwnerAccount(), { text: "x" });
    expect(getCvParseState(getOwnerAccount())?.status).toBe("running");
    release(cv({ experience: [exp("Acme", "one"), exp("Beta", "two")] }));
    await run;
    const s = getCvParseState(getOwnerAccount());
    expect(s?.status).toBe("done");
    expect(s?.status === "done" && s.result.experience.map((e) => e.id)).toEqual(["exp-1", "exp-2"]);
    clearCvParseState(getOwnerAccount());
    expect(getCvParseState(getOwnerAccount())).toBeNull();
  });

  it("stores an AiError code as error", async () => {
    askJson.mockRejectedValue(new AiError("refusal", "declined"));
    await startCvParse(getOwnerAccount(), { text: "x" });
    expect(getCvParseState(getOwnerAccount())).toMatchObject({ status: "error", error: "AI error (refusal): declined" });
  });

  it("refuses a second start while running, but not once the run is stale", () => {
    askJson.mockReturnValue(new Promise(() => {}));
    void startCvParse(getOwnerAccount(), { text: "x" });
    expect(() => startCvParse(getOwnerAccount(), { text: "y" })).toThrow("already running");
    setKv(getOwnerAccount(), "cvParse", { status: "running", startedAt: new Date(Date.now() - 16 * 60_000).toISOString() });
    expect(getCvParseState(getOwnerAccount())).toBeNull();
    expect(() => void startCvParse(getOwnerAccount(), { text: "z" })).not.toThrow();
  });
});
