# Multi-account JobTracker with Google sign-in

## Agreed intent

Run one JobTracker website on naspad-server at https://tracking.naspadstudio.id for several independent people. They sign in with Google without creating Google Cloud projects or editing environment files. Only Gmail addresses approved by the owner can create/use accounts. The owner is owner@example.com and keeps the existing single-user data and Gmail connection. Phase 1 continues to never send emails or submit applications.

## Recommended approach and alternatives

Use the existing Google OAuth client and google-auth-library for Google OpenID Connect sign-in, a small account/session registry, and a separate SQLite data file for each account. Pass an explicit account identifier through application services. This preserves the existing per-account schema and physically separates CVs, jobs, email and settings while keeping one deployment.

An alternative is adding user_id columns and ownership filters to every table/query, including composite uniqueness and foreign keys. This works but needs a broader data migration and makes a missed SQL ownership filter more consequential. A hosted identity provider adds another service and setup while Google still needs to authorize Gmail access. Neither alternative is needed for this small self-hosted app.

## Accounts, approval and administration

- The owner Google identity is provisioned explicitly from OWNER_GOOGLE_EMAIL=owner@example.com; it must not be claimed by whichever visitor signs in first.
- Store Google subject (sub) as the stable identity, normalized verified email for approval/display, role (owner/member), active state, and timestamps in a dedicated registry database next to DB_PATH.
- Only a Google-verified email matching the configured owner can claim the owner account. Bind its subject once and reject a later different subject attempting to reuse the email.
- Owner-only account management in Settings: approve an email, list accounts/approved emails, revoke access. Approved but unused emails do not create data databases until sign-in succeeds.
- Revocation is enforced on every authenticated request and prevents worker cycles and new background tasks for that account. A task already running may finish in that account's private database; it cannot cross into other accounts.
- Members cannot manage approvals or change another account's role, identity, data path or settings. The owner administration view exposes account identifiers and access state, not members' CV/email/job contents.
- No public registration, invitations sent by email, team sharing, billing, impersonation or account deletion in this change.

## Google sign-in and sessions

- Add Sign in with Google to /login using openid, email and profile identity scopes. Gmail read/send scopes are not requested just to log in.
- New routes: /api/auth/google and /api/auth/google/callback. Register https://tracking.naspadstudio.id/api/auth/google/callback and http://localhost:3000/api/auth/google/callback in the owner's existing Google OAuth client.
- Use authorization-code flow with random expiring state, nonce and PKCE, stored in secure HttpOnly SameSite=Lax cookies. Restrict return destinations to local /app paths.
- Verify ID token signature, issuer, audience, expiry, nonce, subject and email_verified via Google's library before account approval lookup. Missing/invalid claims or unapproved email fail closed with a generic login message.
- Use random opaque application sessions stored as hashes in the registry, linked to account ID, expiring after the existing 30-day period. Cookie remains jt_session, HttpOnly/Secure in production and SameSite=Lax. Rotate at login; logout deletes the registry session and cookie.
- requireSession returns an active account identity and checks registry/session expiry on each protected route/action. Proxy remains convenience only; it may redirect if the cookie is missing, but does not replace server-side checks.
- Existing password-only session cookies are invalidated when switching formats. Password login is removed after deployment so a shared password cannot access an ambiguous account. ADMIN_PASSWORD_HASH becomes obsolete and is removed from setup documentation.
- Do not introduce Auth0 or another external identity service. Reuse the already installed Google library and existing server credentials.

## Private data isolation

- DB_PATH continues to identify the existing owner's database, preserving the existing schema/data and encrypted Gmail token. APP_SECRET must stay unchanged so the current Gmail token remains decryptable.
- Keep registry storage separate (accounts.db beside DB_PATH). Members use a server-generated numeric account ID and an internal path such as users/<id>.db beside DB_PATH. Never derive filenames from email, URL parameters, cookies or caller-supplied paths.
- Resolve an account's data path only from a verified registry identity. Owner database selection is explicit; there is no default fallback to the owner's data for a missing account.
- Change data services to require an explicit account argument: DB, settings/CV, jobs/events/checks/tailoring/downloads, inbox/Gmail sync, metrics and ghost detection. All pages/actions/routes get that account from requireSession, not form fields.
- Existing per-account job IDs and email IDs remain valid. Two users may save the same URL and have independent job ID 1; each query is routed to its own database. A forged job ID/PDF version never selects a different account's file.
- AI helpers receive the account context so model selection/master CV/preferences come from the correct account. The server Anthropic key is shared among approved accounts; this is a deliberate owner-funded setup, without per-user billing or user-supplied API keys in this change.
- Every queued/background operation captures the explicit account at scheduling time. No global mutable current-user variable or request context inferred from the last login.

## Gmail integration

- Keep Connect Gmail as an optional separate consent step after basic sign-in. All users share the owner's GOOGLE_CLIENT_ID/SECRET; refresh tokens and sync cursors stay in their own private data databases, encrypted with the existing APP_SECRET.
- Preserve /api/gmail/callback and current phase-1 scope requirements. Bind connection state to the initiating authenticated account and reject callback when the session/account changes or state expires/is reused.
- Gmail disconnect/errors/sync status affect only that account. Gmail may be a different mailbox from the sign-in identity when the user intentionally selects one during connection; the selected mailbox is displayed in settings to avoid ambiguity.
- Google consent remains necessary. Gmail's restricted scopes may trigger unverified-app warnings, user limits or verification requirements; the app cannot remove Google's requirements. Owner configures/verifies one OAuth application; members never configure Cloud Console projects.
- Do not claim that publishing to In production alone verifies a Gmail app. No real email sending is introduced.

## Worker and public pages

- Worker enumerates active registered accounts and runs sync/ghost detection with an explicit account identity, sequentially to limit load. Failure for one account is logged without secrets and does not stop later accounts. Avoid overlapping cycles and preserve graceful shutdown.
- Public home page and /api/public/stats continue to show only the owner's opt-in aggregates; they never combine member data. Select the owner via the registry explicitly.
- Members have no public profile URL in this release. Their public-page toggle is hidden/disabled because no member public route is being introduced. Default member accounts are private.
- Health checks validate registry/owner storage availability without exposing account information; no Google/network authentication is required for /api/health.

## Migration and deployment

1. Implement and test locally without touching production data or real OAuth credentials.
2. Before rollout, stop web and worker and make a consistent backup of the entire current data directory plus a protected copy of production .env. Do not print secrets or put backups in the repository.
3. Set OWNER_GOOGLE_EMAIL explicitly; keep APP_SECRET and existing Google/Anthropic credentials. Registry bootstrap recognizes DB_PATH as the owner's existing data file without modifying its contents.
4. Register the additional Google sign-in callback URI in the shared OAuth client; keep the existing Gmail callback URI. This requires the owner's Google Cloud access and cannot be replaced by application code.
5. Build/recreate services on naspad-server, verify owner login/data preservation and two-account isolation before inviting others. Keep the old image/commit and backup available for rollback.
6. Roll back by stopping services and restoring the prior image/config; the owner's original database retains its schema. Preserve newly created member databases/registry when rolling back so they are recoverable.

## Verification and acceptance

- Owner's existing CV, jobs, settings and Gmail refresh token survive migration. Re-running bootstrap is idempotent; no first-login owner takeover.
- Approved verified Google identity can sign in; unapproved email, unverified email, bad state/nonce/PKCE, expired token, wrong audience, replayed callback and revoked account cannot.
- Sessions are unpredictable, hashed at rest, expire and are invalidated by logout/revocation; old password tokens do not authenticate.
- Owner can approve/revoke addresses; members cannot invoke those actions even by direct POST.
- Two accounts save identical URLs and overlapping numeric IDs. Job reads/edits, CV/PDF downloads, inbox matching, settings, AI inputs and Gmail callbacks remain isolated. Missing account context fails rather than falling back to owner.
- Worker processes each active account independently; failed/revoked accounts do not affect others. Concurrent/background work retains the initiating account.
- Public API exposes only owner's aggregates; member data never changes the owner's public totals. All private routes/actions authenticate themselves.
- Existing tests are updated to use explicit accounts; add focused migration, auth and cross-account regression tests with mocked Google/Claude calls. Run full suite, lint/type checks and Docker build; verify real owner Google login with the owner's participation and production PDF/worker/health after rollout.

## Sources checked

- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification

## Review status

Owner approved this written design on 2026-10-19 ("Go ahead"). Implementation plan: docs/superpowers/plans/2026-10-19-multi-account.md. Application code and production storage have not been changed during design/planning.
