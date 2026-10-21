# Open beta launch checklist

Implementation adds `/beta` and conditional Google registration. This document does not enable registration or deploy the application.

## Deployment configuration

- [ ] Deploy the reviewed version with `APP_URL=https://tracking.naspadstudio.id`.
- [ ] Confirm Google permits the exact redirect URI `https://tracking.naspadstudio.id/api/auth/google/callback`.
- [ ] Confirm the Google OAuth project's audience/publishing status permits the intended public users. Basic sign-in requests only `openid email profile`.
- [ ] Review optional Gmail consent and any required Google verification separately. Basic sign-in does not request Gmail access.
- [ ] Review the drafted `/privacy` and `/terms` pages and docs/legal/launch-review.md before deployment. Both pages are linked from beta/sign-in; confirm operator identity, provider arrangements, and the manual deletion/backup process before publication.
- [ ] Confirm the operator can fulfill deletion requests sent to `hello@naspadstudio.id`; document actual retention and deletion practices. Review whether connected AI processing is described accurately.
- [ ] Set a deliberate global AI allowance or pause AI in owner settings before opening registration. Newly registered members inherit that policy. An unset allowance currently means unlimited, so do not assume new members have a default cap.
- [ ] Review hosting/database capacity, account growth, request limits and signup-abuse protection. This change does not add a rate limiter or CAPTCHA.
- [ ] Set `OPEN_BETA_ENABLED=true` in the server environment and restart/redeploy the server to enable registration. It is intentionally off in `.env.example` and false when missing.

## Production acceptance

- [ ] Open `https://tracking.naspadstudio.id/beta` in a signed-out browser. Confirm HTTPS, page layout, button destination, and error recovery.
- [ ] Use a real new Google account to create a member and reach its own empty `/app` tracker. Add a manual job before connecting Gmail.
- [ ] Confirm existing member and owner access and data are unchanged.
- [ ] Confirm an inactive member stays blocked even with registration enabled.
- [ ] Check the page on a narrow phone screen, desktop, keyboard navigation, and light/dark themes.
- [ ] Confirm a valid existing session sees “Open your tracker”.
- [ ] In the Resend template, replace every CTA and fallback URL with `https://tracking.naspadstudio.id/beta`.
- [ ] Send a test invitation to yourself and confirm the link works and replies reach iCloud at `hello@naspadstudio.id`.

## Pause / rollback

Set `OPEN_BETA_ENABLED=false` (or remove it) and restart/redeploy. `/beta` then displays that registration is paused, and unknown Google identities cannot create accounts. Existing active accounts continue to sign in. To revoke an existing member, use the current owner account controls; closing registration is not account revocation.

No Resend credentials or welcome-email automation are required for this feature. Invitation sending remains separate.

## Implementation verification (2026-10-21)

- Full suite: 65 files, 280 tests passed, including separate-process registration, account isolation, inactive identities, Google token/state checks, optional Gmail separation, mobile callback regression, and inherited AI restrictions.
- ESLint and TypeScript passed (route types refreshed with `next typegen`).
- Local Turbopack preview checked at desktop/mobile widths and mobile dark mode: Montserrat and theme styles render, no horizontal overflow, error recovery and fixed Google form destination work.
- Independent code review reported no actionable defects.
- Normal production build is still unverified: Turbopack's stylesheet worker fails with `binding to a port: Operation not permitted` in this environment. A webpack build compiles, but webpack bypasses this repository's Turbopack-only Tailwind rule, so it is not equivalent styled-build verification. Run the normal build successfully in the deployment environment before launch.
- Real production OAuth, published privacy policy, deployment configuration, and invitation delivery remain operator checks above.
