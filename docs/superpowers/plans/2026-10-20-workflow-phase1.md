# Workflow Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve inline execution; no subagent dispatch.

**Goal:** Improve mobile capture, introduce reviewed editable drafts before PDF creation, archive/restore for 30 days, and enforce owner-managed AI request allowances.

**Architecture:** Extend existing account-private SQLite stores and shared registry with additive v3 migrations. Reuse server actions, per-job work leases, provider adapters and the ten-minute worker. Deliver four separately testable slices in this plan; keep shared lifecycle interfaces consistent across them.

**Tech Stack:** Next.js 16.4.2, React 19, TypeScript, better-sqlite3, Zod, Playwright, Vitest; existing dependencies only.

**Spec:** `docs/superpowers/specs/2026-10-20-workflow-phase1-design.md` (approved).

## Global Constraints

- Phase 2 is deferred: import/export, tasks/reminders and recruiter tracking.
- Exactly 30 × 24 hours after archival in UTC, restoration is rejected even if the worker has not run yet.
- The worker purges expired archives each cycle, normally within ten minutes after the deadline and on its first cycle after downtime.
- Defaults preserve behavior: no cap and no pause until the owner configures them.
- Editing and PDF rendering require no AI request and work even when an AI quota is exhausted.
- No live provider calls for automated verification; mock both SDKs and generate actual PDFs in a disposable container.
- Read relevant installed `node_modules/next/dist/docs/` guides before changing routes/actions/navigation. Preserve account isolation, existing artifacts, Google identity, secrets and shared AI/skill snapshots.
- New source validation limits: company/title 1–300 trimmed characters, location ≤500, description/captured text ≤200,000; user-edited draft text fields ≤20,000 each, ≤200,000 total serialized bytes. Reject oversized inputs server-side without losing saved content.

## Review Focus

1. Two tabs editing or finalizing the same draft: stale edits must not overwrite newer work or create duplicate versions (Tasks 3–4).
2. Job is archived or expires during a request: no late AI/write operation may resurrect it; expired documents must not leak before worker cleanup (Tasks 5–6).
3. Provider returns billable output that fails schema validation: record available usage and consume request allowance (Task 7).
4. AI allowance is reached halfway through extraction/checks/Gmail sync: retain useful data, stop further dispatch and expose the real policy error (Tasks 7–8).
5. Mobile blocked-fetch/duplicate flows with unsaved text: preserve input, offer the correct recovery and avoid overwriting manual edits (Tasks 1–2).

## Execution and baseline

- [ ] Read spec, this plan and applicable AGENTS.md; check clean Git status and the deployed/local commits. Keep deployment changes isolated from user work. Use a new `codex/workflow-phase1` branch from the current committed feature state, reusing the present checkout if clean.
- [ ] Run baseline `npm test`, `npm run lint`, `npx tsc --noEmit`; browser tests may require process/network permissions. Record failures explicitly. Create an ignored ledger under `.superpowers/sdd/2026-10-20-workflow-phase1/`.
- [ ] For each task: write the stated test, run it RED, implement, run GREEN, inspect diff and commit. Do not add unrelated refactors or fix dependency audit findings.

### Task 1: Editable job details and readiness

**Files:** modify `src/lib/jobs.ts`, `src/lib/types.ts`, `src/app/app/jobs/[id]/actions.ts`; create `src/lib/job-readiness.ts`, `tests/job-review.test.ts`.

**Interfaces:** `updateJobDetails(account,id,input:{company,title,location:string|null,description:string,expectedUpdatedAt:string}):void`; `getTailorReadiness(job,hasMasterCv):{ready:boolean;reason:string|null}`. Add `detailsEditedAt:string|null` to Job/private schema via additive v3 migration in `src/lib/db.ts`. Reuse `updated_at` for optimistic edits, not a second revision system.

- [ ] Write tests asserting missing title/company/CV and active processing return specific reasons; saving valid manual details clears extract_error, preserves salary/apply data and other accounts, and rejects stale/oversized input. Retry extraction requires explicit replace permission when detailsEditedAt exists; denied retry leaves raw text/manual details intact.
- [ ] Run `npm test -- tests/job-review.test.ts` and observe RED.
- [ ] Implement the interfaces, input schemas and server actions with current-session account, immediate transactions and archived-state checks once Task 5 lands. Manual detail confirmation requires description plus company/title. Set manual timestamp; prevent save/retry during live processing. Reuse guards in Tailor entry, not only the UI. Clear manual marker only on an explicitly accepted successful replacement.
- [ ] Run focused tests and existing `tests/jobs.test.ts`; commit `feat: add editable job details and tailoring readiness`.

### Task 2: Mobile capture and review UI

**Files:** modify `src/components/bookmarklet-capture.tsx`, `src/app/app/new/page.tsx`, `src/app/app/new/actions.ts`, `src/components/job-alerts.tsx`, `src/components/tailor-panel.tsx`, `src/app/app/jobs/[id]/page.tsx`; create `src/components/job-details-editor.tsx`, `tests/capture-review.test.ts`.

**Interfaces:** capture result remains a discriminated result; success navigation adds `?duplicate=1` only for existing jobs. Render Task 1 readiness and edit service. Archive-aware duplicate behavior is connected in Task 6.

- [ ] Write action tests for blocked fetch preserving form values, malformed/oversized inputs, duplicate existing jobs and replacement confirmation. Add disposable-browser assertions at 390px for paste instructions, missing-field recovery and no horizontal overflow.
- [ ] Run action tests RED; implement visible URL/paste guidance, extraction review fields, safe errors and focused description recovery. Preserve bookmarklet handshake/clipboard behavior. Avoid unreliable browser-site detection or claiming extraction succeeded with empty required fields.
- [ ] Run focused action/bookmarklet tests and browser check; commit `feat: improve mobile capture and job review`.

### Task 3: Persistent draft lifecycle without immediate PDF

**Files:** create `src/lib/tailor/drafts.ts`, `tests/tailor-drafts.test.ts`; modify `src/lib/tailor/tailor.ts`, `src/lib/db.ts`, `src/app/app/jobs/[id]/actions.ts` and existing tailoring tests.

**Interfaces:** `generateDraft(account,jobId,questions,expectedDraftRevision:number|null):Promise<Draft>`; `getDraft(account,jobId):Draft|null`; `saveDraft(account,jobId,expectedRevision,edit:DraftEdit):Draft`; `finalizeDraft(account,jobId,expectedRevision,edit:DraftEdit,reviewed:boolean):Promise<{version:number}>`. Draft includes id, revision, guarded CV, master snapshot, letter, answers, language and immutable generation setup. DraftEdit exposes summary, existing entry/bullet selection and wording, selected source skills, coverLetter and answers; no user-controlled master facts/provenance.

- [ ] Write tests: generate stores a draft but calls htmlToPdf zero times; guard invalid AI citations; failed replacement preserves prior draft; conflict on stale revision; prevent inserting foreign source IDs or modifying employers/dates; manual edits survive save; final PDF uses submitted saved content and pinned language/metadata after global/master changes. Test double-finalize and simulated PDF failure.
- [ ] Run draft tests RED.
- [ ] Add `tailor_drafts` (one per job, revision, validated JSON snapshot) and `tailored.draft_id/draft_revision` plus unique partial index; FK drafts→jobs CASCADE. A reference on tailored is an immutable identifier, not a cascade back to the editable draft. Use one private v3 migration assembled with Task 1/5 before deployment; no live partial migration rollout.
- [ ] Split existing guarded AI generation from rendering. Mutate draft rows with revision comparisons inside transactions. Generate/replace using a job lease and expected prior revision; never remove old draft before successful AI result. Finalize claims lease, validates reviewed flag, saves edits if changed and snapshots exact revision. Existing finalization for unchanged content returns its version without rendering; changed content increments revision. Render outside transaction, then atomically store version/PDF/provenance/finalization reference if lease and job state still valid. Failure keeps saved draft. Resolve identical retry content against current revision instead of creating another version; stale differing edits conflict. Keep legacy read/download APIs working.
- [ ] Run draft, guard, existing tailoring and account-isolation tests; commit `feat: persist reviewed application drafts before PDF export`.

### Task 4: Draft editor, comparison and PDF UI

**Files:** create `src/components/tailor-draft-editor.tsx`, `src/components/tailor-preview.tsx`; modify `src/components/tailor-panel.tsx`, `src/app/app/jobs/[id]/page.tsx`, `src/lib/tailor/cv-html.ts`; browser smoke script stored outside production image.

**Interfaces:** editor consumes Task 3 Draft and actions; no full editable HTML or live client credentials. Preview uses the same escaped CV renderer as PDF, isolated in a sandboxed iframe without scripts; letter/answers use plain text. Compare text to master snapshot by source IDs; mark new letter/answers as generated content, not master-backed differences.

- [ ] Write tests for escaping malicious text, invalid source selection and cross-account actions; browser checks edit/save/stale conflict, unchanged retry, review confirmation, navigation warning for unsaved edits and mobile preview. Include no AI call on save/finalize and prior version download unchanged.
- [ ] Implement Generate draft, replacement confirmation, explicit Save draft, review checkbox and Generate PDF. Use a compact disclosure per section on phones. Preserve editable input on errors; reset review acknowledgement after content changes. Warn on browser unload and app-controlled navigation, including a persistent unsaved indicator. Display AI/manual edits without promising factual verification.
- [ ] Run browser checks in disposable Docker with stub AI and real Chromium; commit `feat: add application draft review and PDF preview`.

### Task 5: Archive lifecycle, expiry and cleanup

**Files:** create `src/lib/archive.ts`, `tests/archive.test.ts`; modify `src/lib/db.ts`, `src/lib/types.ts`, `src/lib/jobs.ts`, `src/lib/accounts.ts`, `src/worker/cycle.ts`, `src/lib/ghost.ts`, `src/lib/email/sync.ts`, `src/lib/check/run.ts`, `src/lib/tailor/drafts.ts`.

**Interfaces:** `archiveJob(account,id,now?:Date):void`; `restoreJob(account,id,now?:Date):void`; `purgeExpiredJobs(account,now?:Date):number`; `listMaintenanceAccounts():Account[]` internal registry helper includes revoked members. Jobs add archivedAt/purgeAfter nullable timestamps. `listJobs` keeps all records by default for historical metrics; call sites explicitly request active/archived visibility. Shared `requireActiveJob(account,id)` and `isExpired(job,now?)` enforce lifecycle everywhere.

- [ ] Tests with fake clocks assert deadline exactly 30*24*60*60*1000, restore at deadline rejected, rearchive resets deadline, purge removes jobs/drafts/outputs/events but keeps email record and usage, isolation and revoked-account purge. Test archive during live work rejected; archive/restore/delete races under immediate transactions. Historical metrics unchanged on archive, updated on purge.
- [ ] Run archive tests RED; implement indexed archived_at/purge_after in private v3 migration. Replace active-work claims and job mutations with shared state checks. Background completions condition writes on lease/state; archived jobs excluded from matching/checks/ghosting. Purge rechecks expiry atomically. Run cleanup for all maintenance accounts before active-account sync; isolate each failure.
- [ ] Test worker recovery after downtime and a revoked account, plus existing email/ghost/metrics suites; commit `feat: archive jobs with 30-day restore and expiry cleanup`.

### Task 6: Archive UI, duplicate restoration and access policy

**Files:** modify `src/app/app/jobs/page.tsx`, `src/app/app/jobs/[id]/page.tsx`, `src/app/app/jobs/[id]/actions.ts`, `src/components/apply-bar.tsx`, `src/app/app/new/actions.ts`, `src/app/api/jobs/[id]/cv/[version]/route.ts`, `src/lib/jobs.ts`; create `tests/archive-routes.test.ts`.

**Interfaces:** add current-session archive/restore actions; Active/Archive view selected by validated `archived=1`. Download/detail/draft endpoints reject expired jobs even before cleanup; non-expired archived outputs remain readable to their account.

- [ ] Tests assert expired PDF/detail cannot be read, archived mutations/AI/finalization blocked, duplicate archived URL prompts restore, expired duplicate purges safely then permits fresh capture, and manual permanent deletion works in archive. For non-expired duplicate preserve captured input until the user confirms restore; never auto-restore.
- [ ] Implement Archive confirmation with exact deletion date, deadline on archived cards/details, Restore and existing permanent Delete actions; hide active-only controls. Restore original status; stale Restore reports expiry. Preserve active board/table filters and historical analytics policy.
- [ ] Run route/lifecycle tests and disposable mobile archive→restore→archive→clock-expiry flows; commit `feat: expose archive and restore with expiry-aware access`.

### Task 7: Shared AI accounting and enforceable request policies

**Files:** create `src/lib/ai-usage.ts`, `tests/ai-usage.test.ts`; modify `src/lib/accounts.ts`, `src/lib/ai.ts`, `src/lib/ai/types.ts`, `src/lib/ai/anthropic.ts`, `src/lib/ai/openai.ts` and all AI callers: `src/lib/cv/parse.ts`, `src/lib/capture/extract.ts`, `src/lib/check/run.ts`, `src/lib/email/classify.ts`, `src/lib/tailor/drafts.ts`.

**Interfaces:** add mandatory AiRequest.operation enum `cv_parse|extract|match|scam|email_classify|tailor`; `reserveAiRequest(account,selection,operation):Reservation`; `markDispatched(id):void`; `finishAiRequest(id,outcome,usage?:TokenUsage):void`; owner services `saveUsagePolicy(actor,input,expectedRevision)` and `saveModelPricing(actor,input,expectedRevision)`; `getUsageSummary(actor,accountId?,month?):UsageSummary`. TokenUsage has nonnegative normalInput/cachedInput/cacheWrite/output nullable counts; represent missing fields as unknown, avoid cached/input double counting.

- [ ] Tests RED for concurrent allowance reservations across DB connections, global/user pauses, inactive account, month UTC rollover, per-month override, owner/member access, invalid rates/limits, missing-key non-consumption, timeout consumed reservation, cached token normalization and unknown telemetry. Mock malformed/refusal output with usage and assert it is recorded. Verify no prompt/content is stored.
- [ ] Registry v3 migration adds default/account/month-override policies with revisions, pricing per provider/model and append-only usage/reservation records. Request allowance counts reserved/dispatched/completed/unknown outcomes; only proven pre-dispatch cancellation releases one. Use immediate transactions for policy/reservation read-modify-write; recheck account/pauses immediately before dispatch. Bound limits to safe nonnegative integers; zero blocks requests; null means unlimited.
- [ ] Extend adapters with usage observer callbacks invoked as soon as a provider response exists, before refusal/schema validation. Construct provider clients with maxRetries:0, including injected-client request options in tests. Finish accounting on success/failure without leaking raw SDK errors. Adapter error on missing response retains unknown usage. If ledger persistence fails after dispatch, do not retry the provider or release allowance; keep counted reservation and return a safe error.
- [ ] Snapshot configured USD-per-million category rates in reservations, compute costs from known nonoverlapping tokens; pricing/telemetry gaps return unavailable plus coverage counts, never false zero. Never silently rewrite old estimates. Preserve original askJson return payload shape and safe errors; new policy errors get explicit code/messages.
- [ ] Add operation at every caller, update SDK mocks, tests for quota reached between extraction/checks and Gmail classification: stored extraction/emails remain, sync leases clear, policy failure does not trigger repeated processing of the same batch in one cycle. Test owner settings changed between calls; limit checked each time.
- [ ] Run all adapter/snapshot/sync/usage tests and `npx tsc --noEmit`; commit `feat: account for shared AI usage and enforce request limits`.

### Task 8: Owner usage UI, migration verification and release

**Files:** create `src/app/app/settings/usage-card.tsx`, `src/app/app/settings/usage-actions.ts`, `tests/usage-admin.test.ts`, `tests/workflow-migration.test.ts`; modify `src/app/app/settings/page.tsx`, `src/app/app/new/actions.ts`, `README.md` and quota/error displays in capture/CV/tailor/check flows.

**Interfaces:** Settings owner card shows global pause, default/user/month allowance, usage by account/provider/model/month, unknown outcomes and cost coverage; member card shows own usage/remaining allowance/period end. Pricing form requires owner validation and revision checks. Errors identify limit/pause distinctly from provider failures.

- [ ] Tests RED for member-forged policy/pricing changes, another user's usage reads, stale settings, zero/unlimited quotas and unknown price display. Migrate copies of v2 fixtures; verify exact account/session/CV/Gmail/settings/PDF preservation and v3 idempotency. Confirm historical PDFs without draft IDs still download and future-schema rejection remains.
- [ ] Implement controls and member summary without exposing instruction bodies/other users' content. Estimate costs labeled USD; no dollar hard-cap claim. Preserve user input/results when a workflow hits quota. Document each counted upstream attempt, cache-rate gaps, UTC reset, 30-day policy, expiry cleanup after backup restore and coordinated rollback.
- [ ] Run full `npm test`, `npm run lint`, `npx tsc --noEmit`, default production Docker build/npm ci. Review full diff against spec, including new migration FK indexes and all listJobs callers. No real AI requests.
- [ ] Run authenticated disposable-container browser smoke: mobile blocked capture/manual correction→draft→edit/save→PDF, double-submit, owner/member isolation, archive/restore/expiry, owner quota and member failure recovery. Inspect mobile layout and valid generated PDF. No real user data in smoke fixtures.
- [ ] Commit `feat: add owner AI usage controls and workflow release checks`; push approved release branch to origin. Before deployment verify server clean/current state, no active work, build separate release image, stop writers and back up complete data/env. Retain previous images and paired rollback. Purge expired archives before reopening service after any restored backup. Poll health and worker; retain failed-new-data on rollback.
- [ ] Verify public health, current release and worker cycle. Request owner UI confirmation. Record commands/results, backup path, caveats, unchanged secrets and actual deployment state in ignored report. Do not archive/delete real jobs as verification. Phase 2 stays unimplemented.

## Handoff

Plan reviewed against approved spec: lifecycle deadlines, draft idempotency, quota accounting, migration/rollback, mobile recovery and account isolation assigned to tasks above. Proposed implementation order is 1→8. Inline execution is preserved from prior releases. Application code is unchanged while this plan awaits review.

## Implementation record — 2026-10-20

Tasks 1–8 implemented inline and independently reviewed. Final checks: 226 tests across 53 files, lint and TypeScript pass; server production Docker build/npm ci and disposable authenticated mobile/browser/PDF flows pass. The reviewer’s two lifecycle findings were reproduced with failing tests and fixed. Mobile field availability and stacked labels were corrected after browser verification. Live source release 52c381b is healthy; all three account worker cycles succeeded and backup comparisons confirm existing data, settings and secrets unchanged. Backup: /root/jobtracker-backups/20261020T035108Z-workflow-phase1. Subsequent changes in this commit are regression tests and this record only. Phase 2 remains deferred; owner UI confirmation requested asynchronously.
