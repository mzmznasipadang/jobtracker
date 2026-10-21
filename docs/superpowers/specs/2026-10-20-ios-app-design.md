# Native JobTracker iOS design

## Outcome
Build a native SwiftUI iPhone app in the sibling JobTrackingiOS directory. Use the existing deployed server, Google identity, account approvals and per-account data. Web and iOS must show the same records. Keep server-side AI, Gmail, PDF generation, usage allowances and archive rules authoritative.

## Authentication
Use ASWebAuthenticationSession to open a dedicated mobile login route on the existing HTTPS server. Reuse the current Google web OAuth client and server callback, including state, nonce and Google PKCE validation. Do not embed Google login in a WebView.

The app generates a cryptographically random PKCE verifier and sends only its S256 challenge when starting mobile login. Store the mobile challenge and a fixed app callback identifier in expiring server-side flow state bound to the browser login transaction. After Google identity verification and account approval, redirect to the registered app callback with a short-lived, random, one-use exchange code. Never put a session token in the redirect URL. Exchange the code plus verifier over HTTPS for an opaque mobile session token. Store exchange codes hashed, expire after 60 seconds and consume atomically only after successful verifier validation. Never accept a caller-supplied arbitrary callback URL.

Store the mobile session token in iOS Keychain. Attach it automatically as an Authorization Bearer header to API calls. Use the existing session registry and 30-day expiry; account revocation must invalidate API access immediately. Sign-out revokes the session and removes the Keychain item. Expiry returns HTTP 401 and asks for Google sign-in again. No token copying or manual API key input.

Retain the existing browser cookie login behavior. Mobile login cancellation and Google denial must return a recoverable signed-out state. Concurrent login transactions must not exchange each other's codes.

## Backend boundary
Add versioned JSON routes under /api/mobile/v1. Route handlers validate authentication, account ownership and inputs, then invoke the same src/lib services that web server actions use. Do not call Next.js server actions from Swift or duplicate business rules in the client. Preserve web route behavior and read the installed Next.js guides before edits.

Provide structured errors and appropriate 400/401/403/404/409 status codes. Return no secrets or raw provider errors. Make authenticated responses private and non-cacheable. Documents must require the same account checks and archive deadlines as web downloads.

## Native experience
Use Dashboard, Jobs, Inbox and Settings tabs. Jobs supports search, status filtering, capture by URL plus pasted description, job details and edits, checks, notes, status changes, follow-up dismissal, archive/restore and confirmed permanent deletion. Display extraction/check/tailoring progress and recoverable failures.

Application preparation supports draft generation, revision-safe editing, accuracy acknowledgement, PDF generation and separate CV/cover-letter sharing. Preserve master-CV factual guards and unsaved changes. Inbox supports the existing message linking workflow. Settings includes profile/preferences, master CV and Gmail connection; owner controls preserve the server's role restrictions.

Use native navigation and controls with Liquid Glass on navigation and interactive controls where appropriate, availability-gated with sensible fallback styling. Support Dynamic Type, VoiceOver and dark mode. Keep content surfaces legible.

## State and concurrency
Use a MainActor-isolated observable session/UI store and immutable Sendable API models. Use URLSession async operations and structured cancellation. Poll busy jobs only while their screen is active; refresh data on foreground and pull-to-refresh. Surface network errors without clearing entered form data. Establish explicit Swift language mode and strict concurrency settings in the new project before writing concurrency-sensitive code.

## Data consistency
Server is the source of truth. Refresh after successful mutations; use existing draft revisions for conflict detection. Do not claim offline edits or instantaneous push synchronization. Each device sees changes on refresh/foreground and during active busy-job polling.

## Verification
Backend tests must cover PKCE mismatch, expired/replayed code, callback allowlisting, denied/revoked accounts, invalid/expired sessions, cross-account resource access, validation failures and unchanged web login. Test route behavior against shared services without real Google or AI calls. iOS verification includes build under explicit concurrency settings and simulator exercises for login callback handling, cancellation, capture, status edits, draft conflicts, downloads, sign-out and network failure. Full live Google sign-in requires deploying the new server routes and configuring the final app identifier/callback scheme.

## Delivery
Deliver the iOS Xcode project, backend changes, automated test results and setup instructions. No production deployment or App Store submission is included. Bundle identifier and Apple signing team remain installation configuration rather than guessed production identities.
