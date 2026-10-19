import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/lib/db";
import { getKv, getSettings, saveSettings, setKv } from "@/lib/settings";

beforeEach(() => resetDb());

describe("settings", () => {
  it("returns defaults on an empty DB", () => {
    const s = getSettings();
    expect(s.pipeline.ghostDays).toBe(14);
    expect(s.aiModel).toBe("claude-opus-5-5");
  });

  it("deep-merges a patch", () => {
    const s = saveSettings({ pipeline: { ghostDays: 21 } });
    expect(s.pipeline.ghostDays).toBe(21);
    expect(s.pipeline.followUpDays).toBe(7);
    expect(getSettings().pipeline.ghostDays).toBe(21);
  });

  it("rejects invalid values and does not persist them", () => {
    expect(() => saveSettings({ pipeline: { ghostDays: -1 } })).toThrow();
    expect(getSettings().pipeline.ghostDays).toBe(14);
  });

  it("round-trips kv values", () => {
    expect(getKv("gmailLastSync")).toBeNull();
    setKv("gmailLastSync", { at: "x" });
    expect(getKv("gmailLastSync")).toEqual({ at: "x" });
  });
});
