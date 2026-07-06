---
category: deployment
status: approved
version: 1.0.0
author: SD-LEO-INFRA-OPERATOR-RUNWAY-TRUTHFULNESS-001
last_updated: 2026-07-06
tags: [deployment, operator, cash-burn, bank-read, teller, chairman-action]
---

# Operator Bank-Read Enrollment Runbook

## Overview

The operator runway/cash-burn gauge (`operator_cash_burn_monthly`) can source the `cash_usd`
input two ways: **manual attestation** (a human-entered balance, subject to the freshness
window in `LIVENESS_WINDOWS_MS.cash`) or a **live, read-only bank balance** fetched from
Teller.io. Enrolling the live bank read is a one-time, chairman-initiated action — it is
never run automatically, and the fleet never attempts self-enrollment.

This runbook covers the enrollment procedure and the operational contract around it.
Implemented in SD-LEO-INFRA-OPERATOR-RUNWAY-TRUTHFULNESS-001 (FR-1).

## Prerequisites

- A Teller.io application with **Payments/money-movement disabled at the account level**
  (Teller tokens cannot be scope-inspected in code, so this account-level restriction is
  the enforceable read-only boundary).
- A Teller access token and the application's mTLS client certificate + private key (PEM).
- Run from a human terminal — the CLI refuses to run in a CI/fleet/automated context.

## Enrollment procedure

```bash
echo '{"token":"<teller-token>","certPem":"-----BEGIN CERTIFICATE-----\n...","keyPem":"-----BEGIN PRIVATE KEY-----\n..."}' \
  | BANK_READ_ENROLL_CONFIRM=true node scripts/operator/enroll-bank-read.mjs
```

- Credentials are read **only from stdin** as a single JSON object — never from `process.argv`
  (argv is visible in `ps`/shell history/process listings).
- `BANK_READ_ENROLL_CONFIRM=true` is a required, explicit human confirmation. Without it, the
  CLI refuses in any context detected as CI/fleet/automated (`isCIContext()`,
  `lib/payments/stripe-client.js`) — including a Claude Code session's own environment.
- The token and cert/key pair are stored in separate encrypted-vault namespaces
  (`lib/operator/cash-sources/token-vault.js`): the bearer token under the app-id
  `operator-cash-burn`, the mTLS cert pair under `operator-bank-read-mtls`. Storing two
  different credential types under the same app-id would silently clobber one — this is why
  the cert pair uses its own namespace.
- Re-enrolling requires `--reenroll`; the CLI refuses to silently overwrite an existing
  credential.
- Nothing is ever logged or echoed — not the token, not the cert/key, not JSON-parse-failure
  error text (an earlier draft interpolated the caught error, which could leak a fragment of
  a mistakenly-piped raw token; fixed before ship).
- A best-effort `audit_log` row is written (`event_type='BANK_READ_ENROLLMENT'`,
  `entity_type='operator_cash_source'`, `metadata={at, reenroll}`) — never the secret values.

## What happens after enrollment

`scripts/operator/feed-operator-cash-burn.mjs` loads the cert pair and builds a
`tellerClientFactory` closed over it; `lib/operator/cash-sources/bank-read-service.js`'s
`readBankCashSlice()` then calls Teller's read-only `listAccounts()`/`getBalance()` endpoints
(`lib/operator/cash-sources/teller-client.js` — a hand-rolled client implementing exactly
those two endpoints, by construction never touching Teller's transfer/payment endpoints).

If the bank read is unenrolled, or a live call fails, the feed **falls through to manual
attestation** — it never reuses a stale bank-read result silently. A genuinely stale manual
attestation (older than `LIVENESS_WINDOWS_MS.cash`, currently 31 days) still fails closed
into the gauge's honest "attestation missing" state rather than showing stale data as current.

## Cross-repo consistency check

Both this repo and the `ehg` repo independently compute runway from the same
`operator_cash_burn_monthly` row (`computeRunway()` here, `distanceToBroke()` there). Verify
they haven't drifted with:

```bash
node scripts/operator/verify-runway-parity.mjs
```

Set `EHG_REPO_PATH_OVERRIDE=<path>` to point the check at an unmerged local `ehg` worktree
during development; unset (the default), it resolves the canonical `ehg` repo root via
`lib/repo-paths.js`'s `resolveRepoPath('ehg')` — the correct behavior for a production check.

## Related

- [Distance-to-Broke Phase-0 design spec](../04_features/ehg-cockpit-distance-to-broke-phase0.md) — §4 Q4 resolution
- Retrospective: `retrospectives` table, id `2aa7c579-e2b3-4e35-89ea-cf779e7fd107`
