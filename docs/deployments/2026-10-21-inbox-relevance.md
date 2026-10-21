# Inbox relevance deployment — 21 October 2026

Inbox commit: `2e0873d1f145ee6849eb9260b3f37ac3cb2de10d` on `codex/workflow-phase1`.

Deployed image: `jobtracker-inbox:2e0873d-compatible`, tagged as `jobtracker-web:latest` and `jobtracker-worker:latest`. The image adds the committed Inbox directory, timeline and email-sync changes to the exact prior deployed iOS API image (`sha256:2155553a76049449975ee5e71427e3c067cfba9b4281178bcec4b43c82d1d74d`). Its labels record the Inbox revision and `jobtracker.base=deployed-ios-api-20261020-01`.

Important: the mobile API had already been deployed from uncommitted source. A clean Git build did not support live registry version 4 and briefly returned HTTP 500. The prior image was restored immediately. The final image preserves the mobile API and registry support; it does not downgrade the database. Rebuilding from Git alone is not equivalent to this release until the existing mobile source is committed. Existing local/server source edits were preserved.

Release build instructions and container test log remain in:

`/srv/jobtracker-releases/2e0873d1f145ee6849eb9260b3f37ac3cb2de10d`

Final stopped-services full data/environment backup:

`/root/jobtracker-backups/20261021T042249Z-inbox-compatible`

Earlier pre-attempt backup and original unfinished-source patch:

`/root/jobtracker-backups/20261021T041945Z-inbox-relevance`

Previous working image retained as `jobtracker-rollback:a9847e1` (this tag identifies the prior Git base; its contents include the already-deployed mobile API).

Verification:

- Isolated committed source: 238 tests, lint and type checks passed.
- Final combined image: standard production build and all 255 tests passed in Docker.
- Final image opened an isolated backup copy successfully before cutover; mobile session endpoint returned expected unauthenticated HTTP 401.
- Public health HTTP 200; Inbox requires sign-in (HTTP 307); mobile session endpoint retains HTTP 401.
- Aggregate counts preserved: 22 jobs, 10 saved document versions, 9 emails across four account stores.
- Environment unchanged; DRY_RUN remains true. No relevance choice was changed in live user data during verification.
