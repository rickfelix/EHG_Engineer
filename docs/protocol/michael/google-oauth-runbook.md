# Michael Google OAuth Runbook (host only)

**Category**: Guide · **Status**: Approved · **Version**: 1.0.0 · **Author**: SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (Bravo seat) · **Last Updated**: 2026-09-06 · **Tags**: michael, google-oauth, credentials, task-scheduler, runbook

Source of record: `docs/michael/02-SPEC.md` v0.3 §4 (auth and credentials) and §9 (`michael-oauth-health`). Ratifications: ff4ef5b4 (credential venue), 0daf3bd8 (GHA credential-free), 8e6ac764 (D4 seven-day re-consent posture), 6c263823 (evidence provenance). Code: `lib/integrations/google/chairman-oauth.js`, `scripts/michael/google-consent.mjs`, `lib/michael/gmail-client.mjs`, `server/routes/michael.js`.

## What this grant is

One chairman-user Google grant (`rickfelix2000@gmail.com`) for `gmail.modify`, `calendar.readonly` and `drive.readonly` (`youtube` is v1.1). Tokens are stored as AES-256-GCM ciphertext in `michael_credentials` (row `identifier = google_chairman_oauth`, child B migration, chairman-applied) and are decrypted **only on the chairman's host**. Nothing in this path runs in GitHub Actions: any process with `GITHUB_ACTIONS=true` or `CI=true` is refused before a decrypt (`HOST_VENUE_REQUIRED`), and no workflow references `MICHAEL_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`.

## One-time provisioning (host)

1. Generate the master key and put it in the host `.env` (never committed, never a GHA secret; back it up with the `.env`):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   MICHAEL_ENCRYPTION_KEY=<the 64 hex characters>
   ```
   The module refuses without it (`MICHAEL_ENCRYPTION_KEY_MISSING`) and never generates a key on its own: a self-generated key is how `lib/security/encryption.cjs`'s default singleton would have made the blob unrecoverable from a worktree or a runner.
2. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are already in the host `.env` (shared with the YouTube module; the two consent flows share port 3456 and must not run at the same time).
3. The chairman applies the child B migration (`database/migrations/20260906_michael_tables.sql`). Until then the consent command refuses `TABLES_ABSENT` **before** opening the browser, so a grant can never be completed into an unrecordable store.

## Consent and re-consent (the whole runbook is one command)

```
node scripts/michael/google-consent.mjs
```

Pre-flights in order, all before the browser opens: host venue, key present and 64 hex, client id and secret present, `michael_credentials` applied. Then a consent with a state nonce and PKCE S256 on a loopback-only listener (`127.0.0.1:3456`, started before the browser is launched; `REDIRECT_PORT_IN_USE` if the YouTube flow holds the port). The stored row records the scopes Google actually granted; if a scope was unchecked on the consent screen the health reads `partial_scope`, never `ok`.

Under the seven-day posture (Testing-status consent screen), the refresh token lapses seven days after consent. `expires_at` on the row is that grant expiry (stamped at consent, untouched by access-token refreshes), so `michael-oauth-health` (child G) warns at 48 hours and trips on `invalid_grant`. Re-run the same command when it warns.

## Status (no secret is ever printed)

```
node scripts/michael/google-consent.mjs --status          # seven lines, one per field
node scripts/michael/google-consent.mjs --status --json   # one JSON object
```

Fields: `health` (`ok` | `expiring` | `partial_scope` | `invalid_grant` | `absent`), scopes, `expires_at` with hours to expiry, `last_refreshed_at`, `last_error`, stored `key_fingerprint` beside the host key fingerprint (`MISMATCH` means the host key is not the one the blob was encrypted under: restore the original `MICHAEL_ENCRYPTION_KEY` or re-consent). `GET /api/michael/oauth/status` (behind `requireAuth` + `requireAdminRole`; 404 `NO_CREDENTIAL`, 503 `TABLES_ABSENT`) serves the stored fields plus `health`, `hours_to_expiry` and the re-consent command, but NOT the host-key comparison: `MISMATCH` is visible only from the CLI `--status`, which reads the host key.

## Refusal codes

| Code | Meaning | Fix |
|---|---|---|
| `HOST_VENUE_REQUIRED` | Running under GitHub Actions or CI | Run on the chairman host |
| `MICHAEL_ENCRYPTION_KEY_MISSING` / `_INVALID` | Key absent, empty, or not 64 hex | Provision the key in the host `.env` |
| `GOOGLE_CLIENT_MISSING` | Client id or secret absent | Host `.env` |
| `TABLES_ABSENT` | Child B migration not applied | Chairman applies the migration |
| `REDIRECT_PORT_IN_USE` | Port 3456 held (YouTube consent flow) | Close it and retry |
| `OAUTH_DENIED` / `OAUTH_TIMEOUT` | Google reported an error, or no callback in five minutes | Retry the command |
| `KEY_FINGERPRINT_MISMATCH` / `_ABSENT` | Blob encrypted under another key, or unattributed | Restore the key or re-consent |
| `NO_STORED_TOKENS` | No grant yet | Run the consent command |
| `LABEL_FORBIDDEN` (`gmail-client`) | `TRASH` or `SPAM` requested | Never allowed; use archive or a label |

## Feeders (child D)

Credentialed feeders run on Windows Task Scheduler on the host, in the shape of `scripts/setup-alarm-cron-tasks.mjs` registering a `scripts/cron/*.cmd` wrapper through `scripts/cron/run-hidden.vbs` (the two paths named at spec §5 line 105 do not exist). They import `getAuthenticatedClient` from the module; `invalid_grant` on refresh is written to `last_error` and rethrown, and feeders treat it as `status: 'failed'`.

## Known residuals (recorded, not fixed here)

- No revoke path exists for the grant (open since the YouTube module); rollback is delete the row and revoke at `myaccount.google.com/permissions`.
- The host key is in-process for every dotenv script beside the service-role client; `encryption.cjs` binds no additional authenticated data.
- An `invalid_grant` raised inside the access token's own lifetime is not written to `last_error` until the next refresh.
- The child B migration's verify block pins `encrypted_blob` but not `key_fingerprint` (one ARRAY line, child B).

## Changelog

- 1.0.0 (2026-09-06): initial runbook, SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (PRs #8346, #8351).
