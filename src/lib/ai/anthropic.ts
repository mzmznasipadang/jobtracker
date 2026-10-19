import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AiSelection } from "../ai-settings";
import { AiError, parseOutput, providerError, type AiRequest } from "./types";
export async function askAnthropic<T>(ai: AiSelection, request: AiRequest<T>, client?: Anthropic): Promise<T> {
    try {
        const res = await (client ?? new Anthropic()).beta.messages.create({
            model: ai.model, max_tokens: request.maxTokens ?? 16000,
            system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: request.content }],
            output_config: { effort: request.effort ?? "medium", format: zodOutputFormat(request.schema) },
        });
        if (res.stop_reason === "refusal")
            throw new AiError("refusal", "The AI provider declined this request");
        if (res.stop_reason !== "end_turn")
            throw new AiError("unparseable", "The AI provider did not finish the response");
        return parseOutput(request.schema, res.content.map(b => b.type === "text" ? b.text : "").join(""));
    }
    catch (e) {
        return providerError(e);
    }
}
