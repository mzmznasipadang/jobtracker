import { getOwnerAccount } from "@/lib/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/lib/db";
import { getKv, getSettings, saveSettings, setKv } from "@/lib/settings";

beforeEach(() => resetDb());

describe("settings", () => {
  it("returns defaults on an empty DB", () => {
    const s = getSettings(getOwnerAccount());
    expect(s.pipeline.ghostDays).toBe(14);
    expect(s.aiModel).toBe("claude-opus-5-5");
  });

  it("deep-merges a patch", () => {
    const s = saveSettings(getOwnerAccount(), { pipeline: { ghostDays: 21 } });
    expect(s.pipeline.ghostDays).toBe(21);
    expect(s.pipeline.followUpDays).toBe(7);
    expect(getSettings(getOwnerAccount()).pipeline.ghostDays).toBe(21);
  });

  it("ignores undefined patch values instead of resetting saved ones", () => {
    saveSettings(getOwnerAccount(), { pipeline: { ghostDays: 21 } });
    const s = saveSettings(getOwnerAccount(), { pipeline: { ghostDays: undefined, followUpDays: 3 } });
    expect(s.pipeline.ghostDays).toBe(21);
    expect(s.pipeline.followUpDays).toBe(3);
  });

  it("rejects invalid values and does not persist them", () => {
    expect(() => saveSettings(getOwnerAccount(), { pipeline: { ghostDays: -1 } })).toThrow();
    expect(getSettings(getOwnerAccount()).pipeline.ghostDays).toBe(14);
  });

  it("round-trips kv values", () => {
    expect(getKv(getOwnerAccount(), "gmailLastSync")).toBeNull();
    setKv(getOwnerAccount(), "gmailLastSync", { at: "x" });
    expect(getKv(getOwnerAccount(), "gmailLastSync")).toEqual({ at: "x" });
  });
});
