# JobTracker

Approval-only multi-account Next.js 16 job tracker for naspad-server, served at https://tracking.naspadstudio.id through a cloudflared tunnel. Capture jobs, prepare tailored CVs and cover letters, track applications and sync Gmail replies. Phase 1 never sends email or submits applications; keep `DRY_RUN=true`.

## Local development

Use Node.js 22 or newer (the Docker image provides Node 24.21.0).

```bash
npm i
cp .env.example .env
npx playwright-core install chromium
```

Generate `APP_SECRET` with `openssl rand -hex 32`. Set `OWNER_GOOGLE_EMAIL=owner@example.com` (or your own owner Google email for a new installation), `ANTHROPIC_API_KEY`, and the shared Google credentials below. Leave `APP_URL=http://localhost:3000` for development. Never commit `.env` or secrets. Keep `APP_SECRET` unchanged when upgrading: existing Gmail tokens are encrypted with it.

Run in separate terminals:

```bash
npm run dev
npm run worker
```

Open http://localhost:3000 and choose **Sign in with Google** using the configured owner account. The worker runs one cycle immediately, then every ten minutes. Tests: `npm test`; production build: `npm run build`.

## Dev setup: PDF rendering

Tailored CVs are printed to PDF with Chromium. Install it once locally with `npx playwright-core install chromium` (equivalent to `npx playwright install chromium` when the matching Playwright CLI is installed). Use the CLI matching `playwright-core@1.64.1`; the Docker base image is `mcr.microsoft.com/playwright:v1.64.1-noble`, with browsers in `/ms-playwright`. PDF rendering fetches Google Fonts and falls back to Arial after a three-second offline wait.

## Deploy on naspad-server

Clone the verified multi-account release of this repository from Gitea. Install Docker Engine with Compose and configure cloudflared on the host.

1. Copy `.env.example` to `.env`, fill the shared Google/Claude credentials, `OWNER_GOOGLE_EMAIL` and a random `APP_SECRET` as above, and set `APP_URL=https://tracking.naspadstudio.id` and `DRY_RUN=true`. Register the Google sign-in callback before switching an existing installation to this release.
2. Prepare the bind mount. Both services run as the image's non-root `pwuser` (UID/GID **1001:1001**):

   ```bash
   mkdir -p data
   sudo chown -R 1001:1001 ./data
   sudo chmod 700 ./data
   chmod 600 .env
   ```

3. Deploy or update:

   ```bash
   git pull && docker compose up -d --build
   docker compose ps
   curl -f http://localhost:3100/api/health
   docker compose logs worker
   ```

The health route opens SQLite and returns `{"ok":true}` on success. Both services share `/data/jobtracker.db`, use `Asia/Jakarta`, and restart unless stopped. Web listens only on host loopback port 3100. Chromium runs as `pwuser`; no additional `--no-sandbox` flag is configured.

Configure the tunnel's ingress (retain its final fallback rule):

```yaml
ingress:
  - hostname: tracking.naspadstudio.id
    service: http://localhost:3100
  - service: http_status:404
```

Point the hostname's DNS at this tunnel and restart cloudflared. This loopback address assumes cloudflared runs on naspad-server itself. Stop the app with `docker compose down`; the bind-mounted data remains.

## Google sign-in and Gmail connection

1. Open Google Cloud Console and create/select a project.
2. Enable **Gmail API** in APIs & Services → Library.
3. Configure the OAuth consent screen (Google Auth Platform): audience **External**, your app name and contact details. Add basic identity scopes `openid`, `email`, `profile`, plus these Gmail scopes under Data Access:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
4. Create one OAuth client of type **Web application** for the whole site. Add these exact authorized redirect URIs:
   - `https://tracking.naspadstudio.id/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
   - `https://tracking.naspadstudio.id/api/gmail/callback`
   - `http://localhost:3000/api/gmail/callback`
5. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; recreate the containers after changing env values.
6. Publish the consent screen to **In production**. Publishing removes Testing-mode token restrictions but does not verify the app. Gmail access uses restricted/sensitive scopes: Google may require app verification, show an unverified-app warning, or impose user limits. Basic sign-in requests identity scopes only.
7. Sign in as the owner, then open **Settings → Connect Gmail** if you want inbox syncing. For your own unverified app, accept Google's unverified-app warning once and grant the requested access. The send scope is reserved for phase 2; phase 1 never sends email.

### Outlook → Gmail forwarding

While moving job-site accounts to Gmail, enable automatic forwarding from Outlook to the connected Gmail account so replies to older applications arrive there too. Enter the original Outlook address in JobTracker Settings. The matcher reads the original sender in forwarded messages. Optionally keep a copy in Outlook.

## Bookmarklet

In Settings, drag **Send to JobTracker** to your browser's bookmarks bar. Open a job posting and click the bookmark; it opens the capture form with the URL and page text. Review and press **Capture**. If the site blocks the window handshake, the bookmarklet copies the content instead; paste it into the capture form.

## Shared AI provider and Markdown CV skills

The owner manages **Settings → AI provider and model** for everyone. Choose Anthropic Claude or OpenAI and enter a model ID available to that API account. The selected model must support structured output and PDF input for CV uploads; unsupported models fail clearly without silently changing providers. Configure keys on naspad-server first:

```bash
ssh root@naspad-server
cd /srv/jobtracker
nano .env
# Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY; keep APP_SECRET unchanged.
docker compose up -d --force-recreate
```

Keys stay in the server environment; the UI displays configured/missing status only. New installations and upgrades keep Anthropic and the owner's existing model until the owner changes them. Members cannot override the shared provider/model. Existing requests keep the configuration they started with. All approved users share the selected provider's usage costs. OpenAI requests use `store:false`.

Under **CV instruction skills**, the owner can create, read/edit, import, download and delete Markdown writing instructions. Filenames must be simple `.md` basenames (maximum 100 characters), bodies valid nonempty UTF-8 (maximum 64 KiB). A default `resume-tailor.md` retains the existing writing guidance. Select one primary skill and optionally one distinct additional skill, then save the pair. Selected skills cannot be deleted until replaced or cleared. Revision checks reject conflicting edits; saving errors keep the editor text so you can reconcile it with the latest saved revision.

Skills guide tailored CVs, cover letters and form answers. They do not change parsing, matching, scam checks, Gmail classification, application schemas or factual guards; they do not run code or replace the PDF layout. Everyone uses the same selected pair. Professional skills listed in each person's Master CV remain separate and private.

Each new tailored version records provider/model and both skill revisions/instruction snapshots in that account's database. The UI shows a summary; older versions show generation details as unavailable. Changing a skill does not alter old results or an in-flight generation. No real AI calls are made by automated tests.

This release advances registry and account database versions. **Rollback must restore the complete matching data/.env backup together with the previous images and code.** Stop writers and preserve the newer data directory first; do not silently discard post-cutover writes or start the prior registry implementation against the upgraded database.

## Accounts and access

The owner signs in with the configured Google email and opens **Settings → Account access** to approve another person's Google email. They visit `/login` and select **Sign in with Google**. They never need to create a Google Cloud project or supply OAuth credentials. Gmail connection is optional and uses the same shared OAuth app, with a separate consent/token for each person. The connected mailbox is displayed in Settings and can differ from the sign-in account.

Each account has separate CVs, jobs, email and settings. The owner's account-management view shows approval state, not other users' private content. Revoke access to invalidate existing sessions immediately; restore access to allow a new sign-in without deleting their data. Only the owner's opt-in aggregates appear on the public home page; member accounts stay private.

All approved accounts share the server's Claude API key and its usage costs. Phase 1 never sends email or applications. `ADMIN_PASSWORD_HASH` and password login are no longer used. Old shared-password sessions are invalid after the upgrade.

## Upgrading the existing single-user installation

1. Register the new `/api/auth/google/callback` URLs in the existing Google Web OAuth client. Keep `/api/gmail/callback` registered too.
2. Build the verified image before downtime. Record the current image IDs/commit and retain them for rollback.
3. Stop web and worker, then make a root-only backup of the **whole** data directory and `.env` as described below.
4. Set `OWNER_GOOGLE_EMAIL=owner@example.com`. Preserve `DB_PATH`, `APP_SECRET` and all existing API/OAuth credentials. Do not change the owner email after the registry is created.
5. Recreate the containers. The existing database remains the owner's file; registry initialization does not move or clear its data. Sign in as the owner and verify existing jobs, CV, settings and Gmail status before approving anyone else.
6. If upgrade verification fails, stop both services, preserve the new data directory separately, restore the complete pre-upgrade data/.env backup and previous image/code, then restart. Preserve the new registry/member files for recovery. Do not leave the owner locked out while debugging.

## Backups

`data/jobtracker.db` holds existing owner data; `data/accounts.db` holds account approvals, identities, sessions, shared AI configuration and Markdown skills; `data/users/<id>.db` holds each member's data. SQLite uses WAL. Back up **all files** consistently, together with `.env` (which contains the key needed to decrypt Gmail tokens).

On naspad-server as root:

```bash
cd /srv/jobtracker
backup_dir="/root/jobtracker-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
docker compose stop web worker
cp -a data "$backup_dir/data"
cp -p .env "$backup_dir/.env"
docker compose start web worker
```

For a live backup, SQLite `.backup` can copy a single database consistently, but does not coordinate the registry and every account database. Use the stopped-services procedure for a complete installation backup. Keep backups private; they contain CVs, emails, tokens and API keys.

To restore, stop both services, preserve the current data directory separately, restore the complete backed-up directory and matching `.env`, and set data ownership to `1001:1001` before starting the verified release. Do not mix old main database files with newer `-wal`/`-shm` files.

## Workflow: capture, review and PDF

On mobile, copy the posting URL and full description (including company/title) into New job. When a server cannot fetch a posting, the form keeps your input and asks for pasted text. Review job details after extraction; missing fields and missing master CV are shown beside Generate draft. Manual corrections do not call AI. Retrying extraction after manual edits requires confirmation to replace those details.

Generate draft creates an editable application without a PDF. Review the summary, included experience/project bullets, selected skills, cover letter and answers; save changes and check the accuracy acknowledgement before Generate PDF. Source employers/dates/contact facts come from the master CV snapshot; change those in Settings and generate another draft. Drafts retain their original provider/model/skill revisions. Existing PDF versions stay available. Each saved version offers separate CV and cover letter PDF downloads. The cover letter PDF uses that version’s saved letter and contact details, including for older versions. Saving and PDF export do not consume AI requests. Unsaved drafts warn before leaving through links or closing the page.

## Archive and 30-day deletion

Archive hides a job from the active pipeline, email matching and follow-up processing. Use the Archive view to restore it before its deletion deadline. Its original status, notes, draft and PDFs return on restore. Exactly 30 days (30 × 24 hours, UTC) after archiving, restore and document access stop; the ten-minute worker permanently removes the expired job and related application files on its next cycle, including for revoked users. Gmail messages are never deleted. Archive alone preserves historical metrics; permanent deletion removes the application from them. Delete job remains an immediate permanent option.

This is deletion from the live database, not secure erasure of SQLite pages or root-private backups. Existing deployment backups remain owner-managed; review their retention separately. When restoring a full backup, stop both services, restore matching code/images/data/environment, then run expiry cleanup **before** exposing the restored app:

```sh
docker compose run --rm --no-deps web ./node_modules/.bin/tsx -e 'import {listMaintenanceAccounts} from "./src/lib/accounts"; import {purgeExpiredJobs} from "./src/lib/archive"; for (const account of listMaintenanceAccounts()) purgeExpiredJobs(account);'
docker compose up -d --no-build
```

Migrations require a coordinated full data/environment backup with both writers stopped. Roll back code/images and their matching full data snapshot together; preserve failed upgraded data separately. Older images cannot read newer schemas safely.

## Owner AI usage controls

Settings → AI usage and allowances shows per-user requests, provider/model/operation breakdowns, reported tokens and estimated USD costs. The owner can pause AI globally or per user, set default/per-user monthly allowances and set an override for a particular UTC calendar month. Blank allowance means unlimited; zero blocks new requests. Defaults remain unlimited and unpaused. Members see only their own usage. A period override takes precedence over the normal per-user/default allowance; it does not bypass a pause.

Each upstream attempt reserves allowance before dispatch, including requests from background Gmail classification. Failed/refused/malformed responses and timeouts count once dispatched. SDK automatic retries are disabled; an explicit retry counts separately. Reservations with unknown outcome after a crash remain counted. Requests proven cancelled before dispatch do not count. A multi-call workflow may stop at the limit while retaining its saved inputs/results; manual draft edits and PDF export remain available. Existing usage before this release is not reconstructed.

Optional model pricing is entered by the owner in USD per million normal-input, cached-input, cache-write and output tokens. Rates are snapshotted per request. Missing rates or telemetry show unavailable cost and coverage, rather than zero cost; a known subtotal is not a complete bill. Estimates may differ from provider invoices. Limits enforce request counts, not a dollar ceiling. No CV, prompt, job/email contents, credentials or raw provider errors are saved in the usage ledger.
