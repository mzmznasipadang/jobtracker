import { z } from 'zod';
import type { Account } from './accounts';
import { MobileError, requireMobileAccount } from './mobile-auth';
export const privateHeaders = { 'Cache-Control': 'private, no-store' };
export function json(value: unknown, status = 200) { return Response.json(value, { status, headers: privateHeaders }); }
export async function mobileRoute(request: Request, action: (account: Account) => unknown | Promise<unknown>): Promise<Response> {
    try {
        const result = await action(requireMobileAccount(request));
        return result instanceof Response ? result : json(result);
    }
    catch (error) {
        return mobileFailure(error);
    }
}
export function mobileFailure(error: unknown): Response {
    if (error instanceof MobileError)
        return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
        return json({ error: 'Invalid input' }, 400);
    // Only expose known domain messages; provider/database errors stay server-side.
    const message = error instanceof Error ? error.message : '';
    if (/^(Job not found|Job is archived|This job has expired)/.test(message))
        return json({ error: 'Job not found' }, 404);
    if (/^(Draft changed|Job changed|Settings changed|Skill changed|Policy changed|Pricing changed|Wait for|Job \d+ is busy|Cannot .*busy)/.test(message))
        return json({ error: message }, 409);
    if (/^(Restore this |Review |Confirm |Generate |Save |Missing |Invalid source|Edit source facts|No draft|Upload |Could not fetch|That does not|Enter |A master|Master CV|Job details)/.test(message))
        return json({ error: message }, 400);
    return json({ error: 'Could not complete the request. Please try again.' }, 500);
}
export async function body(request: Request, max = 250000): Promise<unknown> {
    if (Number(request.headers.get('content-length')) > max)
        throw new MobileError(413, 'Input is too large');
    const reader = request.body?.getReader();
    if (!reader)
        throw new MobileError(400, 'Input is required');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const next = await reader.read();
        if (next.done)
            break;
        size += next.value.byteLength;
        if (size > max) {
            await reader.cancel();
            throw new MobileError(413, 'Input is too large');
        }
        chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export const positiveId = (value: string) => z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(value);
