# Owner AI configuration and Markdown CV skills

## User intent and decisions

Extend the deployed multi-account JobTracker so the owner/superuser can choose OpenAI or Anthropic Claude and set the model for every account. Add Create, Read, Update and Delete for Markdown instruction skills such as resume-tailor.md, rather than professional skills listed on a CV.

Confirmed permissions: only the owner manages the shared skills. One active primary skill plus one additional skill applies to everyone. Design interpretation for review: the primary slot is required; the additional slot is optional, allowing either one or two selected skills. There is no per-member provider/model or skill override.

Owner remains owner@example.com. Existing Google sign-in, approval-only membership, private account databases, Gmail connections and public-data boundaries remain intact. No email or application sending is introduced.

## Approach

Keep askJson as the shared AI entry point and add provider-specific adapters behind it. The owner chooses a global provider and model in Settings. Store global configuration and the Markdown skill library in the shared account registry; retain CVs/jobs/results in their existing private databases.

Use one Markdown library rather than executable plugin packages or per-user file systems. Skills are plain-text generation instructions, not code or tools. There is no filesystem access, shell execution, automatic skill download or remote include processing.

Alternatives considered: per-user providers/skills contradict the requested owner control; separate applications for each provider would duplicate parsing, validation and UI. A shared request interface with small adapters preserves the existing workflows and tests.

## Global provider and model

- Add an owner-only AI configuration panel with Provider (Anthropic Claude / OpenAI), Model ID and Save. Display which provider credentials are configured, never their values.
- Credentials remain server environment variables: existing ANTHROPIC_API_KEY and new OPENAI_API_KEY. Members never supply or see API keys. Missing credentials block selecting that provider with a clear message; the current saved configuration stays active.
- Model ID is an explicit nonempty bounded string chosen by the owner. Provider model availability varies by API account, so do not hard-code a promise that every model works. Reject unsupported capability/API responses clearly instead of silently switching providers or using another model.
- Start with Anthropic and the owner's existing aiModel setting (default claude-opus-5-5), preserving current behavior. OpenAI stays opt-in until OPENAI_API_KEY and its Model ID are configured. No speculative OpenAI model default is needed.
- Remove the editable per-account AI model field. Existing legacy aiModel JSON can remain for migration compatibility, but member submissions cannot alter effective provider/model. The owner setting governs capture extraction, CV parsing, matching/scam checks, email classification and tailoring for all accounts.
- Resolve configuration when a logical job begins and pass an immutable snapshot through its AI calls. An owner change applies to newly started jobs; an in-flight capture/check/tailor/sync does not mix providers/models midway.
- Keep current Anthropic behavior unless changes are required for provider parity. OpenAI uses the Responses API, structured output with the existing Zod schemas, and compatible text/base64 PDF input. Both adapters produce the same validated application types and normalize refusal, truncation, schema/parse failures and API errors into AiError.
- Keep a maximum of 16000 generated tokens per non-streaming call. Map reasoning effort only where the chosen provider/model supports it; do not blindly send Anthropic-only beta/fallback options to OpenAI.
- Use store:false for OpenAI Responses. No automatic provider failover: changing where users' CV/email data is sent is an explicit owner decision.
- The UI says which provider processes new requests and that the owner pays its API usage. No billing subsystem, automatic benchmark or per-user quota is added.

## Markdown skill library

- Owner can create a skill with a unique .md filename and Markdown body, view/read it, edit/save it, and delete an unused skill. Offer .md import/export so existing instruction files can be reused without editing the server.
- File names are labels, never filesystem paths. Require a bounded basename ending in .md; reject separators, traversal, blank names and case-insensitive duplicates. Body is nonempty UTF-8 Markdown, capped at 64 KiB per skill. Reject invalid encoding/oversized uploads server-side before persistence.
- Keep editing as plain text in the existing styled textarea, not unsanitized HTML rendering. No Markdown preview dependency or code execution.
- Seed resume-tailor.md from the existing editable tailoring/style/cover-letter/form-answer guidance so upgrading preserves output behavior. Keep schema rules, factual constraints and job/CV input boundaries in protected application prompts and the existing guard.
- Store an integer revision on each skill and increment on changes. Detect stale edits (expected revision mismatch) so two owner tabs cannot silently overwrite each other. There is no separate version-history UI in this release.
- Owner selects Primary skill (required) and Additional skill (None or one distinct skill), then saves the pair atomically. Maximum two active skills, with no duplicate selection.
- Selected skills cannot be deleted. Owner must first replace the primary slot or clear/replace the additional slot. This prevents dangling selections and unnoticed fallback behavior. Unused skills can be deleted normally.
- Both slots refer to saved skill IDs, never arbitrary paths or unsaved editor content. Deletion of other skills does not change active configuration.

## Instruction composition and boundaries

- Skills affect tailoring output: CV wording/selection/order, cover letter and generated form answers. They do not alter CV extraction, job extraction, scam/match evaluation, Gmail classification or the worker schedule.
- Compose the tailoring system instructions as protected application requirements, then labeled primary Markdown, then labeled optional additional Markdown. For style conflicts the additional skill refines the primary; neither may override the protected output schema, factual rules or selected language.
- Keep company, title and dates sourced from the master CV and preserve the existing numeric/source guards. Skills cannot authorize inventing experience, expanding access to other accounts, sending email or submitting applications.
- Markdown can customize phrasing/formatting inside the generated content; it does not execute arbitrary HTML/CSS, replace the Chromium PDF renderer or change the application's output schema. Distinguish editable generation guidance from unsupported document-layout code in helper copy.
- Capture both skill IDs, filenames, revisions and bodies at the start of tailoring, together with provider/model. Updating/deleting a skill or changing the selected pair during generation cannot change that in-flight result.
- Existing tailored versions and their PDFs remain unchanged. Store generation metadata (provider, model, skill filenames/revisions and instruction snapshots) alongside each new private tailored version so the owner/member can identify which setup produced it. Metadata does not expose keys or other accounts' data. Existing versions display metadata as unavailable rather than fabricated defaults.

## Data and migrations

- Version the registry migration from the current schema without losing accounts, approvals, Google subjects, sessions or in-progress OAuth states. Add global configuration and skill tables; initialize default provider/skills idempotently.
- Global configuration is owner-managed application state, separate from each user's profile/preferences. Every mutating server action checks requireSession and owner role itself; UI hiding alone is insufficient.
- Keep per-user results private. Extend private databases with a small generation-metadata table keyed to tailored job/version, using a versioned additive migration. Do not move or rewrite existing CVs/jobs/PDFs.
- Private metadata writes occur transactionally with the tailored result. No successful PDF/version is saved with metadata for a different model/skill snapshot.
- Preserve APP_SECRET and all provider/OAuth keys during migration. Back up the complete data directory and .env before production cutover.
- Because the registry/data versions advance, rollback requires a coordinated restore of the prior database backup and prior images/config, not merely restarting an older image against a newer registry. Preserve the new directory separately before restoring; account for any post-cutover writes before rollback.

## Interface and permissions

- Owner Settings gains AI configuration, a skills list/editor, and primary/additional selection controls in the incumbent design. Existing Account access management stays available.
- Members see the effective provider/model and selected skill names as read-only information near tailoring. They cannot edit provider/model, skill contents, or shared selections, including by directly invoking server actions.
- Keep the professional-skills editor in each person's Master CV unchanged; it is unrelated to these Markdown instruction skills.
- Revalidate settings after owner saves. Validate provider names, model/body/filename limits, revisions, skill existence and slot distinctness on the server.
- Use safe generic errors; never return API keys, raw provider errors containing request headers, CV contents or system secrets to other accounts or logs.

## Verification

- Upgrade fixtures from the deployed registry/account schemas: accounts, sessions, owner CV/jobs/settings, Gmail tokens and existing PDFs survive; default Claude/model and primary skill are initialized exactly once.
- Owner can change global provider/model; member calls cannot. A member's legacy aiModel value cannot bypass global settings. Missing API key or invalid configuration does not change the current saved selection.
- Mock both providers: identical schema validation for text and PDF inputs, correct provider-specific options, refusals, incomplete/token-limit output and network/schema failures. Automated tests never call real AI APIs.
- Test filename/path/encoding/body boundaries, duplicate names, stale revisions, selected-skill deletion rejection, two-slot atomicity and same-skill rejection.
- Test in-flight work against provider/model and skill edits/deletions/selection changes; every result uses the original snapshot and records matching metadata.
- Test primary then additional composition with immutable truth/schema rules. Custom instructions cannot make the application store fabricated company/title/dates or bypass guards.
- Verify account isolation for metadata/PDF access and no member can invoke management mutations. Existing job/capture/Gmail/CV tests remain green.
- Run full suite, lint/type checks, production Docker build, real Chromium smoke and owner/member browser checks. Deploy a verified release with consistent backup and verify existing data plus owner controls.
- Keep Claude active at deployment unless the owner explicitly chooses OpenAI. A live OpenAI call is optional and requires configured credentials plus owner-authorized API usage; mocked parity tests do not imply a model is available to that API account.

## Official OpenAI references checked

- Structured Outputs and Zod validation: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses
- PDF/file inputs: https://developers.openai.com/api/docs/guides/file-inputs

## Review status

Owner approved the written design on 2026-10-19 ("Go ahead"). Implementation plan: docs/superpowers/plans/2026-10-19-ai-provider-skills.md. No application code, model selection or production configuration changed during planning.
