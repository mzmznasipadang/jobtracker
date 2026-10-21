import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { getJob } from '@/lib/jobs';
import { requireSession } from '@/lib/auth';
import { resetDb } from '@/lib/db';
import { setEmailRelevance, linkEmail } from '@/app/app/inbox/actions';
import InboxPage from '@/app/app/inbox/page';
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/app/inbox/link-email', () => ({ LinkEmail: () => null }));
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => {
    f = createAccountFixture();
    vi.mocked(requireSession).mockResolvedValue(f.member);
    const db = getAccountDb(f.member);
    db.prepare("INSERT INTO jobs(url,source,company,title,status) VALUES('u','other','Acme','Engineer','interview')").run();
    db.prepare("INSERT INTO emails(id,subject,from_addr,received_at,classification,job_id) VALUES('linked','Interview invitation','recruiter@acme.com','2026-10-20T00:00:00Z','interview',1),('unmatched','Unmatched interview','other@example.com','2026-10-20T00:00:00Z','interview',NULL)").run();
});
afterEach(() => f.cleanup());
const view = async (relevance: string, mode = 'all') => renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve({ relevance, view: mode }) }));
it('persists relevance across database reopen, filters it, and allows reversing the choice', async () => {
    expect(await setEmailRelevance('linked', 'not_relevant')).toEqual({ ok: true });
    resetDb();
    expect(await view('not_relevant')).toContain('Interview invitation');
    expect(await view('relevant')).not.toContain('Interview invitation');
    expect(await view('unreviewed')).toContain('Unmatched interview');
    expect(await view('unreviewed')).not.toContain('Interview invitation');
    expect(await setEmailRelevance('linked', 'relevant')).toEqual({ ok: true });
    expect(await view('relevant', 'linked')).toContain('Interview invitation');
    expect(await view('not_relevant')).not.toContain('Interview invitation');
    expect(await setEmailRelevance('linked', 'unreviewed')).toEqual({ ok: true });
    expect(await view('unreviewed')).toContain('Interview invitation');
    expect(getJob(f.member, 1)?.status).toBe('interview');
    expect(getAccountDb(f.member).prepare('SELECT count(*) AS n FROM events').get()).toEqual({ n: 0 });
});
it('rejects foreign, invalid, missing and expired emails', async () => {
    expect(await setEmailRelevance('linked', 'invalid')).toMatchObject({ ok: false });
    expect(await setEmailRelevance('missing', 'relevant')).toMatchObject({ ok: false });
    expect(await setEmailRelevance('', 'relevant')).toMatchObject({ ok: false });
    vi.mocked(requireSession).mockResolvedValue(f.owner);
    expect(await setEmailRelevance('linked', 'relevant')).toMatchObject({ ok: false });
    vi.mocked(requireSession).mockResolvedValue(f.member);
    getAccountDb(f.member).prepare("UPDATE jobs SET archived_at='2020-01-01T00:00:00Z',purge_after='2020-02-01T00:00:00Z'").run();
    expect(await setEmailRelevance('linked', 'relevant')).toMatchObject({ ok: false });
});
it('requires sign-in before saving a relevance choice', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new Error('Sign in required'));
    await expect(setEmailRelevance('linked', 'relevant')).rejects.toThrow('Sign in required');
    expect(await view('relevant')).not.toContain('Interview invitation');
});
it('does not apply an irrelevant email to a job until its relevance is changed', async () => {
    expect(await setEmailRelevance('unmatched', 'not_relevant')).toEqual({ ok: true });
    expect(await linkEmail('unmatched', 1)).toMatchObject({ ok: false });
    expect(getAccountDb(f.member).prepare("SELECT job_id FROM emails WHERE id='unmatched'").get()).toEqual({ job_id: null });
    expect(await setEmailRelevance('unmatched', 'relevant')).toEqual({ ok: true });
    expect(await linkEmail('unmatched', 1)).toEqual({ ok: true });
});
