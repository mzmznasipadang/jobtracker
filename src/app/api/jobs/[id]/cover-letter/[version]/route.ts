import { isExpired } from '@/lib/archive';
import { requireSession } from '@/lib/auth';
import { getAccountDb } from '@/lib/db';
import { getJob } from '@/lib/jobs';
import { renderCoverLetterHtml } from '@/lib/tailor/cv-html';
import type { TailoredCv } from '@/lib/tailor/guard';
import { htmlToPdf } from '@/lib/tailor/pdf';
import { cvFilename } from '@/lib/tailor/tailor';

export async function GET(_req: Request, { params }: {
    params: Promise<{ id: string; version: string }>;
}) {
    const account = await requireSession();
    const p = await params;
    const id = /^\d+$/.test(p.id) ? Number(p.id) : NaN;
    const version = /^\d+$/.test(p.version) ? Number(p.version) : NaN;
    const job = getJob(account, id);
    if (!job || isExpired(job)) return new Response('Not found', { status: 404 });
    const saved = getAccountDb(account).prepare('SELECT cv_json, cover_letter FROM tailored WHERE job_id=? AND version=?').get(id, version) as {
        cv_json: string; cover_letter: string | null;
    } | undefined;
    if (!saved?.cover_letter?.trim()) return new Response('Not found', { status: 404 });
    const cv = JSON.parse(saved.cv_json) as TailoredCv;
    const pdf = await htmlToPdf(renderCoverLetterHtml(cv.basics, saved.cover_letter));
    // Rendering can cross the archive deadline or a concurrent deletion.
    const current = getJob(account, id);
    if (!current || isExpired(current)) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(pdf), {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${cvFilename(cv.basics.name, job.company).replace(/-CV\.pdf$/, '-Cover-Letter.pdf')}"`,
            'Cache-Control': 'private, no-store',
        },
    });
}
