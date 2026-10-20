import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAccountFixture } from './helpers/accounts';
import { getAccountDb } from '@/lib/db';
import { archiveJob } from '@/lib/archive';
import { requireSession } from '@/lib/auth';
import { htmlToPdf } from '@/lib/tailor/pdf';
import { GET } from '@/app/api/jobs/[id]/cover-letter/[version]/route';
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn() }));
vi.mock('@/lib/tailor/pdf', () => ({ htmlToPdf: vi.fn(async () => Buffer.from('%PDF test')) }));
let f: ReturnType<typeof createAccountFixture>;
const args = (version = '1', id = '1') => ({ params: Promise.resolve({ id, version }) });
const req = new Request('https://test/api/jobs/1/cover-letter/1');
beforeEach(() => {
    f = createAccountFixture();
    vi.mocked(requireSession).mockResolvedValue(f.member);
    vi.mocked(htmlToPdf).mockClear();
    const db = getAccountDb(f.member);
    db.prepare("INSERT INTO jobs(url,source,company,title) VALUES('u','other','Acme','Engineer')").run();
    const cv = JSON.stringify({ basics: { name: 'Member', email: 'm@example.com', phone: '', location: 'Jakarta', links: [] } });
    db.prepare('INSERT INTO tailored(job_id,version,cv_json,cover_letter) VALUES(1,1,?,?)').run(cv, 'Dear team,\n\nSaved <script>alert(1)</script> & text.');
    db.prepare('INSERT INTO tailored(job_id,version,cv_json,cover_letter) VALUES(1,2,?,?)').run(cv, 'Other version');
});
afterEach(() => f.cleanup());
it('downloads the selected saved letter as a private PDF with escaped text and snapshot contact details', async () => {
    const res = await GET(req, args());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Member-Acme-Cover-Letter.pdf"');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await res.text()).toBe('%PDF test');
    const html = vi.mocked(htmlToPdf).mock.calls[0][0];
    expect(html).toContain('m@example.com');
    expect(html).toContain('Saved &lt;script&gt;alert(1)&lt;/script&gt; &amp; text.');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Other version');
});
it('rejects missing, malformed, empty and foreign versions without rendering', async () => {
    for (const p of [args('9'), args('x'), args('1', 'x')]) expect((await GET(req, p)).status).toBe(404);
    getAccountDb(f.member).prepare("UPDATE tailored SET cover_letter='' WHERE version=1").run();
    expect((await GET(req, args())).status).toBe(404);
    vi.mocked(requireSession).mockResolvedValue(f.owner);
    expect((await GET(req, args('2'))).status).toBe(404);
    expect(htmlToPdf).not.toHaveBeenCalled();
});
it('allows archived letters until expiry and rechecks expiry after rendering', async () => {
    archiveJob(f.member, 1);
    expect((await GET(req, args())).status).toBe(200);
    vi.mocked(htmlToPdf).mockImplementationOnce(async () => {
        getAccountDb(f.member).prepare("UPDATE jobs SET purge_after='2020-01-01T00:00:00Z'").run();
        return Buffer.from('%PDF test');
    });
    expect((await GET(req, args())).status).toBe(404);
    vi.mocked(htmlToPdf).mockClear();
    expect((await GET(req, args())).status).toBe(404);
    expect(htmlToPdf).not.toHaveBeenCalled();
});
