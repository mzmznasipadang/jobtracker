# JobTracker legal publication review

Prepared 21 October 2026. Drafts are implemented locally at `/terms` and `/privacy`; no production publication has occurred. Source text: `src/lib/legal.ts`.

## Confirmed by operator

- Operator: Victor, Indonesia, using the Naspad Studio name; no registered company status asserted.
- Self-hosted service. Physical hosting country has not been confirmed; policy does not claim Indonesian-only storage.
- Contact: hello@naspadstudio.id.
- Active account data deleted within 30 days of a verified request; backups expire within 90 days of that request.

## Review before deployment

- Confirm the published operator identity is sufficient for applicable legal notices; replace “Victor” with the full legal name if needed. Provide any legally required business/contact address through an appropriate public contact channel.
- Confirm actual server location, proxy/network providers, access/error log retention, and all active processors. The draft identifies configured AI capabilities, Google, Resend invitations, and iCloud support without claiming all providers are always invoked.
- Check actual OpenAI/Anthropic API contracts, privacy settings, retention and Google-data restrictions. A policy statement alone cannot make an incompatible provider arrangement compliant.
- Confirm the non-personalized-model-training prohibition and Google Limited Use commitments are honored operationally. Review incidental human access and restrict it to permitted cases.
- Review Gmail permissions: sync currently requests both gmail.readonly and gmail.send although it does not send. Remove unnecessary send permission in a separately tested integration change before Google verification; do not describe current permissions as read-only.
- Confirm the operator can fulfill the accepted deletion/backup deadlines. The application has no complete automatic account-deletion flow; publishing these deadlines commits the operator to a manual process until one exists.
- Have the English terms and privacy wording reviewed for Indonesian consumer/data-protection requirements, any required Indonesian-language version, and international availability. These drafts are not a legal compliance certification.
- Confirm sign-in links render and are reachable while signed out. Link final deployed URLs from Google Auth Platform Branding, not localhost.

## Manual privacy-request procedure

1. Record receipt and reply from hello@naspadstudio.id. Verify control of the account email without collecting unnecessary identity documents.
2. For access/correction/export requests, identify only that account's records and follow applicable response deadlines. Do not expose other accounts or operator secrets.
3. For deletion, record the verified-request date and the 30-day active/90-day backup deadlines. Pause affected sync/worker activity before removal and revoke account sessions and integrations. Account suspension alone is not deletion.
4. Remove the account's database and associated stored documents plus account-linked registry, usage, and handoff records using a reviewed deletion procedure that respects foreign keys and preserves other users and the owner. Do not run ad-hoc database deletes against production.
5. Ensure the backup rotation expires all copies containing the account within 90 days. Track pending deletions so restoring a backup does not restore the deleted account into active use. Restrict backup access in the meantime.
6. Identify and explain any specific legal retention exception. Confirm completion to the requester and retain only the minimal record needed to demonstrate fulfillment.

## Reference sources

- https://developers.google.com/terms/api-services-user-data-policy
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://peraturan.bpk.go.id/Details/229798/uu-no-27-

## Local verification

282 tests passed across 66 files; ESLint and TypeScript passed. Browser checks confirmed `/privacy`, `/terms`, and `/beta` at 390px and 1280px widths, correct titles, legal links, and no horizontal overflow. No production deployment or legal-compliance certification was performed.
