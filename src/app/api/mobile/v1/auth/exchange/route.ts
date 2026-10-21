import { z } from 'zod';
import { exchangeMobileHandoff } from '@/lib/mobile-auth';
import { body, json, mobileFailure } from '@/lib/mobile-api';
export async function POST(request: Request) {
    try {
        const input = z.object({ code: z.string(), verifier: z.string() }).strict().parse(await body(request, 2048));
        return json(exchangeMobileHandoff(input.code, input.verifier));
    }
    catch (e) {
        return mobileFailure(e);
    }
}
