import { randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getRegistry, getActiveAccount, type Account } from './accounts';
import { bearerToken, pkceChallenge, MobileError, mobileCallback } from './mobile-auth';
import { sessionHash } from './sessions';
import { encrypt, decrypt } from './crypto';
import { createOAuthState, consumeOAuthState, OAUTH_MAX_AGE } from './oauth-state';
import { authUrl, exchangeCode } from './email/gmail';
import { getKv } from './settings';
import { z } from 'zod';
const Ticket = z.object({ accountId: z.number(), sessionHash: z.string(), challenge: pkceChallenge, state: pkceChallenge });
export function createGmailTicket(request: Request, account: Account, challenge: string, state: string) {
    const data = { ...Ticket.parse({ accountId: account.id, sessionHash: sessionHash(bearerToken(request)), challenge, state }), stage: 'start' }, ticket = randomBytes(32).toString('base64url');
    getRegistry().prepare('DELETE FROM mobile_browser_tickets WHERE expires_at<=?').run(Date.now());
    getRegistry().prepare('INSERT INTO mobile_browser_tickets VALUES(?,?,?)').run(sessionHash(ticket), encrypt(JSON.stringify(data)), Date.now() + 60000);
    return { url: `${process.env.APP_URL || 'http://localhost:3000'}/api/mobile/v1/gmail/start?ticket=${ticket}` };
}
function active(data: z.infer<typeof Ticket>) {
    const session = getRegistry().prepare('SELECT account_id FROM sessions WHERE token_hash=? AND expires_at>=?').get(data.sessionHash, Date.now()) as {
        account_id: number;
    } | undefined;
    const account = session?.account_id === data.accountId && getActiveAccount(data.accountId);
    if (!account)
        throw new MobileError(401, 'Sign in again');
    return account;
}
export async function beginMobileGmail(ticket: string) {
    pkceChallenge.parse(ticket);
    const row = getRegistry().prepare('DELETE FROM mobile_browser_tickets WHERE code_hash=? AND expires_at>? RETURNING payload').get(sessionHash(ticket), Date.now()) as {
        payload: string;
    } | undefined;
    if (!row)
        throw new MobileError(401, 'Connection expired');
    const value = JSON.parse(decrypt(row.payload));
    if (value.stage !== 'start')
        throw new MobileError(401, 'Invalid connection');
    const data = Ticket.parse(value);
    active(data);
    const flow = createOAuthState({ purpose: 'gmail', accountId: data.accountId, sessionToken: data.sessionHash });
    const jar = await cookies();
    jar.set(`mobile_gmail_${flow.state}`, encrypt(JSON.stringify({ data, cookie: flow.cookie })), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/gmail', maxAge: OAUTH_MAX_AGE });
    return NextResponse.redirect(authUrl(flow.state, createHash('sha256').update(flow.verifier).digest('base64url')));
}
export async function completeMobileGmail(request: Request, payload: string) {
    const url = new URL(request.url), value = z.object({ data: Ticket, cookie: z.string() }).parse(JSON.parse(decrypt(payload))), account = active(value.data);
    const { verifier } = consumeOAuthState(url.searchParams.get('state') || '', value.cookie, { purpose: 'gmail', accountId: account.id, sessionToken: value.data.sessionHash });
    const back = new URL(mobileCallback);
    back.searchParams.set('state', value.data.state);
    const code = url.searchParams.get('code');
    try {
        if (!code || code.length > 4096)
            throw new Error('Denied');
        const pending = randomBytes(32).toString('base64url');
        getRegistry().prepare('INSERT INTO mobile_browser_tickets VALUES(?,?,?)').run(sessionHash(pending), encrypt(JSON.stringify({ ...value.data, stage: 'finish', googleCode: code, googleVerifier: verifier })), Date.now() + 60000);
        back.searchParams.set('code', pending);
    }
    catch {
        back.searchParams.set('error', 'Could not connect Gmail. Try again.');
    }
    return NextResponse.redirect(back, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function confirmMobileGmail(account: Account, code: string, verifier: string) {
    pkceChallenge.parse(code);
    z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).parse(verifier);
    const db = getRegistry(), row = db.prepare('SELECT payload FROM mobile_browser_tickets WHERE code_hash=? AND expires_at>?').get(sessionHash(code), Date.now()) as {
        payload: string;
    } | undefined;
    if (!row)
        throw new MobileError(401, 'Connection expired');
    const pending = z.object({ ...Ticket.shape, stage: z.literal('finish'), googleCode: z.string(), googleVerifier: z.string() }).parse(JSON.parse(decrypt(row.payload)));
    if (pending.accountId !== account.id || pending.challenge !== createHash('sha256').update(verifier).digest('base64url'))
        throw new MobileError(401, 'Invalid connection proof');
    active(pending);
    if (!db.prepare('DELETE FROM mobile_browser_tickets WHERE code_hash=? AND expires_at>?').run(sessionHash(code), Date.now()).changes)
        throw new MobileError(401, 'Connection expired');
    await exchangeCode(account, pending.googleCode, pending.googleVerifier);
    active(pending);
    if (getKv(account, 'gmailError'))
        throw new MobileError(400, 'Google did not grant a persistent Gmail connection. Reconnect and allow all requested permissions.');
    return { ok: true };
}
