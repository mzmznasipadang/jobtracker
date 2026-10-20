import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getActiveAccount, getRegistry, type Account } from './accounts';
import { requireOwner, type AiSelection } from './ai-settings';
import { AiError } from './ai/types';
export const Operation = z.enum(['cv_parse', 'extract', 'match', 'scam', 'email_classify', 'tailor']);
export type Operation = z.infer<typeof Operation>;
export type TokenUsage = {
    normalInput: number | null;
    cachedInput: number | null;
    cacheWrite: number | null;
    output: number | null;
};
const Limit = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const Policy = z.object({ scope: z.enum(['global', 'account', 'month']), accountId: z.number().int().positive().optional(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), limit: Limit, paused: z.boolean(), inherit: z.boolean(), revision: z.number().int().nonnegative() });
export type UsagePolicy = z.infer<typeof Policy>;
const Rate = z.number().finite().min(0).max(1000000).nullable();
const Rates = z.object({ normalInput: Rate, cachedInput: Rate, cacheWrite: Rate, output: Rate });
type Rates = z.infer<typeof Rates>;
function key(input: Pick<UsagePolicy, 'scope' | 'accountId' | 'month'>): string {
    if (input.scope === 'global')
        return 'global';
    if (!input.accountId)
        throw new Error('Choose an account');
    if (input.scope === 'month' && !input.month)
        throw new Error('Choose a month');
    return `${input.scope}:${input.accountId}${input.scope === 'month' ? ':' + input.month : ''}`;
}
function readPolicy(input: Pick<UsagePolicy, 'scope' | 'accountId' | 'month'>): UsagePolicy {
    const r = getRegistry().prepare('SELECT * FROM ai_usage_policies WHERE scope=?').get(key(input)) as {
        allowance: number | null;
        paused: number;
        inherit_default: number;
        revision: number;
    } | undefined;
    return { ...input, limit: r?.allowance ?? null, paused: !!r?.paused, inherit: r ? !!r.inherit_default : input.scope === 'account', revision: r?.revision ?? 0 };
}
export function getUsagePolicy(actor: Account, scope: UsagePolicy['scope'], accountId?: number, month?: string): UsagePolicy { requireOwner(actor); return readPolicy({ scope, accountId, month }); }
export function saveUsagePolicy(actor: Account, input: UsagePolicy): UsagePolicy {
    requireOwner(actor);
    const v = Policy.parse(input);
    if (v.scope !== 'global' && !getRegistry().prepare('SELECT 1 FROM accounts WHERE id=?').get(v.accountId))
        throw new Error('Account not found');
    const db = getRegistry();
    db.transaction(() => { if (readPolicy(v).revision !== v.revision)
        throw new Error('Policy changed. Refresh.'); db.prepare('INSERT INTO ai_usage_policies VALUES(?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET allowance=excluded.allowance,paused=excluded.paused,inherit_default=excluded.inherit_default,revision=excluded.revision').run(key(v), v.limit, +v.paused, +v.inherit, v.revision + 1); }).immediate();
    return readPolicy(v);
}
export function saveModelPricing(actor: Account, input: Rates & AiSelection & {
    revision: number;
}) {
    requireOwner(actor);
    const v = Rates.extend({ provider: z.enum(['openai', 'anthropic']), model: z.string().trim().min(1).max(200), revision: z.number().int().nonnegative() }).parse(input), db = getRegistry();
    db.transaction(() => { const r = getModelPricing(actor, v); if (r.revision !== v.revision)
        throw new Error('Pricing changed. Refresh.'); db.prepare('INSERT INTO ai_model_pricing VALUES(?,?,?,?) ON CONFLICT(provider,model) DO UPDATE SET rates_json=excluded.rates_json,revision=excluded.revision').run(v.provider, v.model, JSON.stringify(Rates.parse(v)), v.revision + 1); }).immediate();
    return getModelPricing(actor, v);
}
export function getModelPricing(actor: Account, ai: AiSelection): Rates & AiSelection & {
    revision: number;
} {
    requireOwner(actor);
    const r = getRegistry().prepare('SELECT rates_json,revision FROM ai_model_pricing WHERE provider=? AND model=?').get(ai.provider, ai.model) as {
        rates_json: string;
        revision: number;
    } | undefined;
    return { ...ai, ...(r ? JSON.parse(r.rates_json) : { normalInput: null, cachedInput: null, cacheWrite: null, output: null }), revision: r?.revision ?? 0 };
}
function effective(accountId: number, month: string) {
    const global = readPolicy({ scope: 'global' }), user = readPolicy({ scope: 'account', accountId }), period = readPolicy({ scope: 'month', accountId, month });
    return { paused: global.paused || user.paused, limit: period.revision ? period.limit : user.inherit ? global.limit : user.limit };
}
export function reserveAiRequest(account: Account, ai: AiSelection, operation: Operation, now = new Date()): {
    id: string;
} {
    Operation.parse(operation);
    const db = getRegistry(), month = now.toISOString().slice(0, 7);
    return db.transaction(() => {
        if (!getActiveAccount(account.id))
            throw new AiError('policy', 'An active account is required');
        const policy = effective(account.id, month);
        if (policy.paused)
            throw new AiError('policy', 'AI requests are paused by the owner. Editing and PDF export are still available.');
        const { n } = db.prepare("SELECT count(*) n FROM ai_usage WHERE account_id=? AND month=? AND state!='cancelled'").get(account.id, month) as {
            n: number;
        };
        if (policy.limit !== null && n >= policy.limit)
            throw new AiError('policy', 'Monthly AI request allowance reached. Ask the owner to increase it; editing and PDF export remain available.');
        const rates = db.prepare('SELECT rates_json FROM ai_model_pricing WHERE provider=? AND model=?').get(ai.provider, ai.model) as {
            rates_json: string;
        } | undefined;
        const id = randomUUID();
        db.prepare('INSERT INTO ai_usage(id,account_id,month,provider,model,operation,state,started_at,rates_json) VALUES(?,?,?,?,?,?,\'reserved\',?,?)').run(id, account.id, month, ai.provider, ai.model, operation, now.toISOString(), rates?.rates_json ?? null);
        return { id };
    }).immediate();
}
export function markDispatched(id: string): void {
    const db = getRegistry();
    db.transaction(() => { const r = db.prepare('SELECT account_id,month FROM ai_usage WHERE id=? AND state=\'reserved\'').get(id) as {
        account_id: number;
        month: string;
    } | undefined; if (!r)
        throw new Error('AI reservation not found'); if (!getActiveAccount(r.account_id) || effective(r.account_id, r.month).paused)
        throw new AiError('policy', 'AI requests are paused by the owner'); const policy = effective(r.account_id, r.month); const { n } = db.prepare("SELECT count(*) n FROM ai_usage WHERE account_id=? AND month=? AND state!='cancelled'").get(r.account_id, r.month) as {
        n: number;
    }; if (policy.limit !== null && n > policy.limit)
        throw new AiError('policy', 'Monthly AI request allowance reached'); db.prepare("UPDATE ai_usage SET state='dispatched' WHERE id=?").run(id); }).immediate();
}
export function finishAiRequest(id: string, outcome: 'success' | 'failed' | 'cancelled', usage?: TokenUsage): void {
    const db = getRegistry();
    const r = db.prepare('SELECT state,rates_json FROM ai_usage WHERE id=?').get(id) as {
        state: string;
        rates_json: string | null;
    } | undefined;
    if (!r)
        throw new Error('AI reservation not found');
    let cost: number | null = null;
    if (usage && r.rates_json) {
        const rates = JSON.parse(r.rates_json) as Rates;
        let sum = 0, known = true;
        for (const k of Object.keys(rates) as (keyof Rates)[]) {
            const tokens = usage[k];
            if (tokens === null || !Number.isSafeInteger(tokens) || tokens < 0 || (tokens > 0 && rates[k] === null)) {
                known = false;
                break;
            }
            sum += tokens * (rates[k] ?? 0) / 1000000;
        }
        if (known)
            cost = sum;
    }
    const state = outcome === 'cancelled' && r.state !== 'reserved' ? 'failed' : outcome;
    db.prepare('UPDATE ai_usage SET state=?,finished_at=?,usage_json=?,cost_usd=? WHERE id=?').run(state, new Date().toISOString(), usage ? JSON.stringify(usage) : null, cost, id);
}
export function getUsageSummary(actor: Account, accountId = actor.id, month = new Date().toISOString().slice(0, 7)) {
    if (!getActiveAccount(actor.id))
        throw new Error('An active account is required');
    if (actor.id !== accountId)
        requireOwner(actor);
    if (actor.role !== 'owner' && actor.id !== accountId)
        throw new Error('Only your own usage is available');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error('Invalid month');
    const rows = getRegistry().prepare("SELECT provider,model,operation,state,usage_json,cost_usd,started_at FROM ai_usage WHERE account_id=? AND month=? AND state!='cancelled' ORDER BY started_at DESC").all(accountId, month) as {
        provider: string;
        model: string;
        operation: string;
        state: string;
        usage_json: string | null;
        cost_usd: number | null;
        started_at: string;
    }[];
    const policy = effective(accountId, month);
    return { accountId, month, ...policy, used: rows.length, remaining: policy.limit === null ? null : Math.max(0, policy.limit - rows.length), periodEnd: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString(), knownCostUsd: rows.reduce((n, r) => n + (r.cost_usd ?? 0), 0), costCoverage: rows.filter(r => r.cost_usd !== null).length, unknownOutcomes: rows.filter(r => r.state === 'reserved' || r.state === 'dispatched').length, rows: rows.map(({ usage_json, ...r }) => ({ ...r, usage: usage_json ? JSON.parse(usage_json) as TokenUsage : null })) };
}
