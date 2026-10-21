# Invite-only beta — 21 October 2026

At the user's request, public registration was disabled by setting `OPEN_BETA_ENABLED=false` and recreating web and worker. Existing active/approved users remain able to sign in; no accounts or application data were removed.

The `/beta` page now explains the invite-only policy, directs approved Google accounts to sign in, and provides hello@naspadstudio.id for access requests. There are no invitation tokens: access is controlled by the existing account approval registry. Google Cloud audience/test-user settings are separate and were not changed by this deployment.

Release image: `jobtracker:invite-only-20261021`. Build source and logs are retained under `/srv/jobtracker-releases/open-beta-20261021`. Previous working image is retained as `jobtracker:open-beta-20261021`, and the original pre-beta installation backup remains intact.

Local verification: 15 beta-page/registration tests passed, ESLint and TypeScript passed. Normal production build passed on the server. No database migration or retention-policy change is part of this update.
