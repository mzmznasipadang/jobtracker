import { reserveAiRequest, markDispatched, finishAiRequest, type TokenUsage } from "./ai-usage";
import { providerAvailability } from "./ai-settings";
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
    if (ai.provider !== "anthropic" && ai.provider !== "openai")
        throw new AiError("api", "Unsupported AI provider");
    if (!clients?.[ai.provider] && !providerAvailability()[ai.provider])
        throw new AiError("api", "Configure this provider's API key on the server first");
    const reservation = reserveAiRequest(account, ai, opts.operation ?? "tailor");
    let dispatched = false, usage: TokenUsage | undefined;
    try {
        const observer = { dispatch: () => { markDispatched(reservation.id); dispatched = true; }, usage: (value: TokenUsage) => { usage = value; } };
        const result = ai.provider === "anthropic" ? await askAnthropic(ai, opts, clients?.anthropic, observer) : await askOpenAi(ai, opts, clients?.openai, observer);
        finishAiRequest(reservation.id, "success", usage);
        return result;
    }
    catch (error) {
        finishAiRequest(reservation.id, dispatched ? "failed" : "cancelled", usage);
        throw error;
    }
}
