# JobTracker Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-hosted, single-user job tracker: paste a job link → extract → check (match, salary, scam) → tailor CV/cover letter/answers → mark applied → statuses update from Gmail and ghost detection → public per-site results page.

**Architecture:** One Next.js 16 app (UI + server actions + a few route handlers) and one worker process (same codebase, run with `tsx`) sharing a SQLite file on a Docker volume. Claude does extraction, matching, scam review, tailoring, CV parsing and ambiguous email classification through one `askJson` helper with Zod structured outputs. Pure logic (salary, scam rules, URL canonicalisation, email matching/classification, ghosting, metrics) lives in small testable modules.

**Tech Stack:** Next.js 16.4 (App Router), React 19.3, TypeScript (strict), Tailwind CSS 4.3, shadcn/ui (CLI 4.22), better-sqlite3 13, zod 4, @anthropic-ai/sdk 0.135, @googleapis/gmail 22 + google-auth-library 11, cheerio 1.2, playwright-core 1.64.1, tsx, vitest 5. Docker base `mcr.microsoft.com/playwright:v1.64.1-noble`.

**Spec:** `docs/superpowers/specs/2026-10-19-jobtracker-design.md` (read it before Task 1).

## Global Constraints

- Phase 1 **never sends email and never submits an application**. No code calls `gmail.users.messages.send` in this phase. `DRY_RUN` env var exists (default `true`) for phase 2.
- Secrets only from env: `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_PASSWORD_HASH`, `APP_SECRET`, plus `APP_URL` (`https://tracking.naspadstudio.id`), `DB_PATH` (default `./data/jobtracker.db`), `DRY_RUN`, `TZ=Asia/Jakarta`.
- Brand: Naspad Navy `#272660` (primary, dominant), Sky Blue `#49BCE9` (accent), Pure White `#FFFFFF`, Black `#000000`. Font Montserrat 300/500/600/700 via `next/font/google`, fallback system sans-serif. Light + dark via `prefers-color-scheme` (no theme toggle, no next-themes).
- UI built from Tailwind + shadcn/ui components only; no other UI kit, no chart library, no drag-and-drop library.
- Claude: default model `claude-opus-5-5`, read from settings `aiModel`. All calls go through `askJson` (Task 4). Tests **never** hit the real API — mock `@/lib/ai`.
- Gmail OAuth scopes exactly `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`; redirect URI `${APP_URL}/api/gmail/callback`; `access_type=offline`, `prompt=consent`.
- Tailored content may only rephrase/select master-CV content; company, title and dates always come from the master CV (Task 7 guard).
- Public endpoints/pages return aggregates only — never company, title, salary, email, CV or URL data.
- Every server action and route under `/app` and `/api` (except `/api/public/*`, `/api/health`) calls `requireSession()` itself; the proxy redirect is convenience, not security.
- Code style: Ponytail — smallest complete change, no speculative abstractions, comment only the non-obvious why. Subagents run on Sonnet or Haiku; the orchestrator is Opus 5.5.
- Dates stored as ISO-8601 UTC strings; displayed in `Asia/Jakarta`.
- Requests pass through Cloudflare, which cuts responses after ~100 s. Any Claude or Chromium work started from the UI (`captureJob` extraction+checks, `runChecks`, `tailorJob`) runs **without being awaited by the request**: the action records a pending marker and returns; the job page polls (`router.refresh()` every 3 s) while a marker is set.
- Non-streaming Claude calls use `max_tokens` ≤ 16000; anything larger uses `client.beta.messages.stream(...)` + `finalMessage()` and parses with the same zod schema.

## Review Focus

1. **LinkedIn links with tracking junk** (`/jobs/collections/recommended/?currentJobId=123`, `/jobs/view/123/?refId=…`) must resolve to one canonical job and dedupe — test in Task 4.
2. **Salary in another currency/period or missing** (USD/hour, IDR/year, "negotiable") must normalise correctly and never be flagged as a mismatch when unknown — test in Task 6.
3. **Mixed-signal emails** ("thanks for interviewing… unfortunately") must not be keyword-classified as an interview; when both rejection and interview keywords hit, defer to Claude — test in Task 9.
4. **Revoked/expired Gmail token** must pause sync, surface "Reconnect Gmail" in settings, and not crash or hot-loop the worker — test in Task 9.
5. **Claude failing during capture** (no key, 429, refusal) must still save the job with its raw text, show the error, and offer "Retry extraction" — test in Task 4.

---

## File Structure

```
.env.example  Dockerfile  docker-compose.yml  .dockerignore  README.md
package.json  tsconfig.json  next.config.ts  vitest.config.ts  components.json
scripts/hash-password.ts               prints ADMIN_PASSWORD_HASH
public/brand/                          mark.webp, mark-192.png (favicon), wordmark.svg
src/
  proxy.ts                             redirects unauthenticated /app/* to /login (Next 16 "proxy", formerly middleware)
  app/
    layout.tsx  globals.css            fonts, brand tokens
    page.tsx                           public results page
    login/page.tsx  login/actions.ts
    app/layout.tsx                     authenticated shell (sidebar)
    app/page.tsx                       overview
    app/new/page.tsx  app/new/actions.ts   capture (+ bookmarklet handshake)
    app/jobs/page.tsx                  board + table
    app/jobs/[id]/page.tsx  app/jobs/[id]/actions.ts
    app/inbox/page.tsx  app/inbox/actions.ts
    app/settings/page.tsx  app/settings/actions.ts
    api/health/route.ts
    api/public/stats/route.ts
    api/gmail/connect/route.ts  api/gmail/callback/route.ts
    api/jobs/[id]/cv/[version]/route.ts   PDF download
  components/ui/*                      shadcn generated
  components/*.tsx                     app components (named per task)
  lib/
    types.ts       zod schemas + inferred types shared everywhere
    db.ts  schema.sql
    settings.ts
    auth.ts  crypto.ts
    ai.ts  prompts.ts
    jobs.ts        job repository + status transitions
    capture/url.ts  capture/fetch.ts  capture/extract.ts
    check/salary.ts  check/scam.ts  check/run.ts
    cv/parse.ts
    tailor/tailor.ts  tailor/guard.ts  tailor/cv-html.ts  tailor/pdf.ts
    email/gmail.ts  email/match.ts  email/classify.ts  email/sync.ts
    ghost.ts
    metrics.ts
  worker/index.ts
tests/                                 mirrors src/lib (vitest)
```

---

### Task 1: Scaffold, brand theme, test runner

**Files:**
- Create: project scaffold (`create-next-app` with TypeScript, App Router, `src/`, Tailwind, ESLint, alias `@/*`), `components.json`, `vitest.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `public/brand/*`, `.env.example`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm run dev|build|start|test`; Tailwind tokens `bg-primary` (navy), `text-primary-foreground` (white), `bg-accent`/`text-accent` (sky blue); shadcn components available under `@/components/ui/*`; `public/brand/mark.webp`, `public/brand/wordmark.svg`.

- [ ] **Step 1:** Scaffold in a temp dir (create-next-app refuses a non-empty folder), then move everything except `.git` into the repo root (which already holds `docs/`): `npx create-next-app@16.4.2 <tmp>/jobtracker --ts --app --src-dir --tailwind --eslint --import-alias "@/*" --use-npm`. Pin exact versions in `package.json` to those in Tech Stack.
- [ ] **Step 2:** `npx shadcn@4.22.1 init` (base colour neutral), then add: `button card input textarea label select badge table tabs dialog dropdown-menu sonner separator switch skeleton tooltip sheet`.
- [ ] **Step 3:** In `globals.css`, map shadcn tokens: `--primary` = `#272660`, `--primary-foreground` = `#FFFFFF`, `--accent` = `#49BCE9`, `--accent-foreground` = `#272660`, `--ring` = `#49BCE9`. Dark (`@custom-variant dark (@media (prefers-color-scheme: dark))`): background near-black navy (`#0E0D24`), card `#17163A`, `--primary` = `#49BCE9`, `--primary-foreground` = `#272660`. Status colours: success/warn/danger as muted tokens `--success`, `--warning`, `--danger` (builder's choice, AA contrast on both backgrounds).
- [ ] **Step 4:** `layout.tsx`: Montserrat weights 300/500/600/700 via `next/font/google` as the default sans; `<html lang="en">`; metadata title "JobTracker · Naspad Studio"; favicon `public/brand/mark-192.png`.
- [ ] **Step 5:** Brand assets: extract the base64 PNG from `docs/brand/naspad-mark.svg`, write `public/brand/mark.webp` (height 128) and `mark-192.png`; copy the vector `<path>` elements of `docs/brand/naspad-logo-horizontal.svg` (the wordmark, everything except the pattern rect) into `public/brand/wordmark.svg` with `fill="currentColor"` so it renders navy in light and white in dark.
- [ ] **Step 6:** Vitest config (node environment, `@/` alias). `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 7:** `.env.example` with every env var from Global Constraints (empty secrets, `DRY_RUN=true`, `TZ=Asia/Jakarta`, `DB_PATH=./data/jobtracker.db`). Add `data/` and `.env` to `.gitignore`.
- [ ] **Step 8:** Commit `chore: scaffold Next.js app with Naspad brand theme`.

### Task 2: Types, database, settings

**Files:**
- Create: `src/lib/types.ts`, `src/lib/schema.sql`, `src/lib/db.ts`, `src/lib/settings.ts`
- Test: `tests/db.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Produces (`types.ts`, zod schemas + `z.infer` types):
  - `Status = 'saved'|'ready'|'applied'|'interview'|'offer'|'rejected'|'ghosted'|'skipped'`
  - `Source = 'linkedin'|'jobstreet'|'glints'|'wellfound'|'kalibrr'|'dealls'|'upwork'|'contra'|'toptal'|'projects'|'sribulancer'|'fastwork'|'other'`
  - `JobFields { company: string; companyDomain: string|null; title: string; location: string|null; workMode: 'remote'|'hybrid'|'onsite'|null; employmentType: string|null; salaryMin: number|null; salaryMax: number|null; salaryCurrency: string|null; salaryPeriod: 'hour'|'day'|'month'|'year'|null; requirements: string[]; niceToHave: string[]; description: string; applyMethod: 'site'|'email'|'form'; applyEmail: string|null; applyUrl: string|null; recruiterEmail: string|null; language: 'en'|'id' }`
  - `Job` = `JobFields` + `{ id; url; source: Source; status: Status; busy: 'extracting'|'checking'|'tailoring'|null; busyError: string|null; statusLocked: boolean; rawText: string|null; extractError: string|null; matchScore: number|null; matchJson: string|null; salaryFit: SalaryFit|null; scamRisk: 'low'|'medium'|'high'|null; scamJson: string|null; followUpDue: boolean; appliedAt: string|null; firstResponseAt: string|null; reachedInterview: boolean; createdAt: string; updatedAt: string }` (camelCase; `jobs.ts` maps snake_case rows), `SalaryFit = 'ok'|'below_minimum'|'above_range'|'unknown'`
  - `MasterCv { basics:{name,email,phone,location,links:string[]}; summary: string; experience: {id,company,title,start,end:string|null,location:string|null,bullets:{id,text}[]}[]; projects: {id,name,description,bullets:{id,text}[]}[]; education: {id,school,degree,start,end}[]; skills: {id,name,category}[]; certifications: {id,name,issuer,year}[]; languages: string[] }`
  - `Settings` (all with defaults): `profile` (name, email, phone, links), `preferences` (targetRoles string[], seniority string, workModes, locations string[], employmentTypes string[], dealBreakers string[]), `salary` (expectedMonthlyIdr 0, minimumMonthlyIdr 0, expectedUsdHourly 0, fx `{USD:16000,SGD:12000,EUR:17500}`, hoursPerMonth 173), `pipeline` (ghostDays 14, followUpDays 7, cvLanguage `'auto'|'en'|'id'` = 'auto'), `outlookAddress` string|null, `publicPageEnabled` true, `aiModel` 'claude-opus-5-5'. Phase-2 keys (`autoApply…`) are **not** added now.
- Produces (`db.ts`): `getDb(): Database` (singleton opened from `process.env.DB_PATH`, WAL unless `:memory:`, foreign keys on, applies `schema.sql` when `PRAGMA user_version` = 0 then sets 1); `openDb(path: string): Database`; `resetDb(): void` (closes and drops the singleton — tests call it in `beforeEach` for a fresh in-memory DB). `vitest.config.ts` sets `env: { DB_PATH: ':memory:', APP_SECRET: 'test-secret' }`. Every module calls `getDb()`; no module takes a `db` parameter. Tests never touch `./data`.
- Produces (`settings.ts`): `getSettings(): Settings` (parsed with defaults), `saveSettings(patch: Partial<Settings>): Settings` (deep-merge, validate, throws ZodError), `getKv/setKv(key, value)` for non-settings state (`masterCv`, `gmailToken`, `gmailLastSync`, `gmailError`).
- Tables (`schema.sql`): `jobs` (all `JobFields` columns snake_case, plus `id`, `url` UNIQUE canonical, `source`, `status` default 'saved', `status_locked` 0, `busy` NULL, `busy_error` NULL, `raw_text`, `extract_error`, `match_score`, `match_json`, `salary_fit`, `scam_risk`, `scam_json`, `follow_up_due` 0, `applied_at`, `first_response_at`, `reached_interview` 0, `created_at`, `updated_at`); `tailored` (`id`, `job_id` FK, `version`, `cv_json`, `cover_letter`, `answers_json`, `pdf` BLOB, `created_at`, UNIQUE(job_id, version)); `events` (`id`, `job_id` FK, `at`, `kind` 'status'|'email'|'note'|'check'|'tailor', `data_json`); `emails` (`id` TEXT PK = Gmail id, `thread_id`, `from_addr`, `original_from`, `subject`, `snippet`, `received_at`, `classification` 'rejection'|'interview'|'offer'|'auto_ack'|'other', `job_id` NULL FK); `kv` (`key` PK, `value_json`).

- [ ] **Step 1:** Write `tests/db.test.ts`: `openDb(':memory:')` creates all five tables; `user_version` is 1; inserting two jobs with the same `url` throws.
- [ ] **Step 2:** Write `tests/settings.test.ts`: empty DB → `getSettings().pipeline.ghostDays === 14` and `aiModel === 'claude-opus-5-5'`; `saveSettings({pipeline:{ghostDays:21}})` keeps `followUpDays === 7`; `saveSettings({pipeline:{ghostDays:-1}})` throws.
- [ ] **Step 3:** Run `npx vitest run tests/db.test.ts tests/settings.test.ts` → FAIL.
- [ ] **Step 4:** Implement `types.ts`, `schema.sql`, `db.ts`, `settings.ts` (settings stored as one `kv` row `settings`).
- [ ] **Step 5:** Run tests → PASS. Commit `feat: sqlite schema, shared types, settings`.

### Task 3: Auth (password login, session, proxy)

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/auth.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `scripts/hash-password.ts`
- Test: `tests/auth.test.ts`, `tests/crypto.test.ts`

**Interfaces:**
- Produces (`crypto.ts`): `encrypt(plain: string): string` / `decrypt(token: string): string` — AES-256-GCM, key = SHA-256(`APP_SECRET`), output `iv.tag.cipher` base64url; `decrypt` throws on tamper.
- Produces (`auth.ts`): `hashPassword(pw): string` → `scrypt$<saltHex>$<hashHex>`; `verifyPassword(pw, stored): boolean` (timing-safe); `createSessionToken(now = Date.now()): string` → `<expiresMs>.<hmacHex>` (30 days, HMAC-SHA256 with `APP_SECRET`); `isValidSession(token: string|undefined, now = Date.now()): boolean`; `requireSession(): Promise<void>` (reads cookie `jt_session`, `redirect('/login')` if invalid); `safeNext(next: string|null): string` (returns `next` only if it starts with `/app` and not `//`, else `/app`); `loginLimiter.check(ip, now): boolean` / `.fail(ip, now)` — 5 failures per 15 min per IP (IP from `cf-connecting-ip`, then `x-forwarded-for`).
- Cookie: `jt_session`, httpOnly, `sameSite: 'lax'`, `secure` when `NODE_ENV=production`, path `/`.

- [ ] **Step 1:** Write tests: password round-trip true/false; session valid now, invalid after 30 days + 1 ms, invalid when one char changed; `safeNext('//evil.com')`, `safeNext('https://evil.com')`, `safeNext('/settings')` all → `/app`, `safeNext('/app/new?via=bm')` unchanged; limiter blocks the 6th attempt within 15 min and allows after; encrypt/decrypt round-trip and tamper throws.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `node:crypto` only (no auth libraries).
- [ ] **Step 4:** `proxy.ts`: for `/app/:path*`, if `jt_session` cookie is not valid redirect to `/login?next=<path+search>`.
- [ ] **Step 5:** Login page: brand wordmark, one password field, submit via server action `login(formData)` → limiter → verify against `ADMIN_PASSWORD_HASH` → set cookie → `redirect(safeNext(next))`; generic error "Wrong password" / "Too many attempts, try again later". `logout()` action clears the cookie.
- [ ] **Step 6:** `scripts/hash-password.ts` reads a password from stdin and prints `hashPassword()`; add `"hash-password": "tsx scripts/hash-password.ts"`.
- [ ] **Step 7:** Run tests → PASS; manually: `/app` redirects to `/login?next=/app`, correct password lands on `/app`. Commit `feat: single-user password login and sessions`.

### Task 4: Claude helper, capture (URL, fetch, extract), jobs repository

**Files:**
- Create: `src/lib/ai.ts`, `src/lib/prompts.ts`, `src/lib/capture/url.ts`, `src/lib/capture/fetch.ts`, `src/lib/capture/extract.ts`, `src/lib/jobs.ts`
- Test: `tests/ai.test.ts`, `tests/capture-url.test.ts`, `tests/capture-fetch.test.ts`, `tests/jobs.test.ts`

**Interfaces:**
- Produces (`ai.ts`): `askJson<T>(opts: { schema: z.ZodType<T>; system: string; content: string | Anthropic.ContentBlockParam[]; effort?: 'low'|'medium'|'high'; maxTokens?: number }, client?: Anthropic): Promise<T>`. Uses `client.beta.messages.parse` with `model` from settings, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, `output_config: { effort, format: zodOutputFormat(schema) }`, `max_tokens` default 16000, system prompt with `cache_control: {type:'ephemeral'}`. Throws `AiError` with `code: 'refusal' | 'unparseable' | 'api'` (refusal checked via `stop_reason` before reading output). If the installed SDK's beta `parse` rejects `fallbacks`, drop the fallback params and note it in the commit message.
- Produces (`prompts.ts`): string constants `EXTRACT_JOB`, `MATCH_JOB`, `SCAM_REVIEW`, `TAILOR`, `PARSE_CV`, `CLASSIFY_EMAIL` (later tasks fill theirs).
- Produces (`capture/url.ts`): `canonicalUrl(input: string): string`; `sourceFromUrl(url: string): Source`; `fetchUrlFor(canonical: string): string` (LinkedIn → `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/<id>`, others unchanged).
- Produces (`capture/fetch.ts`): `fetchJobText(url: string, fetchImpl = fetch): Promise<{ ok: true; text: string } | { ok: false; reason: string }>` — browser User-Agent, 15 s timeout, non-2xx → `{ok:false, reason:'HTTP 403'}`; cheerio strips `script,style,nav,footer,header,noscript,svg`, prepends any `application/ld+json` JobPosting JSON; collapses whitespace; text < 500 chars → `{ok:false, reason:'too little text'}`; caps text at 60 000 chars.
- Produces (`capture/extract.ts`): `extractJob(text: string, url: string): Promise<JobFields>` via `askJson(EXTRACT_JOB, effort 'low')`.
- Produces (`jobs.ts`): `startJobWork(jobId: number, kind: 'extracting'|'checking'|'tailoring', work: () => Promise<void>): Promise<void>` — throws synchronously if the job is already busy; otherwise sets `busy`, runs `work`, clears `busy` on success or stores `busy_error` on failure; the returned promise never rejects (actions don't await it, tests do). `captureJob(input: { url: string; text?: string }): Promise<{ id: number; created: boolean; done: Promise<void> }>` (canonicalise → existing job returns `created:false` → else fetch (skipped when `text` given) → insert row with `raw_text` → `startJobWork(id,'extracting', extract (+ checks from Task 6))`; an `AiError` during extraction is stored in `extract_error` and the job is kept); `retryExtraction(id)`; `getJob(id)`, `listJobs(filter?: { status?: Status; source?: Source })`; `setStatus(id, status: Status, by: 'user'|'email'|'ghost', at = new Date())` — writes an `events` row; `by:'user'` sets `status_locked=1` unless status is `'applied'`; `by:'email'|'ghost'` is a no-op when locked; `'applied'` sets `applied_at` if null; `'interview'|'offer'` sets `reached_interview=1`; `markRepliedElsewhere(id)` sets `first_response_at` if null + event; `addNote(id, text)`; `addEvent(id, kind, data)`.

- [ ] **Step 1:** `tests/capture-url.test.ts`: `canonicalUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4468726313&x=1')` and `canonicalUrl('https://id.linkedin.com/jobs/view/4468726313/?refId=abc')` both → `https://www.linkedin.com/jobs/view/4468726313`; non-LinkedIn URLs lose `utm_*`, hash and trailing slash but keep other query params; `sourceFromUrl` for `id.jobstreet.com`, `glints.com`, `www.kalibrr.com`, `dealls.com`, `wellfound.com`, `www.upwork.com`, `projects.co.id`, `example.com` → `jobstreet, glints, kalibrr, dealls, wellfound, upwork, projects, other`.
- [ ] **Step 2:** `tests/capture-fetch.test.ts` with a stub `fetchImpl`: 403 → `{ok:false, reason:'HTTP 403'}`; HTML with `<script>` and 600 chars of body text → ok and text has no script content; 100-char page → `too little text`.
- [ ] **Step 3:** `tests/ai.test.ts` with a stub client: `stop_reason:'refusal'` → throws `AiError` code `refusal`; `parsed_output: null` → `unparseable`; normal → returns parsed object.
- [ ] **Step 4:** `tests/jobs.test.ts` (in-memory DB, `vi.mock('@/lib/ai')`): capturing the same LinkedIn job via two URL shapes returns the same id and `created:false` the second time; when `askJson` rejects with `AiError('api')`, after `await done` the job exists with `raw_text` set, `extract_error` non-null and `busy` null (**Review Focus 5**); `startJobWork` with a rejecting `work` leaves `busy` null and `busy_error` set; a second `startJobWork` while busy throws; `setStatus(...,'rejected','user')` then `setStatus(...,'interview','email')` leaves status `rejected`; `setStatus(...,'applied','user')` does not lock; each call writes an event.
- [ ] **Step 5:** Run → FAIL. Implement the five modules; write `EXTRACT_JOB` (extract only what the text states; nulls when absent; `applyMethod:'email'` only if the posting asks to send a CV to an address).
- [ ] **Step 6:** Run → PASS. Commit `feat: capture pipeline with claude extraction`.

### Task 5: Master CV and settings page

**Files:**
- Create: `src/lib/cv/parse.ts`, `src/app/app/settings/page.tsx`, `src/app/app/settings/actions.ts`, `src/app/app/layout.tsx` (shell, needed to host pages), `src/components/app-sidebar.tsx`
- Test: `tests/cv-parse.test.ts`

**Interfaces:**
- Consumes: `askJson`, `getSettings/saveSettings/getKv/setKv`, `requireSession`.
- Produces: `parseCv(input: { pdf: Buffer } | { text: string }): Promise<MasterCv>` — PDF sent as a base64 `document` block; every id generated by Claude must be unique (validate; re-number duplicates as `exp-1`, `exp-1-b1`, …). `getMasterCv(): MasterCv | null`, `saveMasterCv(cv: MasterCv)` (kv `masterCv`).
- Produces: the authenticated shell — sidebar (wordmark, links: Overview `/app`, New job `/app/new`, Jobs `/app/jobs`, Inbox `/app/inbox`, Settings `/app/settings`, Logout), collapses to a `Sheet` on mobile.
- Settings page sections (spec §8): Profile, Master CV (upload PDF ≤ 10 MB or paste text → parse → editable form for summary/experience bullets/skills; save), Preferences, Salary (+ FX rates, hours/month), Pipeline, Outlook forwarding address, Public page toggle, AI model (text input, default shown), Connections (Claude key present yes/no from env; Gmail status from Task 9 — leave a placeholder card that Task 9 fills), Bookmarklet (Task 8 fills).

- [ ] **Step 1:** `tests/cv-parse.test.ts` (mock `askJson` returning two experiences both with id `e1`) → result ids are unique and bullets keep their parent order.
- [ ] **Step 2:** Run → FAIL. Implement `parse.ts` + `PARSE_CV` prompt (extract only, no rewriting).
- [ ] **Step 3:** Run → PASS. Build shell + settings page with shadcn `Card`, `Input`, `Textarea`, `Switch`, `Select`; every action calls `requireSession()` and validates with the zod schemas; show `sonner` toasts on save/errors.
- [ ] **Step 4:** Manual check: upload a sample PDF CV, edit a bullet, save, reload — values persist. Commit `feat: settings page and master CV`.

### Task 6: Checks (salary fit, scam, match)

**Files:**
- Create: `src/lib/check/salary.ts`, `src/lib/check/scam.ts`, `src/lib/check/run.ts`
- Modify: `src/lib/jobs.ts` (the extraction work in `captureJob`/`retryExtraction` calls `runChecks` after a successful extraction; `checking`/`tailoring` UI actions use `startJobWork`)
- Test: `tests/salary.test.ts`, `tests/scam.test.ts`, `tests/check-run.test.ts`

**Interfaces:**
- Produces: `toMonthlyIdr(amount: number, currency: string, period: 'hour'|'day'|'month'|'year', s: Settings['salary']): number|null` (IDR = 1; unknown currency → null; hour × hoursPerMonth; day × 21.7; year ÷ 12).
- Produces: `salaryFit(job: Pick<JobFields,'salaryMin'|'salaryMax'|'salaryCurrency'|'salaryPeriod'>, s: Settings['salary']): 'ok'|'below_minimum'|'above_range'|'unknown'` — top = max ?? min; top null/unconvertible or period null → `unknown`; top < minimum → `below_minimum`; top < expected → `above_range`; else `ok`. When minimum/expected are 0 (unset) → `unknown`.
- Produces: `scamSignals(job: JobFields, rawText: string): string[]` — rules: contact only via Telegram/WhatsApp (`t.me/`, `wa.me/`, "telegram", "whatsapp" with no company email/site apply); fee words (`biaya`, `deposit`, `bayar`, `registration fee`, `training fee`, `transfer`); recruiter email on a free-mail domain (`gmail.com, yahoo.com, outlook.com, hotmail.com, ymail.com, proton.me`) while `companyDomain` is not that domain; pay > 3× the user's expected salary. `ruleRisk(signals): 'low'|'medium'|'high'` (0 → low, 1 → medium, ≥2 → high).
- Produces: `runChecks(jobId: number): Promise<void>` — computes salary fit, rule signals, then one `askJson(MATCH_JOB, effort 'medium')` returning `{ score: number(0-100), reasons: string[], gaps: string[], missingKeywords: string[], dealBreakerHit: string|null }` and one `askJson(SCAM_REVIEW, effort 'low')` returning `{ risk: 'low'|'medium'|'high', reasons: string[] }`; final scam risk = the higher of rule and AI risk; `dealBreakerHit` caps score at 40; stores columns + `check` event; moves `saved` → `ready` only if extraction succeeded. Called by `captureJob` after a successful extraction.
- Prompts `MATCH_JOB`/`SCAM_REVIEW` distilled from the `job-description-analyzer` skill (load it with the Skill tool) and spec §4.2.

- [ ] **Step 1:** `tests/salary.test.ts` with `{expectedMonthlyIdr: 25_000_000, minimumMonthlyIdr: 18_000_000, fx:{USD:16000}, hoursPerMonth:173}`: IDR 15–17 jt/month → `below_minimum`; IDR 20–22 jt → `above_range`; IDR 20–30 jt → `ok`; USD 10/hour (=27.68 jt) → `ok`; IDR 300 jt/year (=25 jt) → `ok`; all nulls → `unknown`; currency `XYZ` → `unknown`; min only 26 jt → `ok` (**Review Focus 2**).
- [ ] **Step 2:** `tests/scam.test.ts`: text "Hubungi via WhatsApp wa.me/62812… biaya pelatihan Rp500.000" → ≥2 signals, `high`; a normal posting with a company email → 0 signals, `low`; recruiter `hr.company@gmail.com` with `companyDomain: 'company.co.id'` → 1 signal.
- [ ] **Step 3:** `tests/check-run.test.ts` (mock ai): AI scam `low` + rules `high` → stored `high`; `dealBreakerHit` set → stored score ≤ 40; status moves `saved` → `ready`.
- [ ] **Step 4:** Run → FAIL. Implement. Run → PASS. Commit `feat: match, salary-fit and scam checks`.

### Task 7: Tailor (guarded content, CV HTML, PDF)

**Files:**
- Create: `src/lib/tailor/tailor.ts`, `src/lib/tailor/guard.ts`, `src/lib/tailor/cv-html.ts`, `src/lib/tailor/pdf.ts`, `src/app/api/jobs/[id]/cv/[version]/route.ts`
- Test: `tests/tailor-guard.test.ts`, `tests/cv-html.test.ts`, `tests/pdf.test.ts`

**Interfaces:**
- Produces: `TailorOutput` (zod): `{ summary: string; experience: { id: string; bullets: { text: string; sourceIds: string[] }[] }[]; projects: { id: string; bullets: { text: string; sourceIds: string[] }[] }[]; skillIds: string[]; coverLetter: string; answers: { question: string; answer: string }[] }`.
- Produces: `applyGuard(out: TailorOutput, cv: MasterCv): TailoredCv` — drops experience/project ids not in `cv`, drops bullets whose `sourceIds` is empty or references an id not in that entry's bullets, drops unknown skill ids; any number or percentage in a rewritten bullet that does not appear in one of its cited source bullets → replace the bullet text with the first cited source bullet's original text; copies `company`, `title`, `start`, `end`, `location`, `basics`, `education`, `certifications`, `languages` from `cv` (never from Claude). `TailoredCv` has the `MasterCv` shape.
- Produces: `renderCvHtml(cv: TailoredCv, lang: 'en'|'id'): string` — single column, ATS-safe (real text, no tables/columns/icons), font stack `Montserrat, Arial, sans-serif` with Montserrat loaded by a Google Fonts `<link>` (Chromium fetches it while printing; Arial if offline); section headings localised (`Experience`/`Pengalaman`, `Education`/`Pendidikan`, `Skills`/`Keahlian`, `Projects`/`Proyek`).
- Produces: `htmlToPdf(html: string): Promise<Buffer>` — `playwright-core` `chromium.launch()`, A4, margins 16 mm, `printBackground`.
- Produces: `tailorJob(jobId: number, extraQuestions?: string[]): Promise<{ version: number }>` — `askJson(TAILOR, effort 'high', maxTokens 16000)` with the job fields + master CV + settings preferences/salary (for the expected-salary answer) → guard → HTML → PDF → insert `tailored` row (version = max + 1) → `tailor` event. Language = settings `cvLanguage` unless `'auto'`, then the job's `language`.
- Cover letter and answers are not machine-checked: add `// shortcut: cover letter/answers aren't fact-checked against the master CV; add a claim check if fabrications show up` in `tailor.ts`, and the Tailor panel shows "Review before sending" above them.
- Route `GET /api/jobs/[id]/cv/[version]` → `requireSession()` → PDF with `Content-Disposition: attachment; filename="<Name>-<Company>-CV.pdf"`.
- `TAILOR` prompt distilled from skills `resume-tailor`, `resume-ats-optimizer`, `tech-resume-optimizer`, `resume-formatter`, `application-form-filler`, `cover-letter-generator` (load each with the Skill tool) + the rule "every bullet must cite the master-CV bullet ids it is based on; never add employers, titles, dates, metrics or skills not present".

- [ ] **Step 1:** `tests/tailor-guard.test.ts`: master CV with experience `e1` (bullets `e1-b1`, `e1-b2`); output containing experience `e9`, a bullet with `sourceIds: []`, a bullet citing `e2-b1`, a skill id `s99`, and `title: 'CTO'` injected → result has only `e1`, only bullets citing `e1-*`, no `s99`, title equals master's; a bullet citing `e1-b1` ("Built billing service") that says "Built billing service, cutting costs 40%" comes back as "Built billing service".
- [ ] **Step 2:** `tests/cv-html.test.ts`: rendered HTML contains the name and every kept bullet text, contains `Pengalaman` when `lang='id'`, contains no `<table`.
- [ ] **Step 3:** `tests/pdf.test.ts`: `htmlToPdf('<h1>Hi</h1>')` returns a buffer starting with `%PDF` (requires `npx playwright install chromium` locally — add to README dev setup).
- [ ] **Step 4:** Run → FAIL. Implement. Run → PASS. Commit `feat: guarded tailoring and ATS PDF CV`.

### Task 8: Jobs UI — capture, board/table, job detail, bookmarklet

**Files:**
- Create: `src/app/app/new/page.tsx`, `src/app/app/new/actions.ts`, `src/app/app/jobs/page.tsx`, `src/app/app/jobs/[id]/page.tsx`, `src/app/app/jobs/[id]/actions.ts`, `src/components/job-card.tsx`, `src/components/job-status-badge.tsx`, `src/components/check-panel.tsx`, `src/components/tailor-panel.tsx`, `src/components/timeline.tsx`, `src/components/bookmarklet-capture.tsx`, `src/lib/bookmarklet.ts`
- Modify: `src/app/app/settings/page.tsx` (bookmarklet card)
- Test: `tests/bookmarklet.test.ts`

**Interfaces:**
- Consumes: `captureJob`, `retryExtraction`, `runChecks`, `tailorJob`, `setStatus`, `markRepliedElsewhere`, `addNote`, `listJobs`, `getJob`.
- Produces: `bookmarkletHref(appUrl: string): string` — a `javascript:` URL that adds a `message` listener, opens `${appUrl}/app/new?via=bm` in window `jobtracker`, and on receiving `{type:'jobtracker-ready'}` from origin `appUrl` replies with `{type:'jobtracker-capture', url: location.href, text: document.body.innerText.slice(0,100000)}` to that origin. `BookmarkletCapture` (client component on `/app/new?via=bm`) posts `{type:'jobtracker-ready'}` to `window.opener` with target `'*'` and fills the URL + text fields from the reply; the user still presses **Capture**.
- Clipboard fallback: if no `jobtracker-ready` arrives within 5 s (sites with `Cross-Origin-Opener-Policy: same-origin` sever `window.opener`), the bookmarklet copies `url + "\n\n" + text` to the clipboard and `alert`s "Copied — paste into JobTracker"; the capture page's textarea placeholder says "Paste here (⌘V)" and the URL is taken from the first line when the URL field is empty.
- Capture page: URL input + optional "Paste job description" textarea (auto-expanded when the last capture failed with `ok:false`, message "This site blocks servers — paste the description or use the bookmarklet"); submit → redirect to `/app/jobs/[id]`.
- Jobs page: `Tabs` Board | Table. Board = columns per status (`saved, ready, applied, interview, offer, rejected, ghosted`, `skipped` hidden behind a toggle), cards show company, title, source, score badge, salary-fit badge, scam badge, follow-up dot; status changes via a card `DropdownMenu` (no drag-and-drop). Table = shadcn `Table` with filters (source, status) via search params, sorted by `updated_at` desc.
- Job detail: while `busy` is set, show a pending state for that panel and poll; `busyError` shows an inline error with a retry button. Tailor/Re-run/Retry buttons call `startJobWork` and return immediately.
- Job detail: header (title, company, source link "Open job"), Check panel (score + reasons/gaps/keywords, salary fit with explanation, scam risk with reasons; "Re-run checks"), Tailor panel ("Tailor" button with pending state; versions list; per version: CV PDF download, cover letter with copy button, answers each with copy button; textarea "Extra questions from the form" fed to `tailorJob`), Apply bar ("Mark as applied", status select, "Replied elsewhere", add note), Timeline (events newest first). Extraction error → banner with "Retry extraction" and the raw-text editor.

- [ ] **Step 1:** `tests/bookmarklet.test.ts`: `bookmarkletHref('https://tracking.naspadstudio.id')` starts with `javascript:`, contains `jobtracker-ready`, `jobtracker-capture` and `clipboard`, contains the origin string, and is under 2000 chars; `splitPasted('https://x.com/job/1\n\nBody')` → `{url:'https://x.com/job/1', text:'Body'}` (export `splitPasted` from `bookmarklet.ts`).
- [ ] **Step 2:** Run → FAIL. Implement `bookmarklet.ts`. Run → PASS.
- [ ] **Step 3:** Build the pages/components above; every action `requireSession()` + zod-validate input; long actions (`tailorJob`, `runChecks`) use `useTransition` pending UI.
- [ ] **Step 4:** Manual check with the `run` skill: capture a Kalibrr job URL (server fetch works), a JobStreet URL (403 → paste path), and a LinkedIn URL with `currentJobId` (guest endpoint); run the bookmarklet on a real JobStreet and a real Glints job page in a logged-in browser and confirm either the handshake or the clipboard fallback fills the form; run Tailor once with a real key; download the PDF; mark applied. Commit `feat: capture, board, job detail and bookmarklet`.

### Task 9: Gmail OAuth, inbox sync, email matching and classification

**Files:**
- Create: `src/lib/email/gmail.ts`, `src/lib/email/match.ts`, `src/lib/email/classify.ts`, `src/lib/email/sync.ts`, `src/app/api/gmail/connect/route.ts`, `src/app/api/gmail/callback/route.ts`, `src/app/app/inbox/page.tsx`, `src/app/app/inbox/actions.ts`
- Modify: `src/app/app/settings/page.tsx` (Gmail connection card)
- Test: `tests/email-match.test.ts`, `tests/email-classify.test.ts`, `tests/email-sync.test.ts`

**Interfaces:**
- Produces (`gmail.ts`): `oauthClient()` (google-auth-library `OAuth2Client` from env + redirect), `authUrl(state: string): string`, `exchangeCode(code): Promise<void>` (stores `encrypt(refresh_token)` in kv `gmailToken`, clears `gmailError`), `listMessages(sinceEpochSec: number): Promise<RawEmail[]>` where `RawEmail = { id; threadId; from: string; subject: string; snippet: string; body: string; receivedAt: string }` (query `after:<epoch>`, paginate, body = first `text/plain` part decoded, capped at 20 000 chars). Connect route: `requireSession()`, random `state` in an httpOnly cookie, redirect to `authUrl`. Callback: verify `state`, exchange, redirect `/app/settings?gmail=connected`.
- Produces (`match.ts`): `JOB_BOARD_DOMAINS` (linkedin.com, jobstreet.com, jobstreet.co.id, glints.com, kalibrr.com, dealls.com, wellfound.com, greenhouse.io, lever.co, workablemail.com, ashbyhq.com, smartrecruiters.com); `originalSender(email: RawEmail, outlookAddress: string|null): string` (when `from` equals `outlookAddress` or the body has a forwarded header block — Gmail `---------- Forwarded message ---------` or Outlook `From: … Sent: …` — return the forwarded `From` address); `matchJob(email, jobs: Pick<Job,'id'|'company'|'companyDomain'|'recruiterEmail'|'status'>[], outlookAddress): number|null` — order: exact recruiter email; sender domain = companyDomain; normalised company name (lowercase, strip `pt`, `tbk`, `inc`, `ltd`, punctuation) found in subject or sender display name and unique among jobs in `applied|interview|offer`; else null. `isJobRelated(email, matchedJobId, outlookAddress): boolean` — matched, or job-board/ATS sender, or forwarded from Outlook, or `keywordClassify` ≠ null.
- Produces (`classify.ts`): `keywordClassify(text: string): 'rejection'|'interview'|'offer'|'auto_ack'|'ambiguous'|null` — keyword lists (case-insensitive): offer `offer letter, pleased to offer, penawaran kerja, surat penawaran`; rejection `unfortunately, not moving forward, other candidates, will not be proceeding, decided not to, tidak dapat melanjutkan, belum dapat melanjutkan, tidak lolos, mohon maaf`; interview `interview, wawancara, assessment, technical test, schedule a call, jadwal, undangan`; auto-ack `we have received your application, application was viewed, thank you for applying, lamaran anda telah kami terima, application received`. Precedence: offer > (rejection+interview both → `ambiguous`) > rejection > interview > auto_ack > null. `classifyEmail(email): Promise<Classification>` — keyword result unless `ambiguous`/`null`, then `askJson(CLASSIFY_EMAIL, effort 'low')`.
- Produces (`sync.ts`): `syncInbox(now = new Date()): Promise<{ stored: number; skipped: number }>` — no token → return zeros; since = kv `gmailLastSync` or now − 60 days; for each new message id not in `emails`: compute original sender, match, `isJobRelated`; **unrelated → skip without storing or calling Claude**; related → classify, insert `emails` row, if matched: `addEvent(job,'email',…)`; for `rejection|interview|offer` call `setStatus(job, map, 'email')` and set `first_response_at` if null; LinkedIn/JobStreet "sent you a message"/"new message" notifications on a matched job set `first_response_at`; `auto_ack` never sets it. On auth errors (`invalid_grant`, 401) set kv `gmailError` and stop; other errors propagate. Updates `gmailLastSync` only on success.
- Inbox page: unmatched related emails (classification badge, from, subject, date) with a job `Select` → `linkEmail(emailId, jobId)` action (applies the same status rules); settings Gmail card: Connected/Not connected/Error + last sync + Connect/Reconnect button + "Sync now".

- [ ] **Step 1:** `tests/email-classify.test.ts`: "Unfortunately we have decided to move forward with other candidates" → `rejection`; "Kami mohon maaf, Anda tidak dapat melanjutkan ke tahap berikutnya" → `rejection`; "We'd like to invite you to an interview" → `interview`; "Thank you for interviewing with us. Unfortunately…" → `ambiguous` (**Review Focus 3**); "We have received your application" → `auto_ack`; "Your weekly newsletter" → `null`.
- [ ] **Step 2:** `tests/email-match.test.ts`: recruiter email exact match; `talent@acme.co.id` with `companyDomain: 'acme.co.id'`; subject "Your application to PT Acme Indonesia Tbk" with company "Acme Indonesia" (on a board domain) → match; two applied jobs both "Acme" → null; Outlook-forwarded email (from = outlookAddress, body with `From: HR <hr@acme.co.id>`) → original sender `hr@acme.co.id` and matched.
- [ ] **Step 3:** `tests/email-sync.test.ts` (in-memory DB, mocked `listMessages` and ai): a personal email from `mom@gmail.com` with no keywords → not stored, `askJson` not called; rejection email for an `applied` job → status `rejected`, `first_response_at` set; same for a job locked by the user → status unchanged but event recorded; `listMessages` throwing `invalid_grant` → resolves, kv `gmailError` set, `gmailLastSync` unchanged (**Review Focus 4**).
- [ ] **Step 4:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 5:** Manual: with real Google OAuth credentials connect Gmail, "Sync now", confirm only job-related emails appear. Commit `feat: gmail oauth, inbox sync and email classification`.

### Task 10: Ghost detection and worker

**Files:**
- Create: `src/lib/ghost.ts`, `src/worker/index.ts`
- Modify: `src/app/app/jobs/[id]/page.tsx` + `actions.ts` ("Followed up" button when `followUpDue`)
- Test: `tests/ghost.test.ts`

**Interfaces:**
- Produces: `runGhostDetection(now = new Date()): { flagged: number; ghosted: number }` — for jobs with status `applied`, `first_response_at` null: age ≥ `followUpDays` → `follow_up_due=1`; age ≥ `ghostDays` → `setStatus(id,'ghosted','ghost')`. `clearFollowUp(id)` action used by the job detail page ("Followed up").
- Worker: `tsx src/worker/index.ts` — on start and every 10 minutes: `await syncInbox()` then `runGhostDetection()`; each wrapped in try/catch with a one-line `console.error`; a run never overlaps the previous one; `SIGTERM` exits cleanly. Add script `"worker": "tsx src/worker/index.ts"`.

- [ ] **Step 1:** `tests/ghost.test.ts`: applied 6 days ago → nothing; 7 days → flagged; 14 days → `ghosted`; 20 days but `first_response_at` set (replied elsewhere) → untouched; 20 days but status locked by user → untouched; only an `auto_ack` email received → still ghosted.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Run `npm run worker` locally for one cycle; log shows sync skipped (no token) and ghost counts. Commit `feat: ghost detection and background worker`.

### Task 11: Metrics, public results page, overview

**Files:**
- Create: `src/lib/metrics.ts`, `src/app/api/public/stats/route.ts`, `src/app/page.tsx`, `src/app/app/page.tsx`, `src/components/metrics-table.tsx`, `src/components/weekly-bars.tsx`
- Test: `tests/metrics.test.ts`

**Interfaces:**
- Produces: `PublicStats = { updatedAt: string; totals: Rates & { sent: number }; sources: (Rates & { source: Source; sent: number })[]; weekly: { weekStart: string; sent: number }[] }`, `Rates = { responseRate: number|null; interviewRate: number|null; ghostRate: number|null }` (0–1; null when no eligible applications).
- Produces: `computeMetrics(now = new Date()): PublicStats` — `sent` = jobs with `applied_at`; eligible = `applied_at` ≤ now − `ghostDays`; response = eligible with `first_response_at`; interview = eligible with `reached_interview`; ghost = eligible with status `ghosted`; `weekly` = last 12 ISO weeks (Monday start, Asia/Jakarta), zero-filled; sources with `sent = 0` omitted.
- `GET /api/public/stats` → 404 when `publicPageEnabled` false, else `computeMetrics()` with `Cache-Control: public, max-age=300`.
- Public page `/` (no login): header with wordmark + "Job search results", "Last updated", totals row (4 stat tiles), per-source table (`MetricsTable`), 12-week bars (`WeeklyBars`, plain divs, no chart lib), footer "© Naspad Studio"; when disabled → simple "This page is private" message. Style cue: the clean status-page layout of `monitor.naspadstudio.id`. Load the `dataviz` skill before building the tiles and bars.
- Overview `/app`: counts by status, "Needs action" list (status `ready`, `follow_up_due`, emails linked in the last 7 days), same `MetricsTable`.

- [ ] **Step 1:** `tests/metrics.test.ts`: fixtures — LinkedIn: 3 applied 30 days ago (1 rejected with response, 1 interview, 1 ghosted) + 1 applied 3 days ago; Kalibrr: 1 saved, never applied. Expect LinkedIn `sent=4`, `responseRate≈0.667`, `interviewRate≈0.333`, `ghostRate≈0.333`; Kalibrr absent; `JSON.stringify(stats)` does not contain any fixture company name, title or URL; 12 weekly entries.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3:** Build pages; check `/` logged out shows numbers, toggle off → "private" and API 404. Commit `feat: public results page and overview`.

### Task 12: Docker, compose, README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `src/app/api/health/route.ts`, `README.md`

**Interfaces:**
- `Dockerfile`: `FROM mcr.microsoft.com/playwright:v1.64.1-noble`; `WORKDIR /app`; `npm ci`; `npm run build`; `ENV NODE_ENV=production`; default `CMD ["npm","start"]`.
- `docker-compose.yml`: services `web` (port `127.0.0.1:3100:3000`, healthcheck `curl -f http://localhost:3000/api/health`) and `worker` (`command: npm run worker`), both `build: .`, `env_file: .env`, volume `./data:/data`, `DB_PATH=/data/jobtracker.db`, `TZ=Asia/Jakarta`, `restart: unless-stopped`.
- `GET /api/health` → `{ ok: true }` after `getDb()` succeeds.
- README: local dev (`npm i`, `npx playwright install chromium`, `.env`, `npm run hash-password`, `npm run dev` + `npm run worker`); deploy on naspad-server (`git pull && docker compose up -d --build`); cloudflared ingress `tracking.naspadstudio.id → http://localhost:3100`; Google Cloud OAuth setup step-by-step (create project, enable Gmail API, consent screen External with the two scopes, add the redirect URIs `https://tracking.naspadstudio.id/api/gmail/callback` and `http://localhost:3000/api/gmail/callback`, **publish to In production**, accept the unverified-app warning once); bookmarklet install; backup = copy `data/jobtracker.db` (stop worker first or use `sqlite3 .backup`).

- [ ] **Step 1:** Write the files above.
- [ ] **Step 2:** `docker compose build` succeeds; `docker compose up -d`; `curl -s localhost:3100/api/health` → `{"ok":true}`; `docker compose logs worker` shows one cycle; `docker compose down`.
- [ ] **Step 3:** Commit `chore: docker deployment and README`.

### Task 13: Design review and polish

**Files:**
- Modify: any UI files flagged by the review.

- [ ] **Step 1:** With the `run` skill, open every page at desktop and 375 px widths, light and dark; screenshot.
- [ ] **Step 2:** Invoke the `anthropic-skills:apple-design` skill on the screenshots (clarity, hierarchy, spacing, contrast, touch targets ≥ 44 px, focus states, empty/loading/error states). List findings.
- [ ] **Step 3:** Fix findings that are real defects; navy must remain the dominant colour; no horizontal scroll at 375 px; every interactive element keyboard-reachable with visible focus.
- [ ] **Step 4:** `npm test` and `npm run build` pass. Commit `fix: design review polish`.

---

## Spec coverage notes

- §3 sources (Prepare level), §4.1–4.5, §5 (read-only part), §7, §8, §9, §10 → Tasks 1–13.
- Deliberately excluded (phase 2 per spec §11): auto-apply rules and engine (§6), email sending, freelance feeds, Freelancer.com, company-form auto-submit, and §12 open checks for those. §12 fetchability was checked on 2026-10-19 from a Mac: LinkedIn guest endpoint and Kalibrr return content; JobStreet and Glints return 403 (paste/bookmarklet path); Wellfound and Dealls unverified per-job.
