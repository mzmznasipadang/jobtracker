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
6. If Google login fails, stop the new containers, restore the previous image/config and restart. Preserve the new registry/member files for recovery. Do not leave the owner locked out while debugging.

## Backups

`data/jobtracker.db` holds existing owner data; `data/accounts.db` holds account approvals, identities and sessions; `data/users/<id>.db` holds each member's data. SQLite uses WAL. Back up **all files** consistently, together with `.env` (which contains the key needed to decrypt Gmail tokens).

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
