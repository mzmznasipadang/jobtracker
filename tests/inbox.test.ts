import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { setKv } from '@/lib/settings';
import InboxPage from '@/app/app/inbox/page';
import { Timeline } from '@/components/timeline';
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
vi.mock('@/app/app/inbox/link-email', () => ({ LinkEmail: () => null }));
let f: ReturnType<typeof createAccountFixture>;
beforeEach(() => {
    f = createAccountFixture();
    vi.mocked(requireSession).mockResolvedValue(f.member);
    const db = getAccountDb(f.member);
    db.prepare("INSERT INTO jobs(url,source,company,title,status) VALUES('u','other','Acme','Engineer','interview')").run();
    db.prepare("INSERT INTO emails(id,from_addr,original_from,subject,received_at,classification,job_id) VALUES('abc123','forward@example.com','recruiter@acme.com','Interview invitation','2026-10-20T01:00:00Z','interview',1),('def456','other@example.com','other@example.com','Unmatched mail','2026-10-20T01:00:00Z','other',NULL)").run();
    setKv(f.member, 'gmailAddress', 'member@gmail.com');
});
afterEach(() => f.cleanup());
it('shows linked interview email, original sender, job and mailbox-specific Gmail link', async () => {
    const html = renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve({ view: 'linked' }) }));
    expect(html).toContain('Interview invitation');
    expect(html).toContain('recruiter@acme.com');
    expect(html).toContain('/app/jobs/1');
    expect(html).toContain('Acme');
    expect(html).toContain('authuser=member%40gmail.com#all/abc123');
    expect(html).not.toContain('Unmatched mail');
});
it('keeps unmatched mail in its own view', async () => {
    const html = renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve({ view: 'unmatched' }) }));
    expect(html).toContain('Unmatched mail');
    expect(html).not.toContain('Interview invitation');
});
it('hides expired linked content and other accounts mail', async () => {
    getAccountDb(f.member).prepare("UPDATE jobs SET archived_at='2020-01-01T00:00:00Z',purge_after='2020-02-01T00:00:00Z'").run();
    const expired = renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve({ view: 'linked' }) }));
    expect(expired).not.toContain('Interview invitation');
    vi.mocked(requireSession).mockResolvedValue(f.owner);
    const other = renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve({ view: 'linked' }) }));
    expect(other).not.toContain('Interview invitation');
    expect(other).not.toContain('recruiter@acme.com');
});
it('shows email sender, subject and classification in the timeline, safely escaped', () => {
    const html = renderToStaticMarkup(createElement(Timeline, { events: [{ id: 1, at: '2026-10-20T01:00:00Z', kind: 'email', data: { from: 'recruiter@acme.com', subject: '<script>Interview</script>', classification: 'interview' } }] }));
    expect(html).toContain('recruiter@acme.com');
    expect(html).toContain('&lt;script&gt;Interview&lt;/script&gt;');
    expect(html).toContain('interview');
    expect(html).not.toContain('<script>');
});

it('shows both linked and unmatched emails by default', async () => {
    const html = renderToStaticMarkup(await InboxPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Interview invitation');
    expect(html).toContain('Unmatched mail');
});
