import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getRegistry, getActiveAccount, type Account } from './accounts';
import { createSession, lookupSession, sessionHash, SESSION_MS } from './sessions';
export class MobileError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export const mobileCallback = 'jobtracker://auth/callback';
export const pkceChallenge = z.string().regex(/^[\w-]{43}$/);
export function bearerToken(request: Request): string {
    const match = /^Bearer ([\w-]{43})$/.exec(request.headers.get('authorization') ?? '');
    if (!match)
        throw new MobileError(401, 'Sign in to continue');
    return match[1];
}
export function requireMobileAccount(request: Request): Account {
    const account = lookupSession(bearerToken(request));
    if (!account)
        throw new MobileError(401, 'Your session expired. Sign in again.');
    return account;
}
export function createMobileHandoff(account: Account, challenge: string): string {
    pkceChallenge.parse(challenge);
    if (!getActiveAccount(account.id))
        throw new MobileError(403, 'Account is not approved');
    const db = getRegistry(), code = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM mobile_handoffs WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO mobile_handoffs VALUES(?,?,?,?)').run(sessionHash(code), account.id, challenge, Date.now() + 60000);
    return code;
}
export function exchangeMobileHandoff(code: string, verifier: string) {
    pkceChallenge.parse(code);
    z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).parse(verifier);
    const challenge = createHash('sha256').update(verifier).digest('base64url'), db = getRegistry();
    return db.transaction(() => {
        const row = db.prepare('DELETE FROM mobile_handoffs WHERE code_hash=? AND challenge=? AND expires_at>? RETURNING account_id').get(sessionHash(code), challenge, Date.now()) as {
            account_id: number;
        } | undefined;
        const account = row && getActiveAccount(row.account_id);
        if (!account)
            throw new MobileError(401, 'Sign-in expired. Please try again.');
        return { token: createSession(account), expiresAt: new Date(Date.now() + SESSION_MS).toISOString(), account };
    }).immediate();
}
