import { z } from 'zod';
import { type Account, listAccounts, approveEmail, revokeAccount } from './accounts';
import { MobileError } from './mobile-auth';
import { body } from './mobile-api';
import { Settings, MasterCv } from './types';
import { getSettings, saveSettings, getKv } from './settings';
import { getMasterCv, saveMasterCv, startCvParse, getCvParseState, clearCvParseState } from './cv/parse';
import { getAccountDb } from './db';
import { linkEmail, syncInbox, isSyncing } from './email/sync';
import { disconnectGmail } from './email/gmail';
import { getUsageSummary, getUsagePolicy, saveUsagePolicy, getModelPricing, saveModelPricing } from './ai-usage';
import { getAiConfig, saveAiSelection, providerAvailability, AiProvider } from './ai-settings';
import { listSkills, createSkill, updateSkill, deleteSkill, selectSkills } from './cv-skills';
import { createGmailTicket, confirmMobileGmail } from './mobile-gmail';
const Id = z.number().int().positive();
const Patch = z.object({ profile: Settings.shape.profile.unwrap().partial().strict().optional(), preferences: Settings.shape.preferences.unwrap().partial().strict().optional(), salary: Settings.shape.salary.unwrap().partial().strict().optional(), pipeline: Settings.shape.pipeline.unwrap().partial().strict().optional(), outlookAddress: z.string().nullable().optional(), publicPageEnabled: z.boolean().optional() }).strict();
export async function handleSettings(account: Account, request: Request, path: string[]): Promise<unknown> {
    const key = path.join('/'), method = request.method, url = new URL(request.url);
    if (key === 'settings') {
        if (method === 'PATCH')
            saveSettings(account, Patch.parse(await body(request)));
        else if (method !== 'GET')
            throw new MobileError(405, 'Method not allowed');
        return { settings: getSettings(account), account, gmail: { connected: !!getKv(account, 'gmailToken'), address: getKv(account, 'gmailAddress'), lastSync: getKv(account, 'gmailLastSync'), syncing: isSyncing(account) }, usage: getUsageSummary(account) };
    }
    if (key === 'master-cv') {
        if (method === 'PUT') {
            const { cv } = z.object({ cv: MasterCv }).strict().parse(await body(request));
            saveMasterCv(account, cv);
            clearCvParseState(account);
        }
        else if (method === 'POST') {
            const input = z.object({ text: z.string().trim().min(1).max(200000).optional(), pdf: z.string().max(14000000).optional() }).strict().refine(v => !!v.text !== !!v.pdf).parse(await body(request, 14100000));
            if (input.pdf) {
                const pdf = Buffer.from(input.pdf, 'base64');
                if (pdf.length > 10 * 1024 * 1024)
                    throw new MobileError(413, 'PDF is larger than 10 MB');
                if (pdf.subarray(0, 5).toString() !== '%PDF-')
                    throw new MobileError(400, 'File is not a PDF');
                void startCvParse(account, { pdf });
            }
            else
                void startCvParse(account, { text: input.text! });
        }
        else if (method !== 'GET')
            throw new MobileError(405, 'Method not allowed');
        return { cv: getMasterCv(account), parseState: getCvParseState(account) };
    }
    if (key === 'inbox') {
        if (method === 'POST') {
            const v = z.object({ emailId: z.string().min(1), jobId: Id }).strict().parse(await body(request));
            linkEmail(account, v.emailId, v.jobId);
        }
        else if (method !== 'GET')
            throw new MobileError(405, 'Method not allowed');
        return { messages: getAccountDb(account).prepare('SELECT id,from_addr AS sender,subject,received_at AS receivedAt,classification FROM emails WHERE job_id IS NULL ORDER BY received_at DESC').all() };
    }
    if (key === 'gmail/confirm' && method === 'POST') {
        const v = z.object({ code: z.string(), verifier: z.string() }).strict().parse(await body(request));
        return confirmMobileGmail(account, v.code, v.verifier);
    }
    if (key === 'gmail' && method === 'POST') {
        const input = z.discriminatedUnion('action', [z.object({ action: z.literal('connect'), challenge: z.string(), state: z.string() }), z.object({ action: z.enum(['disconnect', 'sync']) })]).parse(await body(request));
        if (input.action === 'connect')
            return createGmailTicket(request, account, input.challenge, input.state);
        if (input.action === 'disconnect')
            await disconnectGmail(account);
        if (input.action === 'sync')
            void syncInbox(account).catch(() => { });
        return { ok: true };
    }
    if (path[0] === 'admin' && path.length === 2) {
        if (account.role !== 'owner')
            throw new MobileError(403, 'Only the owner can manage these settings');
        const resource = path[1];
        if (resource === 'accounts') {
            if (method === 'POST') {
                const input = z.discriminatedUnion('action', [z.object({ action: z.literal('approve'), email: z.email() }), z.object({ action: z.literal('revoke'), id: Id })]).parse(await body(request));
                if (input.action === 'approve')
                    approveEmail(input.email);
                else
                    revokeAccount(input.id);
            }
            else if (method !== 'GET')
                throw new MobileError(405, 'Method not allowed');
            return { accounts: listAccounts() };
        }
        if (resource === 'ai') {
            if (method === 'PUT')
                saveAiSelection(account, z.object({ provider: AiProvider, model: z.string(), revision: Id }).strict().parse(await body(request)));
            else if (method !== 'GET')
                throw new MobileError(405, 'Method not allowed');
            return { config: getAiConfig(), availability: providerAvailability() };
        }
        if (resource === 'skills') {
            const doc = z.object({ filename: z.string(), body: z.string() });
            if (method === 'POST')
                createSkill(account, doc.strict().parse(await body(request)));
            else if (method === 'PATCH')
                updateSkill(account, doc.extend({ id: Id, revision: Id }).strict().parse(await body(request)));
            else if (method === 'DELETE') {
                const v = z.object({ id: Id, revision: Id }).strict().parse(await body(request));
                deleteSkill(account, v.id, v.revision);
            }
            else if (method === 'PUT')
                selectSkills(account, z.object({ primarySkillId: Id, additionalSkillId: Id.nullable(), revision: Id }).strict().parse(await body(request)));
            else if (method !== 'GET')
                throw new MobileError(405, 'Method not allowed');
            return { skills: listSkills(account), config: getAiConfig() };
        }
        if (resource === 'usage') {
            const id = url.searchParams.get('accountId') ? Id.parse(Number(url.searchParams.get('accountId'))) : account.id;
            const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
            z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(month);
            if (method === 'PUT') {
                const v = z.object({ scope: z.enum(['global', 'account', 'month']), accountId: Id.optional(), month: z.string().optional(), limit: z.number().int().nonnegative().nullable(), paused: z.boolean(), inherit: z.boolean(), revision: z.number().int().nonnegative() }).strict().parse(await body(request));
                saveUsagePolicy(account, v);
            }
            else if (method !== 'GET')
                throw new MobileError(405, 'Method not allowed');
            return { summary: getUsageSummary(account, id, month), policies: [getUsagePolicy(account, 'global'), getUsagePolicy(account, 'account', id), getUsagePolicy(account, 'month', id, month)] };
        }
        if (resource === 'pricing') {
            const rate = z.number().min(0).max(1000000).nullable();
            if (method === 'PUT')
                saveModelPricing(account, z.object({ provider: AiProvider, model: z.string(), revision: z.number().int().nonnegative(), normalInput: rate, cachedInput: rate, cacheWrite: rate, output: rate }).strict().parse(await body(request)));
            else if (method !== 'GET')
                throw new MobileError(405, 'Method not allowed');
            return { pricing: getModelPricing(account, { provider: AiProvider.parse(url.searchParams.get('provider') ?? getAiConfig().provider), model: url.searchParams.get('model') ?? getAiConfig().model }) };
        }
    }
    throw new MobileError(404, 'Endpoint not found');
}
