"use server";
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { saveUsagePolicy, saveModelPricing } from '@/lib/ai-usage';
export async function saveUsagePolicyAction(input: Parameters<typeof saveUsagePolicy>[1]) { const account = await requireSession(); try {
    saveUsagePolicy(account, input);
    revalidatePath('/app/settings');
    return { ok: true as const };
}
catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Could not save policy' };
} }
export async function savePricingAction(input: Parameters<typeof saveModelPricing>[1]) { const account = await requireSession(); try {
    const pricing = saveModelPricing(account, input);
    revalidatePath('/app/settings');
    return { ok: true as const, pricing };
}
catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Could not save pricing' };
} }
