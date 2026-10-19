# Owner AI Provider and Markdown Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Recommended execution: inline in this chat; preserve the existing no-delegation preference unless the owner chooses otherwise.

**Goal:** Let the owner choose one global AI provider/model and manage shared Markdown CV instructions with a required primary and optional additional skill.

**Architecture:** Keep askJson as the account-aware entry point, with Anthropic and OpenAI adapters behind it. Versioned shared-registry tables hold owner configuration and skill documents; immutable job snapshots flow through existing background services. New per-account generation metadata is saved transactionally with tailored versions.

**Tech Stack:** Next.js 16.4.2, TypeScript/Zod, better-sqlite3, existing Anthropic SDK, official OpenAI Node SDK for Responses/Zod helpers, Vitest, existing Tailwind/shadcn UI and Playwright Chromium Docker image.

**Spec:** `docs/superpowers/specs/2026-10-19-ai-provider-skills-design.md` (approved 2026-10-19).

## Global Constraints

- Owner remains `owner@example.com`; existing Google sign-in, approvals, sessions and account isolation remain intact.
- Only owner manages global provider/model and skills. No per-member override, including legacy aiModel submitted directly to a server action.
- Primary skill required; additional skill optional and distinct. Maximum two selected skills, applied to everyone.
- Plain UTF-8 Markdown, nonempty, maximum `65536` bytes per skill; filenames are labels, never paths.
- No code execution, arbitrary HTML/CSS, remote includes, shell/filesystem capabilities or automatic skill downloads.
- Keep API keys only in server env: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`; preserve `APP_SECRET` and existing OAuth credentials.
- Non-streaming maximum generated tokens `16000`; OpenAI Responses uses `store:false` and no Anthropic beta/fallback parameters.
- No automatic cross-provider failover. Initial provider remains Anthropic with owner's existing model, default `claude-opus-5-5`.
- Skills apply only to tailoring CV/cover letter/form answers, not parsing, matching, scam checks or Gmail classification.
- Protected schema/factual/language constraints and application guards remain outside editable Markdown. Existing versions/PDFs remain unchanged.
- Tests never call real Google/Claude/OpenAI APIs. A live provider check requires owner-authorized usage and configured credentials.
- UI-triggered AI/PDF work remains asynchronous with existing busy markers/polling; snapshot settings before the first await.
- Read installed Next.js route/cookie/server-action documentation before relevant code changes; retain existing Naspad design/components.
- Backup the whole stopped data directory and .env before schema-changing deployment. Rollback restores compatible data and images together.

## Review Focus

1. An owner edits provider/model or a selected skill while a multi-call/background job runs: all calls/results retain the original snapshot (Tasks 3–4).
2. Two owner tabs edit/delete/select skills concurrently: stale revisions and dangling selections are rejected atomically (Tasks 1, 2 and 5).
3. A member forges model/skill/config fields or a guessed metadata ID: shared policy and private data boundaries hold server-side (Tasks 3–5).
4. A provider refuses, truncates output, returns malformed data, or lacks PDF/structured-output support: no false successful version/PDF is saved and no silent provider switch occurs (Tasks 3–4).
5. A release needs rollback after database version upgrades: preserve new writes and restore a matched backup/image instead of opening newer registry with old code (Tasks 6–7).

## File Map

- New `src/lib/ai-settings.ts`: effective global config, owner validation, initial model migration and atomic selection/snapshot reads.
- New `src/lib/cv-skills.ts`: Markdown validation, revision-aware owner CRUD, import/export helpers and immutable skill snapshots.
- New `src/lib/ai/types.ts`, `src/lib/ai/anthropic.ts`, `src/lib/ai/openai.ts`: provider-neutral request/result types and narrow SDK adapters. Retain `src/lib/ai.ts` as public orchestrator/AiError export.
- Modify `src/lib/accounts.ts`: additive registry v1→v2 migration; `src/lib/db.ts`/`schema.ts`: account data v1→v2 metadata table migration.
- Modify `src/lib/prompts.ts` and tailoring service: separate protected constraints from seeded editable instructions; save/read generation metadata.
- Modify jobs, checks, CV parsing, extraction, email classification/sync to pass AI snapshots explicitly through related calls.
- New Settings action/card files for AI configuration and skill management; modify existing Settings actions/page and TailorPanel/job detail for read-only effective setup/history.
- New authenticated Markdown export route; import via owner server action. No publicly readable instruction-file directory.
- Update README/.env.example, add OpenAI SDK/lock entry, create focused tests and adapt existing AI/caller tests.

### Task 1: Versioned configuration and metadata storage

**Files:** Modify `src/lib/accounts.ts`, `src/lib/db.ts`, `src/lib/schema.ts`, `src/lib/prompts.ts`, `tests/db.test.ts`, `tests/accounts.test.ts`; create `src/lib/ai-settings.ts`, `tests/ai-settings.test.ts`, `tests/ai-migration.test.ts`.

**Interfaces:**
- `AiProvider = "anthropic" | "openai"`; `AiSelection = Readonly<{ provider: AiProvider; model: string }>`.
- `AiConfig = AiSelection & { revision: number; primarySkillId: number; additionalSkillId: number | null }`.
- `getAiConfig(): AiConfig`; `saveAiSelection(account: Account, input: {provider: AiProvider; model: string; revision: number}): AiConfig`.
- `providerAvailability(): { anthropic: boolean; openai: boolean }` returns booleans only.
- Registry v2 tables: `cv_skills(id, filename COLLATE NOCASE UNIQUE, body, revision, updated_at)` and singleton `ai_config(id CHECK id=1, provider, model, revision, primary_skill_id REFERENCES cv_skills ON DELETE RESTRICT, additional_skill_id REFERENCES cv_skills ON DELETE RESTRICT)` with distinct slots constraint. Existing registry records unchanged.
- Account v2 table `generation_metadata(job_id, version, data_json, PRIMARY KEY(job_id,version), FOREIGN KEY(job_id,version) REFERENCES tailored(job_id,version) ON DELETE CASCADE)`; existing account tables/results unchanged.

- [ ] **Step 1:** Write tests for real v1 database upgrades, preserved owner CV/job/token/session/approval/PDF records, repeated bootstrap without reseeding, future-version rejection, and successful reopen at v2. Seed default `resume-tailor.md` and primary selection once; additional null. Preserve owner's existing aiModel; ignore member's model. Verify APP_SECRET/token decryptability remains unchanged.
- [ ] **Step 2:** Run `npm test -- tests/ai-migration.test.ts tests/ai-settings.test.ts tests/db.test.ts tests/accounts.test.ts`; observe new behavior failing.
- [ ] **Step 3:** Implement additive migrations with immediate transactions to serialize worker/web initialization. Seed configuration after registry initialization via an idempotent settings helper (avoid accounts↔settings bootstrap recursion). Extract `TAILOR_REQUIREMENTS` and `DEFAULT_TAILOR_SKILL` constants from the current prompt, keeping schema/factual/input/language rules protected and existing style guidance in the default skill.
- [ ] **Step 4:** Implement provider/model validation (trimmed model ID 1–200 characters), owner check against active registry role, credential-presence checks, and expected-revision update. Saving unchanged settings does not trigger API calls or reseeding; invalid saves preserve the prior config.
- [ ] **Step 5:** Run focused tests; commit `feat: add global AI configuration and schema migrations`.

### Task 2: Markdown skills CRUD and shared selection

**Files:** Create `src/lib/cv-skills.ts`, `tests/cv-skills.test.ts`; modify `src/lib/ai-settings.ts`.

**Interfaces:**
- `CvSkill = { id: number; filename: string; body: string; revision: number; updatedAt: string }`; `SkillSnapshot = Readonly<Pick<CvSkill,"id"|"filename"|"body"|"revision">>`.
- Owner-only `listSkills(account): CvSkill[]`, `getSkill(account,id): CvSkill|null`, `createSkill(account,{filename,body}): CvSkill`, `updateSkill(account,{id,revision,filename,body}): CvSkill`, `deleteSkill(account,id,revision): void`.
- `decodeSkillUpload(filename: string, bytes: Uint8Array): {filename:string;body:string}` validates UTF-8, bytes and basename before DB mutation.
- `selectSkills(account,{primarySkillId,additionalSkillId,revision}): AiConfig` updates both slots and configuration revision atomically.
- `TailorSetup = Readonly<{ ai: AiSelection; primary: SkillSnapshot; additional: SkillSnapshot|null }>`; `snapshotTailoring(): TailorSetup` reads config and both bodies in one transaction; `getEffectiveAiSummary(): {provider:AiProvider;model:string;primary:string;additional:string|null}` contains no bodies/keys.

- [ ] **Step 1:** Write tests for owner CRUD, direct member denial, UTF-8/nonempty/65536-byte boundary, invalid encoding, separators/traversal/control characters, .md suffix and case-insensitive filename uniqueness. Use bounded basenames of at most 100 characters; reject `..` segments and `/` or `\\` entirely.
- [ ] **Step 2:** Add tests for stale edit/delete revision, selected deletion blocked, missing IDs, duplicate primary/additional, required primary, clear additional, and atomic rollback on invalid pair. Read a snapshot, then edit/unselect/delete originals: snapshot values remain unchanged and no other selection changes implicitly.
- [ ] **Step 3:** Run `npm test -- tests/cv-skills.test.ts`; require failures before implementation.
- [ ] **Step 4:** Implement SQLite owner CRUD and conditional revisions; filenames never become filesystem paths. Return a new immutable snapshot of plain strings/primitives; no shared mutable cached objects. Re-read selected state inside deletion transaction and rely on FK restrictions as the final guard.
- [ ] **Step 5:** Run focused settings/skills tests; commit `feat: manage shared Markdown CV skills`.

### Task 3: Provider-neutral AI requests and immutable job settings

**Files:** Create `src/lib/ai/{types,anthropic,openai}.ts`, `tests/ai-openai.test.ts`, `tests/ai-snapshots.test.ts`; modify `src/lib/ai.ts`, jobs/checks/CV/extraction/email services, existing affected tests, `package.json`, `package-lock.json`, `.env.example`.

**Interfaces:**
- `AiContent = string | ({type:"text";text:string}|{type:"document";source:{type:"base64";media_type:"application/pdf";data:string}})[]`.
- `AiRequest<T> = {schema:z.ZodType<T>;system:string;content:AiContent;effort?:"low"|"medium"|"high";maxTokens?:number;ai?:AiSelection}`.
- `askJson<T>(account:Account,opts:AiRequest<T>,clients?:{anthropic?:Anthropic;openai?:OpenAI}):Promise<T>`; account still required/active; default AI selection is global, never account.aiModel. SDK injection remains test-only call dependency injection, not product UI.
- Adapter functions `askAnthropic<T>(selection:AiSelection,request:AiRequest<T>,client?:Anthropic):Promise<T>` and `askOpenAi<T>(selection:AiSelection,request:AiRequest<T>,client?:OpenAI):Promise<T>` return schema-validated data or AiError. Put shared AiError in provider-neutral types and re-export from existing ai.ts to avoid import cycles.
- Add optional final `ai?:AiSelection` to `extractJob`, `runChecks`, `parseCv`, `classifyEmail` for related-job propagation. Public server actions do not accept snapshots from client input.

- [ ] **Step 1:** Recheck official Responses structured-output/PDF docs and installed SDK options before coding. Add mocked adapter tests for text/PDF translation, schema validity, refusal, missing/incomplete output, token truncation, API failures and maxTokens range 1–16000. Assert OpenAI `store:false`, no Anthropic beta/fallback parameters, and no provider failover on failures.
- [ ] **Step 2:** Write deferred multi-call tests: owner changes global provider/model while capture extraction→checks, standalone match→scam checks, CV parsing or a Gmail sync is pending; all calls in that logical operation use its original selection. A member's legacy aiModel cannot alter requests.
- [ ] **Step 3:** Run new tests and confirm failures; install only the official OpenAI Node SDK and update the lockfile using the package manager. Never run npm audit fix or unrelated dependency upgrades.
- [ ] **Step 4:** Implement adapters. Preserve Anthropic options/error checks, normalize provider errors without logging/returning SDK request objects or secrets. OpenAI uses Responses structured output/Zod helpers and base64 PDF input_file; unsupported model/capability fails explicitly. Omit OpenAI reasoning effort by default because arbitrary owner-selected models may not support it; do not add an unverified name-based capability heuristic.
- [ ] **Step 5:** Capture global selection before the first await at captureJob/retryExtraction, standalone runChecks, startCvParse and each account's syncInbox cycle; pass it through nested askJson calls. Tailoring uses Task 4's atomic skill+AI setup. Remove effective reliance on per-user aiModel while retaining legacy JSON for migration.
- [ ] **Step 6:** Run focused adapters/snapshot and existing AI/service tests; commit `feat: support OpenAI and Claude with global model selection`.

### Task 4: Compose selected skills and save per-version provenance

**Files:** Modify `src/lib/tailor/tailor.ts`, `src/lib/prompts.ts`, `src/components/tailor-panel.tsx`, `src/app/app/jobs/[id]/page.tsx`; create `tests/tailor-skills.test.ts`; modify `tests/tailor.test.ts`, `tests/account-isolation.test.ts`.

**Interfaces:**
- `composeTailorInstructions(setup:TailorSetup):string` returns protected requirements then labeled primary and optional additional bodies, with explicit requirement precedence and additional-as-style-refinement.
- `GenerationMetadata = {provider:AiProvider;model:string;primary:SkillSnapshot;additional:SkillSnapshot|null}` stored in private generation_metadata.data_json.
- `GenerationSummary = {provider:AiProvider;model:string;primary:Omit<SkillSnapshot,"body">;additional:Omit<SkillSnapshot,"body">|null}`. `TailoredVersion` gains `generation:GenerationSummary|null`; existing versions have null. `getTailored` reads via LEFT JOIN in caller's account DB and explicitly strips instruction bodies before returning browser-facing versions. Full snapshots stay in private storage. PDF route remains account-scoped.
- TailorPanel receives `effectiveAi` from getEffectiveAiSummary and shows provider/model/skill names read-only plus per-version provider/model and skill revision labels. Do not send full skill bodies to the client unless an explicit owner editor/export request needs them.

- [ ] **Step 1:** Write tests for protected/primary/additional order, only tailoring using skills, absent additional, current language/factual constraints, and guard rejection of fabricated company/title/dates/numeric claims. Defer provider response while owner edits/unselects/deletes a skill and changes model; assert output and saved metadata retain original AI and both skill bodies/revisions.
- [ ] **Step 2:** Test old versions show null metadata; failed AI/guard/PDF/metadata write saves no partial new version; same numeric job/version in another account cannot access provenance or PDF. Metadata revisions match actual instructions sent to the provider.
- [ ] **Step 3:** Run `npm test -- tests/tailor-skills.test.ts tests/tailor.test.ts tests/account-isolation.test.ts`; require new-feature failures.
- [ ] **Step 4:** Snapshot setup at tailorJob entry before awaits. Build prompt from protected requirements plus saved skill strings; invoke askJson with snapshotted ai. Save PDF/result/event/provenance in one private DB transaction. Preserve existing PDF rendering and Master CV professional-skills editing. Return only provenance summary in browser props; keep full bodies server-side in stored metadata.
- [ ] **Step 5:** Run focused tailoring/guard/isolation tests; commit `feat: apply shared CV skills and record generation metadata`.

### Task 5: Owner configuration and Markdown editor UI

**Files:** Create `src/app/app/settings/ai-actions.ts`, `ai-card.tsx`, `skills-card.tsx`, `src/app/api/skills/[id]/route.ts`, `tests/ai-admin.test.ts`, `tests/skill-routes.test.ts`; modify Settings page/actions and related tests.

**Interfaces:** All mutations return `{ok:true}|{ok:false;error:string}` (create/update may also return saved skill) and call requireSession themselves before owner authorization. Actions: `saveAiConfigAction(input)`, `createSkillAction(input)`, `updateSkillAction(input)`, `deleteSkillAction(id,revision)`, `importSkillAction(formData)`, `selectSkillsAction(input)`. Validate each payload with Zod on the server and use expected revisions from Task 1/2.

- [ ] **Step 1:** Write direct-action tests proving members cannot save provider/model, upload/edit/delete/select shared skills or export bodies via guessed IDs. Test absent session, stale revision, missing provider key, malformed filename/body/selection and oversized/invalid UTF-8 import. Assert failed actions preserve current global settings.
- [ ] **Step 2:** Run new admin/route tests; require failure before implementation.
- [ ] **Step 3:** Add owner-only AI card: provider select, bounded model ID field, configured/missing key statuses, effective setting and pending/error/success state. No API key input. Remove per-user aiModel field and ignore/reject forged aiModel in saveGeneral server action.
- [ ] **Step 4:** Add owner-only skills card with filename list, explicit Create/Edit/Save/Delete, .md import, Download, revision-conflict recovery and two selection controls (Primary required; Additional None or one distinct skill). Plain textarea editor; no raw HTML preview. Block selected deletion both in UI and server; preserve unsaved text on errors. Use existing components and accessible labels, responsive desktop/mobile layout.
- [ ] **Step 5:** Implement owner-authenticated GET export with text/markdown;charset=utf-8, safe Content-Disposition filename, no-store caching and no filename-to-filesystem access. Members see effective AI/skill summary read-only; no management controls or full skill bodies in rendered props.
- [ ] **Step 6:** Run focused admin/export/settings/tailor tests and type check; commit `feat: add owner AI settings and CV skill editor`.

### Task 6: Final verification, documentation and local runtime

**Files:** Modify README/.env.example and relevant regression tests; maintain `.superpowers/sdd/2026-10-19-ai-provider-skills/progress.md` and report.

- [ ] **Step 1:** Document OPENAI_API_KEY setup, owner-only global settings, model account/capability limits, shared costs, primary/additional behavior, Markdown import/export limits, protected factual rules, new-result-only changes and whole-directory backup. Explain coordinated database/image rollback; never suggest rotating APP_SECRET.
- [ ] **Step 2:** Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` and isolated `docker compose build`; inspect outputs. If known local Turbopack helper-port EPERM recurs, record it and verify default Docker build plus local webpack production build. Confirm npm ci succeeds with the updated lockfile.
- [ ] **Step 3:** Run scratch containers with fake provider keys/test identities. Browser-test owner CRUD/import/export and selection, missing-key/provider errors and member read-only UI at desktop/mobile widths. Mock actual provider network responses for generation checks; never spend real API credits in automated tests. Verify PDF/health/worker and existing account isolation.
- [ ] **Step 4:** Inspect one batched screenshot set; fix concrete defects once and confirm. Review full diff for protected prompts, snapshot boundaries, stale-edit/selection races, metadata privacy and schema rollback compatibility. Write exact test/command evidence and limits in report.
- [ ] **Step 5:** Commit `docs: document provider switching and Markdown skills`.

### Task 7: Backed-up production deployment

**Files:** Server `/srv/jobtracker`, private timestamped backup and retained prior images; ignored deployment report. Keep deployed Anthropic active unless owner separately switches it.

- [ ] **Step 1:** Build the verified commit separately on naspad-server while current app runs. Record old commit/image IDs and confirm current tree clean. Preserve keys and APP_SECRET; do not require OPENAI_API_KEY for the existing Anthropic provider.
- [ ] **Step 2:** Stop web and worker; make a root-only full-data/.env backup before registry/account version changes, recording schema versions and safe hashes/counts for existing owner data and sessions. Deploy new images/code only after backup verification.
- [ ] **Step 3:** Verify local/public health, worker account cycles, owner Google session, existing CV/jobs/Gmail/PDF preservation and owner AI/skills controls. Confirm seeded active provider/model and primary match migration expectations. Owner can now configure OpenAI after adding its server key.
- [ ] **Step 4:** If cutover fails, stop writers and preserve new data separately before restoring the complete matched backup with prior images/code/env. Do not run older registry code against v2. If user writes occurred after cutover, retain them and report reconciliation needs rather than silently discarding them.
- [ ] **Step 5:** Record deployed commit, backup path, runtime checks and owner confirmation. No Git push or real AI request without separate authorization. Explain where to choose provider/model and manage the two skill slots.

## Self-review and handoff

All approved spec sections map to Tasks 1–7. Review Focus has matching tests. Explicit adapter/snapshot types prevent provider leakage into callers; owner revision checks and foreign keys cover concurrent edits/selections/deletions. Full bodies remain private server metadata while UI gets provenance summaries. OpenAI model is explicit, not guessed; deployment retains current Claude configuration.

The design is approved; this plan awaits owner review. Recommend implementing inline in the existing chat because provider snapshot propagation and shared-policy changes touch the same services and benefit from one consistent implementation context. No application or production changes have been made during planning.
