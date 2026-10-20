import type { Job } from './types';
export function getTailorReadiness(job: Job, hasMasterCv: boolean): {ready:boolean;reason:string|null} {
  const reason = job.archivedAt ? 'Restore this job before tailoring.' : !hasMasterCv ? 'Upload and save your master CV in Settings first.' : !job.company.trim() || !job.title.trim() ? 'Review the job details: company and title are required.' : job.extractError ? 'Retry extraction or confirm the job details first.' : job.busy && job.busySince && Date.now()-Date.parse(job.busySince)<900000 ? 'Wait for processing to finish.' : null;
  return {ready:!reason,reason};
}
