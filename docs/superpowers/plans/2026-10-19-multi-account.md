# Multi-account JobTracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution recommendation: implement inline in this chat; do not dispatch task implementers unless the owner chooses delegation.

**Goal:** Approved Google accounts use one JobTracker site with separate private data and no per-user OAuth setup.

**Architecture:** Reuse the existing Google OAuth client for OpenID Connect login and optional Gmail consent. A SQLite registry holds approved accounts, opaque sessions and expiring OAuth transactions; every data service receives an explicit account and selects that account's separate SQLite file. Preserve the owner's current database and encryption key.

**Tech Stack:** Next.js 16.4.2, TypeScript, better-sqlite3 13.0.3, google-auth-library 11.3.1, existing Tailwind/shadcn UI, Vitest 5, Playwright 1.64.1 Docker image.

**Spec:** `docs/superpowers/specs/2026-10-19-multi-account-design.md` (approved 2026-10-19).

## Global Constraints

- Owner is `owner@example.com`; configure `OWNER_GOOGLE_EMAIL=owner@example.com` explicitly. Never give existing data to the first visitor.
- Phase 1 continues to never send emails or submit applications. Keep `DRY_RUN=true`.
- DB_PATH continues to identify the existing owner's database. APP_SECRET must stay unchanged so the current Gmail token remains decryptable.
- No global mutable current-user variable or fallback from missing account context to owner data.
- All protected pages, route handlers and server actions authenticate themselves; proxy is convenience only.
- Members use the shared server Anthropic key. No user billing or user-supplied API keys in this change.
- Basic sign-in scopes are `openid`, `email`, `profile`; Gmail consent remains optional and separate.
- Preserve `/api/gmail/callback` and Gmail scopes `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`.
- Keep `jt_session`, HttpOnly/Secure in production, SameSite=Lax and a 30-day session lifetime.
- Public home and `/api/public/stats` expose only owner's opt-in aggregates, never member data.
- Retain Naspad Navy `#272660`, Sky Blue `#49BCE9`, Montserrat and existing Tailwind/shadcn components; no new UI kit or identity provider.
- AI/Chromium work initiated by a UI request remains unawaited; capture explicit account identity before scheduling. Never send test data to live Google/Claude APIs.
- Read the relevant installed Next.js guides in `node_modules/next/dist/docs/` before changing routes, cookies, server actions or proxy.

## Review Focus

1. Two accounts with the same numeric job ID and identical URL must never read or change one another's CV, email, settings or PDFs (Tasks 2–3).
2. Parallel browser requests and delayed AI completions must retain the original account instead of whichever account logged in most recently (Tasks 2–3).
3. Changed Google email with an already-bound subject, or recycled approved email with a different subject, must not silently grant an account or owner role (Tasks 1 and 4).
4. Revoking an account must invalidate existing sessions immediately and prevent a queued worker from starting new work for it (Tasks 4, 6 and 7).
5. Gmail callback from an old/different login session and repeated callbacks must fail before tokens are exchanged or overwritten (Task 5).

## File map

- New `src/lib/accounts.ts`: registry schema/bootstrap, verified identity lookup, approvals/revocation, active account enumeration and server-controlled data paths.
- New `src/lib/sessions.ts`: random sessions, hashed persistence and expiry/revocation lookup.
- New `src/lib/google-login.ts`: OIDC URL, PKCE/nonce/state lifecycle, Google token verification and safe identity projection.
- New `src/lib/oauth-state.ts`: expiring single-use state transactions for sign-in and Gmail, with purpose and session/account binding.
- Modify `src/lib/db.ts`: explicit account database routing and per-account connection cache; keep openDb for schema initialization/tests.
- Modify data services under `src/lib`: account argument propagation; no changes to pure classifiers, CV rendering, guard, URL parsing, salary/scam rules or PDF renderer unless a test demonstrates necessity.
- Modify `src/lib/auth.ts`, `src/proxy.ts`, `/login`, all protected pages/actions/routes, public pages/API and health route.
- New `/api/auth/google/route.ts`, `/api/auth/google/callback/route.ts` and owner account management card/actions under settings.
- Modify Gmail routes/helper/card, worker, README, `.env.example`; remove password hashing CLI/package script when password auth is removed.
- New focused tests plus `tests/helpers/accounts.ts`; adapt existing tests requiring private storage/account settings.

### Task 1: Registry and isolated account storage

**Files:** Create `src/lib/accounts.ts`, `tests/accounts.test.ts`, `tests/helpers/accounts.ts`; modify `src/lib/db.ts`, `tests/db.test.ts`, `.env.example`.

**Interfaces:**
- `Account = { id: number; email: string; role: "owner" | "member" }` (only active registry records become Account values).
- `getOwnerAccount(): Account`, `getActiveAccount(id: number): Account | null`, `listActiveAccounts(): Account[]`.
- `listAccounts(): { id: number; email: string; role: Account["role"]; active: boolean; claimed: boolean }[]` (owner callers only at action boundary).
- `approveEmail(email: string): void`, `revokeAccount(id: number): void` (owner self-revocation rejected).
- `claimGoogleAccount(identity: { sub: string; email: string; emailVerified: boolean }): Account` rejects unapproved/unverified/mismatched subject/email; binds approved email exactly once.
- `accountDbPath(account: Account): string` resolves current registry record; never trusts passed role/email for path selection. Owner maps to DB_PATH; members map to sibling `users/<id>.db`.
- `getAccountDb(account: Account): Database.Database`, `resetDb(): void` closes all cached data handles; `resetAccounts(): void` closes registry handle for tests.
- Test helper `createAccountFixture(): { owner: Account; member: Account; cleanup(): void }` uses unique temporary paths and explicit OWNER_GOOGLE_EMAIL; never uses production data.

- [ ] **Step 1:** Write tests: bootstrap twice yields one owner; owner data file remains unchanged; unapproved first Google user cannot claim owner; same subject/recycled-email mismatches reject; approved unclaimed member has no data file; two claimed members get distinct paths; forged role/invalid/missing ID cannot select owner; owner self-revocation rejects. Assert credentials/subjects are absent from listAccounts output.
- [ ] **Step 2:** Run `npm test -- tests/accounts.test.ts tests/db.test.ts`; watch new tests fail because account interfaces are absent.
- [ ] **Step 3:** Implement registry next to DB_PATH as `accounts.db`, WAL/busy timeout, versioned schema. Store unique normalized email and unique nullable Google subject. Bootstrap owner transactionally; refuse missing/invalid OWNER_GOOGLE_EMAIL and owner-env changes inconsistent with an existing owner. No legacy-data copying or APP_SECRET rotation. Add getAccountDb alongside legacy getDb temporarily for the following migration tasks.
- [ ] **Step 4:** Run the focused tests; require all pass and original database schema tests remain green.
- [ ] **Step 5:** Commit `feat: add account registry and isolated storage`.

### Task 2: Explicit account context through data and AI services

**Files:** Modify `src/lib/settings.ts`, `src/lib/jobs.ts`, `src/lib/ai.ts`, `src/lib/cv/parse.ts`, `src/lib/capture/extract.ts`, `src/lib/check/run.ts`, `src/lib/tailor/tailor.ts`, `src/lib/metrics.ts`, `src/lib/ghost.ts`, `src/lib/email/classify.ts`, `src/lib/email/gmail.ts`, `src/lib/email/sync.ts`; corresponding tests; create `tests/account-isolation.test.ts`.

**Interfaces:** All existing exports that access account data gain a mandatory first `account: Account` parameter; remaining parameters and return types stay unchanged. Specifically:
- settings: `getKv<T>(account,key)`, `setKv(account,key,value)`, `getSettings(account)`, `saveSettings(account,patch)`.
- jobs: `getJob`, `listJobs`, `addEvent`, `listEvents`, `addNote`, `startJobWork`, `retryExtraction`, `captureJob`, `setStatus`, `markRepliedElsewhere`.
- AI/CV: `askJson<T>(account,opts,client?)`, `extractJob(account,text,url)`, `parseCv`, `getMasterCv`, `saveMasterCv`, `getCvParseState`, `clearCvParseState`, `startCvParse`.
- checks/tailoring: `runChecks`, `tailorJob`, `getTailored`, `getTailoredPdf`.
- metrics/ghost: `computeMetrics`, `runGhostDetection`, `clearFollowUp`.
- email: `classifyEmail`, `exchangeCode`, `listMessages`, `linkEmail`, `isSyncing`, `syncInbox`.
- Pure functions (`isBusy`, `keywordClassify`, `originalSender`, `matchJob`, renderers, guards, salary rules and htmlToPdf) keep their signatures.

- [ ] **Step 1:** Write isolation tests: same URL yields independent job ID 1; distinct CV/settings/models/tokens/PDFs/emails remain separate; unknown local IDs fail. Use deferred mocked askJson results to complete two users' capture/CV/tailor work in reverse order and assert results land in the correct database. Verify member data does not alter owner metrics.
- [ ] **Step 2:** Run `npm test -- tests/account-isolation.test.ts`; require failing isolation assertions before migration.
- [ ] **Step 3:** Replace service access with getAccountDb(account), thread account through every nested call and delayed closure, and update fixture-based tests. Replace sync's single inflight value with account-keyed promises; account A must not reuse account B's sync promise. Use per-account DB conditional markers/leases to exclude worker/manual sync overlap across processes; clear only the marker owned by that run. Check active registry status before starting new expensive background work; already-running work may finish in its original database.
- [ ] **Step 4:** Run focused isolation tests and all affected service tests; verify no real API calls. Search every data-service caller; compile-time errors in page/action callers are resolved in Task 3 before merging/deployment.
- [ ] **Step 5:** Commit `refactor: pass account context through private services`.

### Task 3: Bind all application entry points and public data

**Files:** Modify `src/lib/auth.ts`, `src/app/app/{page,layout}.tsx`, `src/app/app/jobs/page.tsx`, `src/app/app/jobs/[id]/{page.tsx,actions.ts}`, `src/app/app/new/{page.tsx,actions.ts}`, `src/app/app/inbox/{page.tsx,actions.ts}`, `src/app/app/settings/{page.tsx,actions.ts}`, `src/app/api/jobs/[id]/cv/[version]/route.ts`, Gmail routes, `src/app/page.tsx`, `src/app/api/public/stats/route.ts`, `src/app/api/health/route.ts`, `src/lib/db.ts`, `tests/smoke.test.ts`; create `tests/account-routes.test.ts`.

**Interfaces:** `requireSession(): Promise<Account>` is the only page/action identity source. During this task only, legacy password login maps explicitly to getOwnerAccount; Task 4 replaces this bridge with registry sessions. Action helpers become `guarded(fn: (account: Account) => T | Promise<T>)` / `run(fn: (account: Account) => unknown)` so callbacks cannot omit context.

- [ ] **Step 1:** Write tests with mocked authenticated owner/member identities: direct settings/job actions and PDF route use caller's database even when supplied another user's job ID; anonymous actions redirect; public stats exclude members; health succeeds without a session; member-submitted publicPageEnabled=true is ignored/rejected and cannot change owner visibility.
- [ ] **Step 2:** Run `npm test -- tests/account-routes.test.ts tests/smoke.test.ts`; require relevant failures.
- [ ] **Step 3:** Capture returned account in every authenticated entry point, pass it to all service/direct SQL calls, and capture it in non-awaited work. Public entry points explicitly use getOwnerAccount. Hide member public-page control and enforce owner-only updates server-side. Health opens registry and owner DB. Remove legacy zero-argument getDb export and update remaining tests/callers: omission must be a compile error, not owner fallback. Keep revalidation paths and existing polling behavior.
- [ ] **Step 4:** Run focused route/smoke tests and `npx tsc --noEmit`. Search `getDb(`, `getAccountDb(`, `requireSession(` and every account-sensitive service call to verify no unscoped storage accesses remain.
- [ ] **Step 5:** Commit `feat: isolate private routes and owner public metrics`.

### Task 4: Google sign-in and revocable application sessions

**Files:** Create `src/lib/sessions.ts`, `src/lib/oauth-state.ts`, `src/lib/google-login.ts`, `src/app/api/auth/google/route.ts`, `src/app/api/auth/google/callback/route.ts`, `tests/google-login.test.ts`, `tests/sessions.test.ts`; modify `src/lib/accounts.ts`, `src/lib/auth.ts`, `src/proxy.ts`, `src/app/login/{page.tsx,actions.ts}`, `tests/auth.test.ts`, `package.json`, `package-lock.json`; remove `scripts/hash-password.ts`.

**Interfaces:**
- `createSession(account: Account, now?: number): string`, `lookupSession(token: string | undefined, now?: number): Account | null`, `revokeSession(token: string | undefined): void`.
- `createOAuthState(input: { purpose: "signin" | "gmail"; accountId?: number; sessionToken?: string; next?: string }): { state: string; cookie: string; nonce: string; verifier: string }`.
- `consumeOAuthState(state: string, cookie: string | undefined, expected: { purpose: "signin" | "gmail"; accountId?: number; sessionToken?: string }): { nonce: string; verifier: string; next: string }` throws for expired/reused/mismatched input.
- `beginGoogleLogin(next: string): Promise<{ url: string; cookie: string }>`; `completeGoogleLogin(code: string, state: string, cookie: string | undefined): Promise<{ account: Account; next: string }>`.
- `requireSession(): Promise<Account>` now consults hashed registry session and active state; password tokens are invalid. Preserve safeNext; logout revokes current session then clears cookie.

- [ ] **Step 1:** Write mocked Google tests for verified approved login, denied/unapproved email, owner-claim invariant, wrong audience/issuer/expiry/nonce, missing subject/email, canceled consent, bad state, missing PKCE verifier and replayed callback. Write session tests for 32 random bytes/base64url tokens, SHA-256-only persistence, expiry, logout, revoke, malformed/legacy tokens and role lookup from registry rather than cookie claims.
- [ ] **Step 2:** Run `npm test -- tests/google-login.test.ts tests/sessions.test.ts tests/auth.test.ts`; confirm new cases fail.
- [ ] **Step 3:** Implement Google auth-code flow with S256 PKCE via installed Google library. Store state-cookie payload encrypted with existing crypto and explicit purpose/10-minute expiry; store state hashes in registry and atomically consume once. Bind nonce to verified ID token, verify issuer/audience/expiry/email_verified and stable subject before account claim. Store only session token hashes in registry; active account check on each request. Do not log codes, tokens, cookie payloads or SDK error objects. Callback clears state cookie on success/failure and redirects only to safe local /app paths. Rotate/revoke old session at successful login.
- [ ] **Step 4:** Replace password form with existing-brand Sign in with Google button and concise generic denial/error copy. Proxy checks cookie presence only and imports no SQLite/Google modules. Remove password login/hash CLI and setup script entry; update lock metadata without dependency churn. Preserve logout callers. Run focused tests plus `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat: sign in approved accounts with Google`.

### Task 5: Bind Gmail consent to account and session

**Files:** Modify `src/app/api/gmail/{connect,callback}/route.ts`, `src/lib/email/gmail.ts`, `src/app/app/settings/gmail-card.tsx`, settings page/actions; create `tests/gmail-account-callback.test.ts`; modify `tests/email-gmail.test.ts`.

**Interfaces:** Reuse Task 4 OAuth state with purpose gmail, authenticated account ID and current application session hash. `exchangeCode(account,code,verifier): Promise<void>` exchanges with PKCE, validates required granted scopes, fetches Gmail users.getProfile and stores gmailAddress alongside encrypted gmailToken in that account. `disconnectGmail(account): Promise<void>` removes local token/address/cursors/error state and attempts upstream token revocation without blocking local disconnect if Google is unavailable.

- [ ] **Step 1:** Test session/account switching between connect and callback, purpose confusion, expired state, replay, denied/missing Gmail scopes, refresh-token absence, profile-fetch failure and concurrent callbacks for two accounts. Assert invalid state is rejected before getToken and cannot overwrite any token. Test connected mailbox display and disconnect isolation.
- [ ] **Step 2:** Run `npm test -- tests/gmail-account-callback.test.ts tests/email-gmail.test.ts`; confirm failure.
- [ ] **Step 3:** Implement account/session-bound one-use state and PKCE, preserve exact Gmail scopes and callback URI, and display selected Gmail address in that account's settings. Commit refresh token and mailbox metadata together only after successful scope/profile validation. Keep existing owner token when exchange fails. Existing migrated token may lazily fetch its mailbox metadata on successful sync without forcing reconnection. Add authenticated disconnect action; no Google credentials requested from members.
- [ ] **Step 4:** Run focused callback/Gmail/sync tests and confirm phase 1 still contains no messages.send call.
- [ ] **Step 5:** Commit `feat: isolate Gmail connections by account and session`.

### Task 6: Owner approval management

**Files:** Create `src/app/app/settings/accounts-card.tsx`, `src/app/app/settings/account-actions.ts`, `tests/account-admin.test.ts`; modify settings page and existing sidebar/layout identity display if needed.

**Interfaces:** `approveAccountAction(email: string): Promise<{ok:true}|{ok:false;error:string}>`, `revokeAccountAction(id: number): Promise<{ok:true}|{ok:false;error:string}>`. Each calls requireSession, requires owner role, validates input server-side and revalidates Settings. Only owner renders accounts list/card. Reapproval reactivates the same account/subject/data, never reassigns the identity or revives revoked sessions.

- [ ] **Step 1:** Test owner approval, duplicate/case-normalized approval, invalid email, member/direct-post denial, self-revoke denial, active member revocation invalidating sessions, and reapproval requiring a fresh login while preserving data/subject binding.
- [ ] **Step 2:** Run `npm test -- tests/account-admin.test.ts`; confirm failure.
- [ ] **Step 3:** Build a small existing-component card listing email, claimed/approved state and revoke control; add approval input and clear results. Show current signed-in account and keep logout available. No mail-sending invitations or private account contents in list output. Implement actions and ensure revoked account cannot start new actions immediately.
- [ ] **Step 4:** Run focused admin/route/session tests; inspect owner/member layouts at mobile and desktop widths when local mock sessions are available.
- [ ] **Step 5:** Commit `feat: let owner approve and revoke accounts`.

### Task 7: Worker lifecycle across accounts

**Files:** Create `src/worker/cycle.ts`, `tests/worker-accounts.test.ts`; modify `src/worker/index.ts`, sync/ghost helpers only if needed for active checks.

**Interfaces:** `runAccountCycle(): Promise<void>` enumerates listActiveAccounts, rechecks getActiveAccount immediately before each account's work, runs syncInbox(account) and runGhostDetection(account) independently and sequentially. Existing index owns timer/signals and invokes runAccountCycle.

- [ ] **Step 1:** Test active owner/member processing, unclaimed approved member without a data file not being processed, revoked-between-enumeration-and-execution member being skipped, independent sync/ghost failures, and no account/token/error-object leakage in logs. Assert one account failure never skips the next and cycles never overlap.
- [ ] **Step 2:** Run `npm test -- tests/worker-accounts.test.ts tests/email-sync.test.ts tests/ghost.test.ts`; confirm new worker failures.
- [ ] **Step 3:** Implement sequential account cycle, preserving immediate first cycle, ten-minute scheduling after completion and ten-second graceful shutdown. Include claimed members plus the explicitly provisioned owner (so existing owner Gmail sync can continue before first Google sign-in). Use account IDs in logs, never CV/mail contents or credentials.
- [ ] **Step 4:** Run focused worker/sync tests and verify a member's stale sync marker does not pause the owner.
- [ ] **Step 5:** Commit `feat: run background worker for active accounts`.

### Task 8: Full verification and operator instructions

**Files:** Modify `README.md`, `.env.example`, `tests/smoke.test.ts`; create `tests/multi-account-migration.test.ts`; maintain implementation ledger in `.superpowers/sdd/2026-10-19-multi-account/`.

- [ ] **Step 1:** Write migration integration tests using real temp SQLite files: seed owner CV/job/token/settings with current schema, bootstrap/claim owner, add member, restart registry/DB handles and assert owner data/token decryptability and member separation persist. Assert owner's original file remains usable by pre-change schema and bootstrap cannot accidentally open member files as owner.
- [ ] **Step 2:** Run the migration tests, implement only missing migration behavior, and require pass.
- [ ] **Step 3:** Document owner env, one shared OAuth client, new exact sign-in redirect URIs, Gmail consent versus login, approval/revoke flow, shared AI costs, consistent backup of the entire data directory and preserved APP_SECRET. Remove password-login instructions and clarify Gmail publishing versus verification. Explain that adding the new callback URI requires owner action in Google Cloud; never imply members need OAuth projects.
- [ ] **Step 4:** Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` and `docker compose build` with no real .env. If local Turbopack port restrictions recur, record them and verify default build in Docker plus local webpack fallback. Fix introduced failures; document pre-existing unrelated failures with exact evidence.
- [ ] **Step 5:** Smoke Docker with throwaway account registry/env/data and mocked identity provider: health, owner/member routes, worker cycles, PDF rendering. Do not call Google or Claude for automated tests. Shut down scratch containers and self-review full diff against the spec.
- [ ] **Step 6:** Commit `docs: document multi-account setup and migration` and write verification report with test counts, commands, outputs and remaining Google Cloud/owner-login steps.

### Task 9: Production rollout with consistent backup

**Files:** Server `/srv/jobtracker`, protected backup outside deployment tree; local ignored deployment report. No credentials in committed files.

- [ ] **Step 1:** Confirm the Google client contains the new production sign-in callback `https://tracking.naspadstudio.id/api/auth/google/callback`. If Cloud Console access is unavailable, request this exact owner action while completing all local verification; do not replace working production password login before sign-in can complete.
- [ ] **Step 2:** Build production image on naspad-server from the verified commit before downtime. Record prior image IDs, compose settings and commit. Preserve active credentials, especially APP_SECRET.
- [ ] **Step 3:** Stop web/worker, back up the entire data directory and .env to a timestamped root-only location, verify backup success, set OWNER_GOOGLE_EMAIL and retain existing keys, then start new images. Do not delete/overwrite old data or initial backups. No Git push unless authorized separately.
- [ ] **Step 4:** Check local/public health, web healthy, worker account cycle and real Chromium PDF. Owner signs in with owner@example.com; verify their existing CV/jobs/settings/Gmail status. Create a test approved member only with owner's chosen email, validate separation, and revoke test access if appropriate. Do not read/display real CV/email contents in logs.
- [ ] **Step 5:** If owner Google login fails, keep public sign-in out of service and restore prior images/env from the protected backup; do not leave the owner locked out. Preserve registry/member data for diagnosis/recovery. Report which check failed without exposing tokens.
- [ ] **Step 6:** Record deployed commit, backup location, login result and known limitations. Provide the working sign-in URL and owner account-management instructions.

## Plan self-review

All spec sections map to Tasks 1–9. The file split preserves one responsibility per auth/registry/helper. Data-service signature migration is explicit and checked by type errors plus caller inventory. All five Review Focus conditions have regression tests. No cross-user fallback, dependency additions, public member profiles, billing or phase-2 sending is planned. Runtime tests use fake provider identities; only the owner's interactive deployment check uses real Google consent.

## Execution handoff

The design is approved; this implementation plan awaits owner review. Recommend inline execution in this chat because the interface migration is tightly coupled and the existing working contract favors self-review. Implementers must keep a per-task ledger and run focused tests while iterating, then the full suite once before completion. No production cutover until the new Google callback is registered and rollback is ready.
