# Open beta entry and registration

Date: 2026-10-21
Status: Draft for review; implementation not started

## Intent

Publish https://tracker.naspadstudio.id/beta as the destination for the Resend invitation email. Anyone with a Google account can join without an invitation token, waiting list, or owner approval. Success means a visitor understands the beta, signs in, and reaches their own private tracker.

Confirmed: website first, open beta, existing Naspad visual identity, Resend for outgoing invitation emails. Proposed defaults: Google-only registration, manual tracking available immediately, Gmail connection optional, no automatic welcome email in this release.

## Approach

Recommended: a dedicated public /beta page backed by the existing Google sign-in and account registry. It gives email recipients context while keeping account creation in one trusted callback.

Alternatives considered: sending directly to /login is smaller but offers little introduction; a separate email/password registration system adds credentials and recovery flows without serving the current need. Neither is included.

## Public page

Use a restrained, single-column layout, approximately 640px wide, with a Naspad wordmark, introduction, one primary action, concise expectations, and a footer. No dashboard mockups, invented testimonials, counters, or pricing claims.

Content order:

1. Existing Naspad wordmark and product name, JobTracker.
2. Heading: “Your job search, a little more organised.”
3. Introduction: “Keep your applications, interview updates, and next steps in one place. Join the JobTracker open beta and help shape what comes next.”
4. Primary action: “Continue with Google”. This creates an account for a new user and signs in an existing user.
5. Supporting text: “No invitation code needed. Connecting Gmail is optional.”
6. Brief expectations: this is an early version; features may change; feedback is welcome at hello@naspadstudio.id.
7. Privacy explanation: “Google sign-in uses your basic profile and email address. Gmail access is requested separately if you choose to connect it.” Link to the privacy notice.
8. Footer: Naspad Studio and a feedback mail link.

Do not promise indefinite free access, production reliability, or data retention guarantees. No marketing subscription is implied by account creation.

## Visual direction

Preserve src/app/globals.css and the existing Wordmark component as authority. Montserrat typography; navy #272660; sky #49bce9; text #0e0d24; muted text #5b5a7e; muted surface #f3f4f9; border #dcdeeb; approximately 10px corner radius. Use existing theme tokens and their dark-mode values instead of duplicating a separate palette.

Use generous whitespace, a clear heading, and one prominent navy action with white text in light mode. Follow the existing theme for dark mode. The full primary action is available on narrow screens without horizontal scrolling. Use semantic headings, visible keyboard focus, accessible contrast, and a text error message near the action.

## Account flow

- /beta is public and reachable without a session.
- An authenticated visitor sees “Open your tracker”, linking to /app, instead of another sign-in prompt.
- A signed-out visitor starts the existing Google OAuth flow with /app as the successful destination. Carry a validated return context through existing protected OAuth state so failures return to /beta; do not trust an arbitrary redirect URL.
- Only after the existing token, issuer, audience, expiry, nonce, state, and verified-email checks pass may registration happen.
- A previously unseen Google identity creates a member account and binds its Google subject atomically. No signup path can grant owner permissions.
- An existing active account uses current subject-binding checks. Previously approved, unclaimed accounts can still be claimed by their verified identity.
- Existing inactive accounts stay inactive. Public registration must never call the existing approveEmail operation to reactivate them.
- A subject/email conflict fails safely without rebinding identities or exposing another account's details.
- Concurrent first logins resolve to one account using database uniqueness constraints and transactional handling.
- Preserve per-account database isolation and existing owner identity. New accounts begin empty and never inherit owner data, CVs, Gmail credentials, or sessions.
- Keep existing safe destination validation, session creation, and cookie protections. Preserve mobile callback behavior; no mobile UI or handoff changes are part of this release. Shared registration policy must be tested against existing mobile login behavior.

## Registration switch

Introduce OPEN_BETA_ENABLED=true as a server-only deployment setting. Missing or false preserves approved-account login and rejects creation of unknown accounts. Existing active accounts continue to sign in when public registration is closed. Read the setting at the authoritative account-creation boundary, not only in page rendering.

When closed, /beta explains that new registration is paused and offers existing-user sign-in. Public copy in /login must agree with the actual registration policy; remove the blanket “approved account” requirement when the beta is open.

## Entry, feedback, and errors

After successful registration, use the current /app entry point. Ensure an empty account can reach manual job creation without Gmail setup. Do not create a separate onboarding wizard.

Cancellation shows “Sign-in wasn’t completed. You can try again.” Other authentication failures show “We couldn’t sign you in. Please try again or contact hello@naspadstudio.id.” Do not expose tokens or account membership in messages or logs. An inactive account remains blocked with a generic access message. A pending action prevents repeated clicks and announces progress accessibly.

Feedback uses mailto:hello@naspadstudio.id. Resend is the outbound invitation channel only; there is no email collection form, campaign sender, subscription database, or automated welcome email in this scope. Set every email CTA and fallback link to the public HTTPS /beta URL after deployment.

## Launch prerequisites

- Confirm production APP_URL is https://tracker.naspadstudio.id and Google callback configuration matches the existing /api/auth/google/callback route.
- Confirm the deployed Google OAuth audience permits intended public users. Sign-in scopes remain openid, email, and profile; optional Gmail permissions and any Google review requirements must be assessed separately before advertising Gmail access as available to everyone.
- Publish a privacy notice describing actual identity data, application data, optional Gmail access, applicable AI processing, and a contact path for deletion requests. Do not ship a dead privacy link or invented policy. Final policy copy and operational retention/deletion commitments need owner review before public launch.
- Verify the existing account-level AI allowance and pause controls apply to newly registered members before opening registration; public signup must not bypass them.
- Review hosting capacity, existing request limits, and account creation abuse controls before launch; opening registration does not authorize unbounded AI or Gmail work. Keep Gmail sync opt-in.

## Expected implementation scope

Add /beta; reuse Wordmark and Button. Update the existing account claim operation for conditional public registration; update login wording and OAuth failure return context; document the deployment flag. Preserve current protected /app routes, OAuth implementation, and account database layout. Read the installed Next.js documentation before implementation, as AGENTS.md requires.

## Acceptance checks

1. Signed-out visitors can load /beta on desktop and mobile, including keyboard navigation and dark mode.
2. A verified new Google user gets exactly one member account and reaches an empty personal tracker.
3. Existing users retain their data; owner access and ownership do not change.
4. Revoked accounts, invalid identities, subject conflicts, replayed state, and tampered destinations remain rejected.
5. Turning public registration off blocks unknown users while allowing existing active users to sign in.
6. Concurrent registration does not duplicate accounts or return another user's account.
7. Cancelling sign-in from /beta returns a useful retry state on /beta; existing login and mobile flows retain their supported destinations.
8. Manual job tracking works before Gmail connection; no Gmail consent is requested during basic sign-in.
9. New members receive existing AI policy enforcement and cannot access another member's data or owner-only actions.
10. A test invitation opens the deployed /beta page, and feedback replies arrive in iCloud.

## Outside scope

iOS distribution, TestFlight, invitation tokens, waiting lists, passwords, additional identity providers, billing, referral tracking, welcome-email automation, and a wider marketing-site redesign.
