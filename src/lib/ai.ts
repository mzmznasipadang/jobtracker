import type { Account } from "./accounts";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getSettings } from "./settings";

export class AiError extends Error {
  constructor(public code: "refusal" | "unparseable" | "api", message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiError";
  }
}

export async function askJson<T>(account: Account, 
  opts: {
    schema: z.ZodType<T>;
    system: string;
    content: string | Anthropic.ContentBlockParam[];
    effort?: "low" | "medium" | "high";
    maxTokens?: number;
  },
  client: Anthropic = new Anthropic(),
): Promise<T> {
  let res;
  try {
    // No thinking/temperature: opus-5-5 rejects them; depth is controlled by effort only.
    // create (not parse) so refusals and truncation are checked before any output parsing.
    res = await client.beta.messages.create({
      model: getSettings(account).aiModel,
      max_tokens: opts.maxTokens ?? 16000, // >16000 must stream (global constraints)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
    });
  } catch (e) {
    throw new AiError("api", e instanceof Error ? e.message : String(e), { cause: e });
  }
  if (res.stop_reason === "refusal") throw new AiError("refusal", "Claude declined this request");
  if (res.stop_reason === "max_tokens") throw new AiError("unparseable", "Output was truncated (max_tokens)");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError("unparseable", "Output was not valid JSON");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new AiError("unparseable", `Output did not match the schema: ${parsed.error.message}`);
  return parsed.data;
}
