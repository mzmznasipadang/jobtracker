import { beforeEach, describe, expect, it, vi } from "vitest";
import { askJson } from "@/lib/ai";
import { classifyEmail, keywordClassify } from "@/lib/email/classify";
import type { RawEmail } from "@/lib/email/gmail";

vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), askJson: vi.fn() }));
const ask = vi.mocked(askJson);

describe("keywordClassify", () => {
  it.each([
    ["Unfortunately we have decided to move forward with other candidates", "rejection"],
    ["Kami mohon maaf, Anda tidak dapat melanjutkan ke tahap berikutnya", "rejection"],
    ["We'd like to invite you to an interview", "interview"],
    ["Thank you for interviewing with us. Unfortunately…", "ambiguous"],
    ["We have received your application", "auto_ack"],
    ["We are pleased to offer you the role. Offer letter attached; interview notes below", "offer"],
    ["Your weekly newsletter", null],
  ])("%s -> %s", (text, expected) => expect(keywordClassify(text)).toBe(expected));
});

const mail = (subject: string, body = ""): RawEmail => ({ id: "m1", threadId: "t1", from: "hr@acme.test", subject, snippet: "", body, receivedAt: "2026-10-01T00:00:00.000Z" });

describe("classifyEmail", () => {
  beforeEach(() => ask.mockReset());

  it("uses the keyword result without calling Claude", async () => {
    expect(await classifyEmail(mail("Unfortunately, we will not be proceeding"))).toBe("rejection");
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks Claude (effort low) when ambiguous or no keyword hit", async () => {
    ask.mockResolvedValue({ classification: "rejection" });
    expect(await classifyEmail(mail("Thank you for interviewing", "Unfortunately we chose someone else"))).toBe("rejection");
    ask.mockResolvedValue({ classification: "other" });
    expect(await classifyEmail(mail("Hello there"))).toBe("other");
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[0][0]).toMatchObject({ effort: "low" });
  });
});
