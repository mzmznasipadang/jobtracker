# JobTracker workflow improvements — Phase 1

Date: 2026-10-20
Status: proposed for owner review; implementation not started.

## Objective and scope

Help approved users capture jobs on phones, review their tailored application before PDF creation, recover archived jobs for 30 days, and let the owner control shared AI usage. Preserve Google sign-in, private account databases, shared provider/model/Markdown skills, existing jobs, Gmail connections and generated versions.

Approved scope: mobile capture; review/edit before PDF; archive/restore with permanent deletion after 30 days; owner AI usage controls. Phase 2 is deferred: import/export, tasks/reminders and recruiter tracking.

## Approach

Recommended: extend the existing Next.js app, SQLite stores, server actions and ten-minute worker. Add small modules for draft lifecycle, archive lifecycle and AI usage accounting. No new service, queue broker or browser extension.

Alternatives considered: build an extension first (desktop benefit but does not address the current mobile paste problem); replace the background system with a dedicated queue (adds deployment and migration work beyond this release). Keep the existing per-job processing lease, strengthen mutation conditions for new lifecycle transitions, and make new operations retry-safe.

Implement as four independently verified slices: mobile capture, draft review, archive, usage controls. Release them together after migration and regression tests. No live provider calls for automated verification; mock both SDKs and generate actual PDFs in a disposable container.

## 1. Mobile capture and job review

Keep URL capture, paste and bookmarklet. On narrow screens show clear numbered instructions to open the listing, copy the full description and paste it. URL remains required. A fetch failure preserves all inputs, focuses the description field, and explains that the server could not read the page; do not promise to bypass JobStreet restrictions or claim all failures are blocking.

After extraction, present editable company, title, location and description on the job page. Company and title are required before tailoring. Save extracted content even if those fields are missing; show an explicit Needs review state and explain how to correct it. Manual corrections require no AI request. Show any extraction error separately and let the user retry extraction from edited captured text. Retry must warn before replacing manually edited job fields; cancel leaves fields intact.

Tailor displays the specific unmet prerequisite: master CV missing, company/title missing, extraction unresolved or processing in progress. Once required fields and description are supplied and confirmed, a manual save resolves the extraction error and enables tailoring. Checks can be rerun separately. A duplicate capture opens the existing job with a notice; archived duplicates offer restoration rather than creating a second copy. Expired archives cannot be restored. Forms keep user input on validation, quota and network errors, support touch keyboards, wrap long URLs, and avoid horizontal overflow.

## 2. Generate draft, review, then PDF

Replace new-run Tailor behavior with Generate draft. AI produces guarded structured content and stores a persistent editable draft without invoking Chromium. The flow is Generate draft → review/edit → Generate PDF. Existing generated versions and downloads remain available unchanged.

One working draft per job: creating another requires confirmation before replacing it. A failed replacement retains the old draft. Store the successful guarded CV, cover letter, answers, selected language, master CV snapshot, provider/model and full skill revision snapshot. Changing global settings or the master CV later does not silently alter the existing draft.

Review uses structured text fields, not raw HTML: CV summary, included experience/project bullets, selected existing skills, cover letter and answers. Employer names, employment titles/dates, contact details and education remain from the captured master CV snapshot; those source facts are edited in master CV Settings and used for a new draft. Users can edit wording and deselect sections/bullets. Include a read-only rendered preview and a comparison to the draft's master snapshot, with changed sections marked. Label AI wording and user edits as unverified; do not claim complete fact checking.

Save draft explicitly with revision checking. Navigation warns about unsaved edits. PDF generation validates and saves the submitted revision, takes an immutable content snapshot and renders that exact content. Escape all text in HTML. Guard AI output before presenting it; do not silently discard intentional user wording on PDF generation. Require the user to confirm they reviewed the draft for accuracy.

Finalization uses the job lease and a unique draft/revision reference so double clicks or network retries do not create duplicate versions. Save PDF, version and provenance in one transaction after rendering succeeds. Rendering failure leaves the draft editable and stores no partial version. The same unchanged draft revision returns its existing version; editing it enables another version. Editing and PDF rendering require no AI request and work even when an AI quota is exhausted. The existing immediate PDF endpoint remains only for reading historical outputs; no new-run bypass of review.

## 3. Archive and restore: 30 days

Add archived_at and purge_after to jobs; preserve the application's existing status and history. Archive is separate from rejected/skipped. It hides a job from active board/table, automatic checks, email-to-job matching and follow-up/ghost processing. Keep archived applications in historical application metrics until permanent deletion, so archiving alone does not change past performance.

An Archive tab lists jobs with their deletion date and Restore action. Archived detail pages allow viewing prior documents, restoring and permanent deletion, but no capture mutations, AI work, draft editing or finalization. Archive is blocked while live job work is running. Server actions recheck active/archive state inside claims and writes to prevent races with archive or purge.

Restore clears both timestamps and retains original status, notes, drafts, versions and provenance. Archive time resets only if a restored job is archived again. Exactly 30 × 24 hours after archival in UTC, restoration is rejected even if the worker has not run yet. Display the deletion deadline in the user's existing Jakarta date/time convention.

The worker purges expired archives each cycle, normally within ten minutes after the deadline and on its first cycle after downtime. Purge is idempotent, account-scoped, and covers inactive/revoked accounts as well as active accounts. A failed purge in one store does not stop others. No authentication identity or approval change is needed to inspect a store for maintenance.

Permanent deletion removes job content, notes, drafts, PDF versions and provenance, with existing foreign-key cascades. Retained local email records lose their job association; Gmail messages are never deleted. The existing Delete job action remains an immediate permanent option with confirmation. Usage accounting stays as non-content billing history, with no job foreign key or posting/CV text. Explain the 30-day policy before archive confirmation.

Deletion refers to removal from the live application database, not secure erasure of SQLite pages or external backups. Existing root-private backups follow a separately documented retention policy and are not rewritten by this feature. A restore of a deployment backup must run archive expiry cleanup before normal service resumes so expired jobs do not become accessible again.

## 4. Owner AI usage controls

All AI requests pass through the existing shared askJson boundary: CV parsing, extraction, match/scam checks, tailoring and Gmail classification. Capture the authenticated/worker account, operation category, provider/model and request start before contacting the provider. Add categories at existing call sites; users cannot submit a different account or bypass a limit.

Store usage and policies in the shared account registry, visible in detail only to the owner. Members see their own current usage, allowance and a helpful limit/pause message; they cannot inspect another user's usage or edit policy. Owner views aggregate by user, provider/model and calendar month. No prompt, CV, job description, email text, credential or raw upstream error belongs in usage rows.

Controls: global emergency AI pause, default monthly request allowance, per-account allowance override and per-account AI pause. Owner may set a period-specific higher allowance to unblock a user. Defaults preserve behavior: no cap and no pause until the owner configures them. Limits apply to owner calls too when a cap is explicitly set. Month boundaries use UTC and are labeled in the UI; display current period end.

An immediate registry transaction reserves one request against that account/month before network I/O. Count pending reservations as used to prevent concurrent web/worker overshoot. Requests rejected by policy or missing key before network dispatch do not consume allowance. Dispatched requests count even on provider error/refusal, timeout or malformed output because they may incur charges. Disable SDK automatic retries for these calls; an explicit retry creates a separately accounted request. Existing workflows retain stored inputs/results and surface a quota error rather than looping or discarding user work. Global/user pause and request limits are checked before each network dispatch, even within an existing multi-call workflow.

Record provider-reported token usage whenever a response exists, including rejected/malformed responses; distinguish normal input, cached input/cache writes and output where available. Missing telemetry is unknown, not zero. Persist completion and reservation state; stale reservations remain counted with unknown outcome after a crash. Never refund a possibly dispatched request automatically.

Owner-entered model pricing is optional and expressed in USD per million tokens, with appropriate cache categories. Snapshot rates on each request, preserving historical estimates after rate changes. Models without sufficient configured rates or telemetry show cost unavailable, with coverage counts; do not present a partial total as complete. Estimated cost is informational. The enforced spending control in this release is request allowance plus pause, not a guaranteed dollar ceiling. Provider invoices remain authoritative. No pricing API or hard-coded current model price is required.

## Data changes and compatibility

Add additive, transactional registry/private-store migrations with explicit user_version upgrades and rejection of future schemas. Existing v2 stores and output records must remain readable; legacy versions have no draft reference. Add indexed archive deadlines, structured draft revisions/finalization references, registry policy rows and immutable usage records. Keep keys server-only and avoid a new dependency unless existing tools cannot support a requirement.

Deployment stops both writers for a full private data/environment backup, builds before cutover and checks health afterward. Rollback restores compatible code/images and the complete matched data snapshot together. Preserve failed-new-data separately. Do not run old binaries against migrated stores. Do not delete any real archived jobs until archive lifecycle tests pass and the policy is deployed as described.

## Verification and acceptance

- Migration fixtures preserve accounts/sessions/Gmail tokens/settings/jobs/PDFs and initialize new tables exactly once.
- Capture: mobile viewport, blocked fetch, clipboard fallback, duplicate/archived duplicate, missing extraction fields, manual correction, input retention and clear Tailor reasons.
- Drafts: no PDF before review; escaped preview; save/conflict handling; source/provenance snapshots; edits used in rendered PDF; no duplicate finalization; render failure keeps draft; AI limit does not block manual save/PDF.
- Archive: exact deadline, restore, rearchive, inactive-account cleanup, downtime recovery, cascade deletion, metrics policy, mailbox retention and races with job work. Tests use fake clocks and disposable stores.
- Usage: both providers, every call category, concurrent reservations, policy changes between workflow calls, paused/limited accounts, provider failures/refusals/invalid output, unknown tokens/pricing, month rollover and role isolation. No live paid requests for automated verification.
- Full tests, lint/type checks, production Docker build and disposable authenticated mobile/browser flows pass. Live health and owner review after deployment; no real job deletion as a smoke test.

## Deferred

Phase 2 roadmap: import/export, tasks/reminders and recruiter/contact tracking. Also deferred: voice interviews, application autofill, automatic submission, browser extensions, dollar-hard-cap billing and billing/payment collection. This release introduces no new third-party account connection.
