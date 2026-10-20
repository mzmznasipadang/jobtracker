import { expect, it, vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ id: 1, role: 'owner', email: 'owner@gmail.com' })) }));
vi.mock('@/lib/jobs', () => ({ captureJob: vi.fn(), getJob: vi.fn(() => null) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error('REDIRECT ' + url); }) }));
import { captureJob } from '@/lib/jobs';
import { captureAction } from '@/app/app/new/actions';
it('offers paste recovery for fetch failure and opens duplicates without replacing content', async () => {
    vi.mocked(captureJob).mockRejectedValueOnce(new Error('Could not fetch the posting (HTTP 403)'));
    expect(await captureAction({ url: 'https://example.com/job', text: '' })).toMatchObject({ ok: false, needsText: true, error: expect.stringContaining('Paste') });
    vi.mocked(captureJob).mockResolvedValueOnce({ id: 1, created: false, done: Promise.resolve() });
    await expect(captureAction({ url: 'https://example.com/job', text: 'copied text' })).rejects.toThrow('REDIRECT /app/jobs/1?duplicate=1');
});
