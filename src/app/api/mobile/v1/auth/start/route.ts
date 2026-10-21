import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { beginGoogleLogin, GOOGLE_STATE_COOKIE } from '@/lib/google-login';
import { OAUTH_MAX_AGE } from '@/lib/oauth-state';
import { pkceChallenge } from '@/lib/mobile-auth';
import { mobileFailure } from '@/lib/mobile-api';
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const mobile = { challenge: pkceChallenge.parse(url.searchParams.get('challenge')), clientState: pkceChallenge.parse(url.searchParams.get('state')) };
        const flow = await beginGoogleLogin('/app', mobile), state = new URL(flow.url).searchParams.get('state')!;
        (await cookies()).set(`${GOOGLE_STATE_COOKIE}_${state}`, flow.cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google', maxAge: OAUTH_MAX_AGE });
        return NextResponse.redirect(flow.url, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    catch (e) {
        return mobileFailure(e);
    }
}
