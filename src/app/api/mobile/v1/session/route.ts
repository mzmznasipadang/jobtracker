import { mobileRoute } from '@/lib/mobile-api';
import { bearerToken } from '@/lib/mobile-auth';
import { revokeSession } from '@/lib/sessions';
export async function GET(request: Request) { return mobileRoute(request, account => ({ account })); }
export async function DELETE(request: Request) { return mobileRoute(request, () => { revokeSession(bearerToken(request)); return { ok: true }; }); }
