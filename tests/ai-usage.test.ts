import { afterEach, beforeEach, expect, it } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getUsagePolicy, saveUsagePolicy, reserveAiRequest, markDispatched, finishAiRequest, getUsageSummary, saveModelPricing } from '@/lib/ai-usage';
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => { f = createAccountFixture(); });
afterEach(() => f.cleanup());
const ai = { provider: 'openai' as const, model: 'test' };
it('reserves atomically, counts pending/failed requests and isolates member summaries', () => {
    saveUsagePolicy(f.owner, { scope: 'global', limit: 1, paused: false, inherit: false, revision: 0 });
    const r = reserveAiRequest(f.member, ai, 'extract');
    expect(() => reserveAiRequest(f.member, ai, 'match')).toThrow(/allowance/);
    markDispatched(r.id);
    finishAiRequest(r.id, 'failed');
    expect(getUsageSummary(f.member).used).toBe(1);
    expect(() => getUsageSummary(f.member, f.owner.id)).toThrow(/own/);
    expect(() => saveUsagePolicy(f.member, { scope: 'global', limit: null, paused: false, inherit: false, revision: 1 })).toThrow(/owner/);
});
it('snapshots rates, handles missing telemetry and allows period overrides and pause', () => {
    saveModelPricing(f.owner, { ...ai, normalInput: 1, cachedInput: 1, cacheWrite: 1, output: 1, revision: 0 });
    const r = reserveAiRequest(f.member, ai, 'tailor');
    markDispatched(r.id);
    finishAiRequest(r.id, 'success', { normalInput: 100, cachedInput: 0, cacheWrite: 0, output: 100 });
    expect(getUsageSummary(f.member).knownCostUsd).toBeCloseTo(0.0002);
    expect(getUsageSummary(f.member).costCoverage).toBe(1);
    saveUsagePolicy(f.owner, { scope: 'account', accountId: f.member.id, limit: 0, inherit: false, paused: false, revision: 0 });
    expect(() => reserveAiRequest(f.member, ai, 'tailor')).toThrow(/allowance/);
    saveUsagePolicy(f.owner, { scope: 'month', accountId: f.member.id, month: new Date().toISOString().slice(0, 7), limit: 3, inherit: false, paused: false, revision: 0 });
    expect(reserveAiRequest(f.member, ai, 'tailor')).toBeTruthy();
    const global = getUsagePolicy(f.owner, 'global');
    saveUsagePolicy(f.owner, { ...global, paused: true });
    expect(() => reserveAiRequest(f.member, ai, 'extract')).toThrow(/paused/);
    expect(getUsageSummary(f.member).unknownOutcomes).toBe(1);
});
it('resets allowance by UTC month and rejects stale policy writes and invalid prices', () => {
    saveUsagePolicy(f.owner, { scope: 'global', limit: 1, paused: false, inherit: false, revision: 0 });
    reserveAiRequest(f.member, ai, 'extract', new Date('2026-01-31T23:59:59.999Z'));
    expect(() => reserveAiRequest(f.member, ai, 'extract', new Date('2026-01-31T23:59:59.999Z'))).toThrow(/allowance/);
    expect(reserveAiRequest(f.member, ai, 'extract', new Date('2026-02-01T00:00:00Z'))).toBeTruthy();
    expect(() => saveUsagePolicy(f.owner, { scope: 'global', limit: null, paused: false, inherit: false, revision: 0 })).toThrow(/changed/);
    expect(() => saveModelPricing(f.owner, { ...ai, normalInput: -1, cachedInput: 0, cacheWrite: 0, output: 1, revision: 0 })).toThrow();
});
it('serializes allowance reservations across separate processes',async()=>{
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const run=promisify(execFile);
 saveUsagePolicy(f.owner,{scope:'global',limit:1,paused:false,inherit:false,revision:0});
 const script=`import {getActiveAccount} from './src/lib/accounts';import {reserveAiRequest} from './src/lib/ai-usage';try{reserveAiRequest(getActiveAccount(${f.member.id})!,{provider:'openai',model:'test'},'extract');console.log('allowed');}catch(e){if((e as Error).message.includes('allowance'))console.log('limited');else throw e;}`;
 const results=await Promise.all([0,1].map(()=>run(process.execPath,['./node_modules/tsx/dist/cli.mjs','-e',script],{env:{...process.env}})));
 expect(results.map(r=>r.stdout.trim()).sort()).toEqual(['allowed','limited']);
});
