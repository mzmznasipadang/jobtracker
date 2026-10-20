import {afterEach,beforeEach,expect,it,vi} from 'vitest';import {createAccountFixture} from './helpers/accounts';import {requireSession} from '@/lib/auth';import {saveUsagePolicyAction,savePricingAction} from '@/app/app/settings/usage-actions';import {getUsagePolicy} from '@/lib/ai-usage';
vi.mock('@/lib/auth',()=>({requireSession:vi.fn()}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));let f:ReturnType<typeof createAccountFixture>;beforeEach(()=>{f=createAccountFixture();vi.mocked(requireSession).mockResolvedValue(f.member);});afterEach(()=>f.cleanup());
it('rejects forged member administration at the authenticated server actions',async()=>{
 expect(await saveUsagePolicyAction({scope:'global',limit:0,paused:true,inherit:false,revision:0})).toMatchObject({ok:false,error:expect.stringContaining('owner')});
 expect(await savePricingAction({provider:'openai',model:'test',normalInput:0,cachedInput:0,cacheWrite:0,output:0,revision:0})).toMatchObject({ok:false});expect(getUsagePolicy(f.owner,'global')).toMatchObject({paused:false,limit:null,revision:0});
});
