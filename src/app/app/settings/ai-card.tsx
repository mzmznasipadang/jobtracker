"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { AiConfig, AiProvider } from "@/lib/ai-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { saveAiConfigAction } from "./ai-actions";
export function AiCard({ config, available }: {
    config: AiConfig;
    available: {
        anthropic: boolean;
        openai: boolean;
    };
}) {
    const [provider, setProvider] = useState<AiProvider>(config.provider), [model, setModel] = useState(config.model), [pending, start] = useTransition(), [message, setMessage] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const router = useRouter();
    return <Card><CardHeader><CardTitle>AI provider and model</CardTitle><CardDescription>Your selection applies to new AI requests for everyone. Existing work keeps its original configuration. API usage is billed to your provider account.</CardDescription></CardHeader>
 <CardContent><form className="grid gap-4" onSubmit={e => { e.preventDefault(); start(async () => { const result = await saveAiConfigAction({ provider, model, revision: config.revision }); setMessage({ ok: result.ok, text: result.ok ? "AI configuration saved" : result.error }); if (result.ok) {
        toast.success("AI configuration saved");
        router.refresh();
    } }); }}>
 <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="ai-provider">Provider</Label><select id="ai-provider" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={provider} disabled={pending} onChange={e => { setProvider(e.target.value as AiProvider); setModel(e.target.value === config.provider ? config.model : ""); }}><option value="anthropic">Anthropic Claude</option><option value="openai">OpenAI</option></select></div>
 <div className="grid gap-1.5"><Label htmlFor="global-ai-model">Model ID</Label><Input id="global-ai-model" value={model} maxLength={200} required disabled={pending} onChange={e => setModel(e.target.value)} placeholder="Enter an available model ID"/></div></div>
 <p className="text-sm text-muted-foreground">Claude key: {available.anthropic ? "configured" : "missing"} · OpenAI key: {available.openai ? "configured" : "missing"}. Model capabilities depend on your API account.</p>
 {!available[provider] && <p className="text-sm text-destructive">Add this provider&apos;s API key to the server environment before selecting it.</p>}
 {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>{message.text}</p>}
 <Button className="w-fit" type="submit" disabled={pending || !available[provider]}>{pending ? "Saving…" : "Save AI configuration"}</Button>
 </form></CardContent></Card>;
}
