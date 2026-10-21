# Open beta deployment — 21 October 2026

Authorized by the user: “Okay, deploy. Ssh root@naspad-server”.

## Release

Built the complete local working-source snapshot on naspad-server as `jobtracker:open-beta-20261021`, based on Git revision `2e0873d1f145ee6849eb9260b3f37ac3cb2de10d` plus the existing deployed mobile implementation and this chat's beta/legal/branding changes. The image is tagged as `jobtracker-web:latest` and `jobtracker-worker:latest`. No Git commit, push, database downgrade, or clean-checkout replacement was performed.

Public hostname is **https://tracking.naspadstudio.id**, matching existing APP_URL and OAuth callbacks. The proposed `tracker.naspadstudio.id` does not resolve and was not configured. Legal text and deployment instructions were corrected to the live hostname.

Public pages: `/beta`, `/privacy`, `/terms`. Branding uses the supplied JobTracker SVG plus title on public pages, JobTracker text in app navigation, and the SVG favicon. Terms/privacy links appear next to sign-in; Gmail connection includes the processing disclosure.

Enabled `OPEN_BETA_ENABLED=true`. Existing APP_URL, Google credentials, APP_SECRET, DRY_RUN, AI usage configuration, and other environment settings were preserved. No credentials were displayed or copied into client code. Google Cloud configuration was not changed.

## Backup and rollback

Full installation/data/environment backup with web and worker stopped:

`/root/jobtracker-backups/20261021T134656Z-open-beta/installation.tar.gz`

Previous images retained as:

- `jobtracker-rollback-web:open-beta-20261021`
- `jobtracker-rollback-worker:open-beta-20261021`

Release source snapshot, build logs, tests, cutover script, public checks, and aggregate counts:

`/srv/jobtracker-releases/open-beta-20261021`

The initial cutover includes automatic full rollback on failed local checks. A final rebuild corrected the privacy-policy hostname; both services use that corrected image. For any later rollback, stop both writers, preserve post-deployment data separately, and restore matching source/environment/data and images together. Do not silently discard new account or application writes. Maintain the published deletion/backup retention commitments for these root-private backups.

## Verification

- Normal production build passed on Linux with the project's actual Turbopack/Tailwind setup. This resolves the local environment's production-build restriction for this release.
- Full release-image suite: 66 test files, 282 tests passed.
- Backup/cutover counts preserved: 4 accounts, registry version 4, 4 account stores, 28 jobs, 14 saved tailored versions, 10 imported emails.
- Public `/api/health`, `/beta`, `/privacy`, `/terms`, and `/brand/jobtracker.svg`: HTTP 200.
- Signed-out `/app`: HTTP 307; mobile session without token: HTTP 401.
- Public Google sign-in starts at accounts.google.com with the existing `https://tracking.naspadstudio.id/api/auth/google/callback` and only openid/email/profile scopes; flow cookie is Secure. Valid-context denial returns to `/beta?error=cancelled`.
- Live browser checked the combined JobTracker branding, Montserrat styling, and open-registration action.
- Worker restarted and completed sync/ghost cycles without reported errors.

Real user Google authorization is still a user acceptance check; no live account was created by automated verification. OAuth publishing/Gmail verification and the privacy operational review remain the operator's responsibilities; publication alone does not certify compliance. New members inherit existing AI allowance settings, including unlimited if left unset.
