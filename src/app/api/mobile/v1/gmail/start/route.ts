import { beginMobileGmail } from '@/lib/mobile-gmail';
import { mobileFailure } from '@/lib/mobile-api';
export async function GET(request: Request) { try {
    return await beginMobileGmail(new URL(request.url).searchParams.get('ticket') || '');
}
catch (e) {
    return mobileFailure(e);
} }
