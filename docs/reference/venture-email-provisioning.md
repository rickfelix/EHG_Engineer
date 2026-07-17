# Venture Email Provisioning

- **Category**: Reference
- **Status**: Approved
- **Version**: 1.1.0
- **Author**: SD-LEO-FEAT-PROVISION-VENTURE-EMAIL-001, SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001
- **Last Updated**: 2026-07-17
- **Tags**: venture-email, resend, cloudflare, provisioning, secrets

One-call per-venture email identity: `provisionVentureEmail(venture)` in
`lib/venture-email/provision-venture-email.js`. Registers the domain (CF Registrar),
enrolls it in Resend, writes DKIM/SPF/DMARC DNS records, verify-polls, mints a
per-domain scoped sending key, and wires `hello@`/`support@` inbound routes to the
central inbox — as a **resumable step machine** over
`venture_email_identities.provision_state` (optimistic CAS on `lock_version`).

**Which addresses exist and why** (the governed mailbox standard the wired routes derive from): [EHG Email-Address Standards](../03_protocols_and_standards/ehg-email-address-standards.md).

## States

`pending → registered → domain_enrolled → dns_written → verified → key_scoped →
routes_wired → provisioned` (LAST-COMPLETED-step semantics — re-invocation runs the
next incomplete step). Terminal branches: `plan_mode` (credentials absent; manual
steps emitted in `result.planSteps`), `failed` (human needed; `last_error` set).
Re-invoking a `provisioned` domain is a **no-op** (never re-mints a key).

## Credentials (all optional — absence = plan-mode, never a throw)

| Env var | Leg |
|---------|-----|
| CF Registrar tokens (see `lib/venture-acquisition/registrar-adapter.js`) | domain registration |
| Cloudflare DNS tokens (see `lib/venture-acquisition/dns-wiring.js`) | zone + records |
| `RESEND_API_KEY` | enrollment, verify, key mint |
| `CF_EMAIL_ROUTING_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VENTURE_EMAIL_CENTRAL_INBOX` | inbound routes |

## Secret handling (pointer convention — IMPORTANT)

`venture_channel_secrets` has **no value column**. The provisioner persists only a
`secret_ref` pointer row (`channel_type = email:<domain>`, one row per
venture+domain, via `lib/marketing/channel-secrets.js` `storeSecret()`). The minted
Resend key VALUE is revealed exactly once and returned in **`result.revealedKey`**
(`{secretRef, keyId, keyValue}`) — the caller/operator must inject it into the
`VENTURE_CHANNEL_SECRET_STORE` keyring under `secretRef`. It never enters the DB,
the mapping row, or journals. If lost before injection, revoke by the journaled
key ID (`scoped_key_minted` evidence row) and re-mint.

## Observability

Every external call — success or failure — journals a `portfolio_evidence` row
(`evidence_kind='venture_email_provision_call'`, `provenance='real_event'`); a run
is reconstructable from journal rows alone. Capacity warning journals at 8+ Resend
domains (Pro cap 10; SES re-evaluation at venture 11+). AUP witness:
`guardSequenceSend({captureRecordId})` refuses sequence-sends without a
capture-record reference (typed `AupWitnessError`).

## Callers

`EVACOOIntegration.onboardVenture()` (`lib/agents/eva-coo-integration.js`) calls
`provisionVentureEmail` when `venture.domain` is present, fail-soft (a provisioning
error is captured on the result, never thrown/blocking), surfacing `revealedKey` on
the return object per the pointer convention above (SD-LEO-INFRA-VENTURE-SUBSTRATE-WIRING-001).
`onboardVenture()` itself has no live production caller yet — this wiring activates
once SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-B lands a real venture-onboarding entry
point; until then this is unit-tested but not reachable end-to-end.

## Operational notes

- DMARC ships `p=none`; graduation to `p=quarantine` is a scheduled follow-up after
  send-reputation warmup.
- A freshly created central-inbox routing destination is unverified until the inbox
  owner confirms Cloudflare's email — surfaced as a MANUAL plan step.
- Tests: `tests/unit/venture-email/provision-venture-email.test.mjs` (vitest unit
  lane; registered in `tests/test-estate-mjs-allowlist.json`),
  `tests/unit/agents/eva-coo-integration-onboard-email.test.js` (caller-side wiring).
