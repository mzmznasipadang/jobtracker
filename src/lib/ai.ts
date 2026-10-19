import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { getActiveAccount, type Account } from "./accounts";
import { getAiConfig, type AiSelection } from "./ai-settings";
import { askAnthropic } from "./ai/anthropic";
import { askOpenAi } from "./ai/openai";
import { AiError, type AiRequest } from "./ai/types";
export { AiError } from "./ai/types";
export type { AiContent, AiRequest } from "./ai/types";
export function snapshotAi(): AiSelection { const config = getAiConfig(); return Object.freeze({ provider: config.provider, model: config.model }); }
export async function askJson<T>(account: Account, opts: AiRequest<T>, clients?: {
    anthropic?: Anthropic;
    openai?: OpenAI;
}): Promise<T> {
    if (!getActiveAccount(account.id))
        throw new AiError("api", "An active account is required");
    const max = opts.maxTokens ?? 16000;
    if (!Number.isSafeInteger(max) || max < 1 || max > 16000)
        throw new AiError("api", "Output limit must be between 1 and 16000 tokens");
    const ai = opts.ai ?? snapshotAi();
    if (ai.provider === "anthropic")
        return askAnthropic(ai, opts, clients?.anthropic);
    if (ai.provider === "openai")
        return askOpenAi(ai, opts, clients?.openai);
    throw new AiError("api", "Unsupported AI provider");
}
