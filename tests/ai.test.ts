import { getOwnerAccount } from "@/lib/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { resetDb } from "@/lib/db";
import { AiError, askJson } from "@/lib/ai";

beforeEach(() => resetDb());

const schema = z.object({ n: z.number() });
const stub = (res: unknown) => {
  const create = vi.fn(async () => res);
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
};
const ask = (client: Anthropic) => askJson(getOwnerAccount(), { schema, system: "sys", content: "hi" }, client);
const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });

describe("askJson", () => {
  it("returns parsed output and sends the expected request", async () => {
    const { client, create } = stub(reply('{"n":1}'));
    expect(await ask(client)).toEqual({ n: 1 });
    const req = create.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(req[0]).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }],
    });
    expect(req[0]).not.toHaveProperty("thinking");
    expect(req[0]).not.toHaveProperty("temperature");
  });

  it("throws refusal even when the content is plain text", async () => {
    const { client } = stub(reply("I can't help with that.", "refusal"));
    await expect(ask(client)).rejects.toMatchObject({ name: "AiError", code: "refusal" });
  });

  it.each([
    ["max_tokens truncation", reply('{"n":', "max_tokens")],
    ["invalid JSON", reply("not json")],
    ["schema mismatch", reply('{"n":"x"}')],
  ])("throws unparseable on %s", async (_, res) => {
    await expect(ask(stub(res).client)).rejects.toMatchObject({ code: "unparseable" });
  });

  it("wraps SDK errors as api errors", async () => {
    const e = new Anthropic.APIError(529, { error: { message: "overloaded" } }, "overloaded", new Headers());
    const client = { beta: { messages: { create: async () => { throw e; } } } } as unknown as Anthropic;
    const err = await ask(client).catch((x) => x);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("api");
  });
});
