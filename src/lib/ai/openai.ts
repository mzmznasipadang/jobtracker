import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { AiSelection } from "../ai-settings";
import { AiError, parseOutput, providerError, type AiRequest, type RequestObserver, tokenCount } from "./types";
export async function askOpenAi<T>(ai: AiSelection, request: AiRequest<T>, client?: OpenAI, observer?: RequestObserver): Promise<T> {
    try {
        const content: string | ResponseInputContent[] = typeof request.content === "string" ? request.content : request.content.map(b => b.type === "text" ?
            { type: "input_text", text: b.text } : { type: "input_file", filename: "cv.pdf", file_data: `data:application/pdf;base64,${b.source.data}` });
        const sdk = client ?? new OpenAI({ maxRetries: 0 });
        const format = zodTextFormat(request.schema, "result");
        observer?.dispatch();
        const res = await sdk.responses.create({
            model: ai.model, store: false, max_output_tokens: request.maxTokens ?? 16000,
            input: [{ role: "system", content: request.system }, { role: "user", content }],
            text: { format },
        }, { maxRetries: 0 });
        if (res.usage) {
            const cached = tokenCount(res.usage.input_tokens_details?.cached_tokens), write = tokenCount(res.usage.input_tokens_details?.cache_write_tokens), input = tokenCount(res.usage.input_tokens);
            observer?.usage({ normalInput: input !== null && cached !== null && write !== null && input >= cached + write ? input - cached - write : null, cachedInput: cached, cacheWrite: write, output: tokenCount(res.usage.output_tokens) });
        }
        if (res.output?.some(item => item.type === "message" && item.content.some(b => b.type === "refusal")))
            throw new AiError("refusal", "The AI provider declined this request");
        if (res.status !== "completed")
            throw new AiError("unparseable", "The AI provider did not finish the response");
        return parseOutput(request.schema, res.output_text || res.output.filter(b => b.type === "message").flatMap(b => b.content).map(b => b.type === "output_text" ? b.text : "").join(""));
    }
    catch (e) {
        return providerError(e);
    }
}
