import { z } from "zod";
import type { AiSelection } from "../ai-settings";
export type AiContent = string | ({
    type: "text";
    text: string;
} | {
    type: "document";
    source: {
        type: "base64";
        media_type: "application/pdf";
        data: string;
    };
})[];
export type AiRequest<T> = {
    schema: z.ZodType<T>;
    system: string;
    content: AiContent;
    effort?: "low" | "medium" | "high";
    maxTokens?: number;
    ai?: AiSelection;
};
export class AiError extends Error {
    constructor(public code: "refusal" | "unparseable" | "api", message: string, options?: ErrorOptions) { super(message, options); this.name = "AiError"; }
}
export function parseOutput<T>(schema: z.ZodType<T>, text: string): T {
    try {
        const result = schema.safeParse(JSON.parse(text));
        if (result.success)
            return result.data;
    }
    catch { }
    throw new AiError("unparseable", "AI output did not match the required format");
}
export function providerError(error: unknown): never {
    if (error instanceof AiError)
        throw error;
    throw new AiError("api", "AI request failed. Check the configured provider key, model and permissions.");
}
