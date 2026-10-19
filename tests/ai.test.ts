import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { resetDb } from "@/lib/db";
import { AiError, askJson } from "@/lib/ai";

beforeEach(() => resetDb());

const schema = z.object({ n: z.number() });
const stub = (res: unknown) => {
  const parse = vi.fn(async () => res);
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
};
const ask = (client: Anthropic) => askJson({ schema, system: "sys", content: "hi" }, client);

describe("askJson", () => {
  it("returns parsed output and sends the expected request", async () => {
    const { client, parse } = stub({ stop_reason: "end_turn", parsed_output: { n: 1 } });
    expect(await ask(client)).toEqual({ n: 1 });
    const req = parse.mock.calls[0] as unknown as [Record<string, unknown>];
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

  it("throws refusal before reading output", async () => {
    const { client } = stub({ stop_reason: "refusal", parsed_output: { n: 1 } });
    await expect(ask(client)).rejects.toMatchObject({ name: "AiError", code: "refusal" });
  });

  it("throws unparseable on null parsed_output", async () => {
    const { client } = stub({ stop_reason: "end_turn", parsed_output: null });
    await expect(ask(client)).rejects.toMatchObject({ code: "unparseable" });
  });

  it("wraps SDK failures as api errors", async () => {
    const client = { beta: { messages: { parse: async () => { throw new Error("down"); } } } } as unknown as Anthropic;
    const err = await ask(client).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("api");
  });
});
