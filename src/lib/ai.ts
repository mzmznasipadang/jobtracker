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

export async function askJson<T>(
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
    res = await client.beta.messages.parse({
      model: getSettings().aiModel,
      max_tokens: opts.maxTokens ?? 16000, // >16000 must stream (global constraints)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort ?? "medium", format: zodOutputFormat(opts.schema) },
    });
  } catch (e) {
    const bad = e instanceof SyntaxError || e instanceof z.ZodError;
    throw new AiError(bad ? "unparseable" : "api", e instanceof Error ? e.message : String(e), { cause: e });
  }
  if (res.stop_reason === "refusal") throw new AiError("refusal", "Claude declined this request");
  if (res.parsed_output == null) throw new AiError("unparseable", `No parseable output (stop_reason: ${res.stop_reason})`);
  return res.parsed_output as T;
}
