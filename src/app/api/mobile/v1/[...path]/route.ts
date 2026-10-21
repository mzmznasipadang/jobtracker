import { mobileRoute } from '@/lib/mobile-api';
import { handleMobile } from '@/lib/mobile-handlers';
type Context = {
    params: Promise<{
        path: string[];
    }>;
};
async function route(request: Request, context: Context) {
    const { path } = await context.params;
    return mobileRoute(request, account => handleMobile(account, request, path));
}
export { route as GET, route as POST, route as PUT, route as PATCH, route as DELETE };
