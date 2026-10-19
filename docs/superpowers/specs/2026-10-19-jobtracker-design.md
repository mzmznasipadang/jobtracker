# JobTracker — Design

Date: 2026-10-19 · Owner: Victor (single user) · Repo: `repo.naspadstudio.id/mzmznasipadang/jobtracker` · Host: naspad-server (Docker) · Public URL: `tracking.naspadstudio.id` (cloudflared tunnel)

## 1. Why

Victor applies to jobs on LinkedIn, JobStreet, Glints, Wellfound, Kalibrr and Dealls, and to freelance work. Today it is manual and the results are poor: many rejections (often salary too high) and a lot of ghosting, with no record of which sites actually pay off. They want one private dashboard that takes a job link, checks it, tailors their CV for it, helps them apply (or applies for them where that is safe), and tracks what happens — plus a public page that shows their per-site results, in the spirit of `monitor.naspadstudio.id` (an Uptime Kuma status page).

Success looks like: pasting a link takes them to a ready-to-send application in a couple of minutes; statuses update themselves from their inbox; after a month the numbers show which sites are worth their time.

## 2. Goals, non-goals, anti-goals

**Goals**
- Pipeline per job: **Capture → Check → Tailor → Apply → Track**.
- Private, password-protected dashboard + settings page.
- Public, read-only results page with per-site metrics.
- Gmail connection that reads replies and moves statuses automatically, and detects ghosting.
- Auto-apply only where it is allowed and safe (phase 2), governed by the rules in §6.
- Branded with the Naspad Studio guideline (§9).

**Non-goals (v1)**
- Multi-user / accounts for anyone but Victor.
- Auto-submitting on LinkedIn, JobStreet, Glints, Wellfound, Kalibrr, Dealls or Upwork (ToS forbid it; ban risk).
- Searching/scraping those sites for jobs. Jobs from them enter only when Victor pastes a link.
- Outlook support (see §7 for the forwarding workaround).
- Push/email notifications; everything surfaces in the dashboard.
- DOCX output.

**Anti-goals (failure even if it "works")**
- Getting Victor's LinkedIn/JobStreet accounts restricted.
- Any CV/cover letter content that isn't true to the master CV.
- Spraying low-fit applications.
- Leaking company names, salaries, CV or emails on the public page.
- Sending a real application or email during development or testing.
- Bypassing CAPTCHAs — if one appears, that job drops to manual.

## 3. Sources and automation levels

| Source | How jobs get in | Apply level |
|---|---|---|
| LinkedIn, JobStreet, Glints, Wellfound, Kalibrr, Dealls | Victor pastes the link | **Prepare** (Victor submits) |
| Jobs whose posting says "send CV to <email>" | Pasted link | **Auto-submit** by email (phase 2) |
| Remote OK, We Work Remotely, Himalayas | Pulled automatically from public feeds (phase 2) | Auto-submit if the apply link is a supported company form without CAPTCHA, else Prepare |
| Freelancer.com | Official API project search (phase 2) | Auto-submit bid via API (phase 2, see open checks) |
| Upwork, Contra, Toptal, Projects.co.id, Sribulancer, Fastwork | Pasted link | Prepare |

- **Prepare** = tailored CV (PDF), cover letter and form answers ready to copy, plus a button that opens the job.
- **Auto-submit** = the app sends it, only when every rule in §6 passes.
- There is no "server fills the form and you click Submit" level: the server's browser isn't visible to Victor, so a form is either fully submitted by the server or prepared for them.

## 4. The pipeline

### 4.1 Capture
- Input: a URL, optionally with pasted job text.
- The server fetches the page and Claude extracts structured fields: company, title, location / remote, employment type, salary range + currency (if shown), requirements, nice-to-haves, how to apply (site button / email address / company form URL), recruiter contact, posting language.
- LinkedIn is usually behind a login wall. Try the public job view first; if extraction fails, the UI asks Victor to paste the description text (one textarea, same flow).
- **Bookmarklet** (v1): from a job page in Victor's own browser, it opens the tracker's capture page and hands over the page URL + visible text. Mechanism is the builder's call; note strict CSP on LinkedIn will block direct `fetch` to another origin, so use a window-open + `postMessage` style hand-off or similar.
- Dedupe by canonical URL; re-pasting an existing job opens it.

### 4.2 Check (runs automatically after capture)
- **Match score 0–100** against the master CV **and the preferences in settings** (target roles, seniority, remote/location, employment type, deal-breakers), with the top reasons, the gaps, and missing keywords. A deal-breaker caps the score.
- **Salary fit**: normalise the listed range to monthly IDR (fixed FX rates and hours/month in settings; yearly ÷ 12), then compare with settings. Result:
  - `below minimum` — top of range < Victor's minimum (hard mismatch).
  - `above range` — top of range ≥ minimum but < Victor's expected (the Dealls/Kalibrr problem; soft warning, negotiate or lower the ask).
  - `ok` — range reaches expected.
  - `unknown — ask early` — no range or "negotiable".
  In v1 salary fit only warns; it never auto-skips a job.
- **Scam risk** `low / medium / high` with reasons, for every source but weighted for Glints. Red flags: Telegram/WhatsApp-only contact, any upfront fee or "training deposit", pay far above market, free-mail recruiter address, vague or unverifiable company, pressure to move off-platform. High risk blocks auto-apply and shows a warning.

### 4.3 Tailor
Runs when Victor clicks **Tailor** on a job (not automatically — keeps cost and control with Victor; my call). Re-running creates a new version.

Produces, per job, without inventing anything not in the master CV:
- Tailored CV, rendered to an ATS-friendly single-column PDF (HTML template printed by headless Chromium).
- Cover letter (short, specific).
- Answers to likely form questions (why this company, notice period, expected salary, work authorisation, etc.) and to any questions Victor pastes in.
- Language follows the posting (English or Bahasa Indonesia) — builder's call to make it overridable.

Prompt guidance is adapted from the Claude skills Victor named: `resume-tailor`, `resume-ats-optimizer`, `tech-resume-optimizer`, `resume-formatter`, `application-form-filler` (and `job-description-analyzer` for the Check step). The builder loads those skills with the Skill tool during implementation and distils their rules into the app's prompts. Every generated version is stored with the job so Victor can see exactly what was sent.

### 4.4 Apply
- Prepare: a "Ready to apply" view per job — open job, copy buttons per answer, download CV PDF, then **Mark as applied**.
- Auto-submit (phase 2): see §6.

### 4.5 Track
- Statuses: `Saved → Ready → Applied → Interview → Offer`, plus `Rejected`, `Ghosted`, `Skipped`.
- Board view (columns by status) and a table view with filters (source, status, score, date).
- Each job has a timeline: status changes, linked emails, what was sent.
- Manual actions on any job: change status, **Replied elsewhere** (for replies via LinkedIn messages, WhatsApp, phone — stops ghost detection), add a note.
- Ghost detection: an `Applied` job with no human reply after N days (default 14, setting) becomes `Ghosted`; at day M (default 7) it gets a "follow up once" flag. Automated "your application was viewed/received" emails do **not** count as a reply.

## 5. Email (Gmail)

- The app connects to Victor's Gmail with its own credentials — the Gmail connection inside Claude does not give the deployed app access.
- **Method (Victor's decision): Gmail API with OAuth**, scopes `gmail.readonly` + `gmail.send` only. Victor creates a Google Cloud project + OAuth client (web), redirect URI `https://tracking.naspadstudio.id/api/gmail/callback`, and sets the consent screen to **In production** (in Testing, refresh tokens expire after 7 days). Settings has a **Connect Gmail** button that runs the consent flow; the refresh token is stored in the DB encrypted with `APP_SECRET` from `.env`. If the token is revoked or fails, settings shows "reconnect" and sync pauses. The builder writes a short setup guide for this in the README.
- First sync backfills 60 days; then poll every ~10 minutes.
- **Privacy scope** (my call): only messages that come from a tracked job's company domain, a known job-board domain (LinkedIn, JobStreet, Glints, Wellfound, Kalibrr, Dealls, ATS senders like Greenhouse/Lever/Workable), mail forwarded from Victor's Outlook, or that hit the hiring keyword rules are stored or sent to Claude. Everything else is ignored and never leaves the server.
- LinkedIn/JobStreet "new message from recruiter" notification emails count as a reply for the matched job. For each new message, try to match it to a job by sender domain, company name and subject.
- Classify matched messages as `rejection`, `interview / assessment`, `offer`, `auto-ack` or `other`: cheap keyword rules first (English and Indonesian, e.g. "unfortunately", "other candidates", "tidak dapat melanjutkan"), Claude for anything ambiguous. Update the status automatically; Victor can override, and an override is never re-overwritten by a later sync.
- Unmatched recruiter-looking emails go to an "Unsorted" list where Victor can link them to a job.
- Phase 2: send email applications (tailored CV attached) via the Gmail API `send`.
- **Outlook transition** (recommendation, no code): while Victor moves job-site accounts to Gmail, set Outlook to auto-forward to Gmail so replies to older applications still arrive. The matcher must look at the original sender of forwarded mail.

## 6. Auto-apply rules (phase 2)

An application is sent automatically only if **all** hold:
1. Auto-apply is enabled globally (kill switch in settings) and for that channel.
2. Match score ≥ threshold (default 80).
3. Salary fit is not `below minimum` / `above range`.
4. Scam risk is `low`.
5. Under the daily cap (default 10/day).
6. The channel allows it (email, Freelancer.com API, supported company form with no CAPTCHA).

Anything that fails goes to the Ready queue with the reason shown. Every auto-sent application is logged with the exact CV version, cover letter, answers, timestamp and channel.

**Dry-run is the default.** Until Victor turns it off in settings, auto-apply only logs "would have sent". The app also honours a `DRY_RUN=true` environment variable that cannot be overridden from the UI; development and test environments always run with it.

## 7. Public results page

- `tracking.naspadstudio.id/` (no login). Look and feel: a clean, branded status-page style like `monitor.naspadstudio.id`.
- Per source: applications sent, response rate, interview rate, ghost rate. Plus overall totals and a simple trend over recent weeks. "Last updated" timestamp.
- Definitions: *response* = any human reply (rejection, interview, offer, or "replied elsewhere"); *ghosted* = §4.5. Rates only count applications older than the ghost window (default 14 days), so recent ones don't drag the numbers down.
- Numbers are aggregated on the server. The public endpoint returns only aggregates — never company names, job titles, salaries, emails or CV data.
- A settings toggle can hide the page.

## 8. Private dashboard and settings

Routes (builder may rename): `/login`, `/app` (overview), `/app/jobs` (board + table), `/app/jobs/:id`, `/app/new` (capture), `/app/inbox` (unsorted emails), `/app/settings`.

**Overview**: pipeline counts, jobs needing action (Ready, follow-up due, new replies), the same per-site metrics as the public page.

**Settings page**
- Profile: name, contact, links (LinkedIn, GitHub, portfolio).
- Master CV: upload a PDF (Claude parses it into structured data) or paste text; then edit the structured CV in the page. This is the single source of truth for tailoring.
- Preferences: target roles, seniority, remote/on-site/hybrid and locations, employment types, deal-breakers (free text list).
- Salary: expected and minimum monthly (IDR), expected rate for remote/USD work, FX rates and hours/month used for normalising.
- Pipeline: ghost days, follow-up days, default CV language.
- Auto-apply (phase 2): global switch, dry-run switch, threshold, daily cap, per-channel toggles, feed keywords, Freelancer bid rules.
- Public page on/off.
- Connections: read-only status of Gmail, Claude API, Freelancer.com (configured / failing, last sync time).
- Secrets (Claude API key, Google OAuth client id/secret, Freelancer token, login password hash, `APP_SECRET`) live in the server `.env`, not in the UI. The one exception is the Gmail refresh token, which arrives at runtime and is stored encrypted (§5).

## 9. Visual design

- Naspad Studio guideline: **Naspad Navy `#272660`** is the primary and most dominant colour; **Sky Blue `#49BCE9`** accent; Pure White `#FFFFFF`; Black `#000000`. Status colours (success/warn/danger) are the builder's call but must sit quietly next to navy.
- Typeface: **Montserrat** (Light, Medium, SemiBold, Bold). Fallback: system sans-serif.
- Logo: `docs/brand/naspad-logo-horizontal.svg` (mark + NASPAD STUDIO wordmark) and `docs/brand/naspad-mark.svg` (mark only, for favicon/compact sidebar). The mark is an embedded PNG (~580 KB): export it to an optimised PNG/WebP at the sizes used rather than shipping the SVG as-is. The wordmark is vector paths in navy — in dark mode render it white (recolour the paths), keep the sky-blue mark. Respect the guideline's clear-space and minimum-size pages.
- Built with **Tailwind CSS + shadcn/ui**, brand colours mapped onto shadcn's theme tokens. Light and dark themes (my call; dark uses navy-based surfaces).
- After the UI is built, review it with the **apple-design** skill (HIG principles: clarity, hierarchy, spacing, accessibility, contrast) and fix what it finds.
- Code follows **Ponytail**: smallest complete change, no speculative abstractions.

## 10. Architecture (builder's calls unless noted)

- **Language**: TypeScript throughout.
- **web** container: Next.js (App Router) serving the UI and the API routes (FE + BE together).
- **worker** container: same image, different command. Runs the scheduled jobs (inbox sync, ghost detection, feed pulls, auto-apply queue) and anything needing headless Chromium (CV PDF rendering, form auto-submit).
- **Database**: SQLite (WAL) on a Docker volume shared by both containers. Single user, low volume — no separate DB server. Back up by copying the file.
- **AI**: Claude via the official `@anthropic-ai/sdk`. Default model `claude-opus-5-5` for every task; model is a setting. Rough cost on Opus 5.5: ~US$0.10–0.20 per tailored application, a fraction of a cent per email classification. Switching cheap tasks (classification, scam check) to `claude-haiku-5-5` is Victor's decision, not a default.
- **Auth** (Victor's decision): app-level single-user password login. Password hash in `.env`, signed HTTP-only session cookie, login rate-limited. Public page and its aggregate endpoint stay open; everything under `/app` and the private API requires the session.
- **Deploy**: `docker compose up -d` on naspad-server; cloudflared routes `tracking.naspadstudio.id` → web container. Timezone `Asia/Jakarta`.
- **Dev process**: Claude Code session with Opus 5.5 as orchestrator; any subagents run on Sonnet or Haiku.

## 11. Phases

**Phase 1 (v1)**: login, settings + master CV, capture (link, paste, bookmarklet), check (match, salary, scam), tailor (CV PDF, cover letter, answers), Prepare-level apply, board/table/timeline, Gmail inbox sync + classification + ghost detection, public results page, Docker deploy.

**Phase 2**: auto-apply engine with §6 rules; email applications; Remote OK / We Work Remotely / Himalayas feeds; Freelancer.com bidding; company-form auto-submit (start with Greenhouse and Lever).

## 12. Open checks for the builder (verify at plan time, don't assume)

- Freelancer.com: does the current API let a personal account place bids programmatically, and what are its limits?
- Greenhouse / Lever / Ashby public application forms: which can be submitted by a headless browser without CAPTCHA or employer keys?
- LinkedIn public job view: how often does extraction work without login?
- JobStreet, Glints, Kalibrr, Dealls, Wellfound: does a plain server fetch return the job content, or is it client-rendered/blocked?

## 13. Defaults taken without Victor's answer (change if wrong)

- **No import of past applications** in v1; the public page starts from zero. A CSV import can be added later.
- **Images are built on naspad-server** (`docker compose up -d --build` after `git pull`); no Gitea Actions in v1. Victor adds the `tracking.naspadstudio.id` → web container route to cloudflared on the server.
