# JobTracker

Single-user Next.js 16 job tracker for naspad-server, served at https://tracking.naspadstudio.id through a cloudflared tunnel. Capture jobs, prepare tailored CVs and cover letters, track applications and sync Gmail replies. Phase 1 never sends email or submits applications; keep `DRY_RUN=true`.

## Local development

Use Node.js 22 or newer (the Docker image provides Node 24.21.0).

```bash
npm i
cp .env.example .env
npx playwright-core install chromium
npm run hash-password
```

The password script reads stdin: type your password, press Enter, then Ctrl-D. Copy its `scrypt:<salt>:<hash>` output into `ADMIN_PASSWORD_HASH` in `.env`. Generate `APP_SECRET` with `openssl rand -hex 32`. Set `ANTHROPIC_API_KEY`, and the Google credentials below; leave `APP_URL=http://localhost:3000` for development. Never commit `.env` or secrets.

Run in separate terminals:

```bash
npm run dev
npm run worker
```

Open http://localhost:3000 and sign in. The worker runs one cycle immediately, then every ten minutes. Tests: `npm test`; production build: `npm run build`.

## Dev setup: PDF rendering

Tailored CVs are printed to PDF with Chromium. Install it once locally with `npx playwright-core install chromium` (equivalent to `npx playwright install chromium` when the matching Playwright CLI is installed). Use the CLI matching `playwright-core@1.64.1`; the Docker base image is `mcr.microsoft.com/playwright:v1.64.1-noble`, with browsers in `/ms-playwright`. PDF rendering fetches Google Fonts and falls back to Arial after a three-second offline wait.

## Deploy on naspad-server

Clone this repository from Gitea and check out `feat/phase-1`. Install Docker Engine with Compose and configure cloudflared on the host.

1. Copy `.env.example` to `.env`, fill the credentials, password hash and a random `APP_SECRET` as above, and set `APP_URL=https://tracking.naspadstudio.id` and `DRY_RUN=true`. If Node is unavailable on the host, generate the password hash on your development machine.
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

## Gmail connection

1. Open Google Cloud Console and create/select a project.
2. Enable **Gmail API** in APIs & Services → Library.
3. Configure the OAuth consent screen (Google Auth Platform): audience **External**, your app name and contact details. Add these exact scopes under Data Access:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
4. Create an OAuth client of type **Web application**. Add both authorized redirect URIs:
   - `https://tracking.naspadstudio.id/api/gmail/callback`
   - `http://localhost:3000/api/gmail/callback`
5. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; recreate the containers after changing env values.
6. Publish the consent screen to **In production**. A test user is not needed once published; leaving an External app in Testing causes short-lived refresh tokens.
7. In JobTracker, open **Settings → Connect Gmail**. For your own unverified app, accept Google's unverified-app warning once and grant the requested access. The send scope is reserved for phase 2; phase 1 never sends email.

### Outlook → Gmail forwarding

While moving job-site accounts to Gmail, enable automatic forwarding from Outlook to the connected Gmail account so replies to older applications arrive there too. Enter the original Outlook address in JobTracker Settings. The matcher reads the original sender in forwarded messages. Optionally keep a copy in Outlook.

## Bookmarklet

In Settings, drag **Send to JobTracker** to your browser's bookmarks bar. Open a job posting and click the bookmark; it opens the capture form with the URL and page text. Review and press **Capture**. If the site blocks the window handshake, the bookmarklet copies the content instead; paste it into the capture form.

## Backups

SQLite uses WAL: copying only the main database while writers run can miss recent changes. For a plain file backup, stop both services (including the worker), copy `data/jobtracker.db`, then restart:

```bash
docker compose stop web worker
sudo cp data/jobtracker.db /path/to/backups/jobtracker.db
docker compose start web worker
```

Alternatively take a consistent live backup with the host's SQLite CLI:

```bash
sudo sqlite3 data/jobtracker.db ".backup '/path/to/backups/jobtracker.db'"
```

Keep backups private; they contain CVs, email and job details. To restore, stop both services, preserve the old data directory, restore the backup as `data/jobtracker.db` into a fresh directory (without stale `-wal`/`-shm` files), set ownership to `1001:1001`, then start the services.
