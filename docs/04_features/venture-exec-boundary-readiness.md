---
category: feature
status: approved
version: 1.0.0
author: Claude (Golf-6)
last_updated: 2026-08-18
tags: [feature, venture-provisioning, deploy, payments, readiness-report]
---

# EXEC-Boundary Provisioning Readiness Report (SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A)

## Overview

`lib/venture-provisioning/exec-boundary-readiness.js` produces a readiness report for
provisioning an OPCO-A venture's live surface: deploy status, distribution channel, and
payment account. It was scoped as a single **readiness report** rather than four separate
features because each of the PRD's functional requirements sits at a real chairman-reserved
boundary or missing primitive rather than something safely auto-buildable:

- **FR-1 (deploy readiness)** — records the venture's actual deployment state (previously
  `null`) rather than building a staging target that duplicates an out-of-band live deploy.
- **FR-2 (distribution channel)** — surfaces the existing chairman-hand boundary on
  `provisionOrganicChannel()` (`lib/marketing/organic-channel-provisioning.js`) rather than
  auto-selecting a channel, per the PRD's own acceptance criteria.
- **FR-3 (payment-account SETUP, non-live)** — adds `provisionPaymentAccountSetup()`, the
  first Stripe Connect Express account-provisioning primitive in the codebase, gated through
  the sanctioned `getStripeForVenture()` guard. Inert in the fleet today (no `sk_test` key
  configured), so live execution surfaces as an honest decision-point rather than an error.
- **FR-4 (analytics wiring)** — same shape: reports the absence of a per-venture analytics
  sink rather than inventing one out of scope.

## Key exports

| Export | Purpose |
|---|---|
| `buildProvisioningReadinessReport(...)` | Orchestrates FR-1..FR-4 checks into one report; supports a `dryRun` mode that skips side-effecting provisioning calls. |
| `provisionPaymentAccountSetup({ventureId, ventureName}, deps)` | Creates a Stripe Connect Express account via `getStripeForVenture()`, idempotency-keyed on `venture-payment-account-setup-${ventureId}`. |
| `assessPaymentAccountReadiness(provisionResult)` | Maps a provision result to a readiness verdict (`ok`, `accountId`, `chargesEnabled`, `detailsSubmitted`, or a decision-point reason). |
| `toVentureHealthStatus(deploy)` | Pure function: `{reachable, assetsVerified}` → `'healthy' \| 'warning' \| 'critical'`. |
| `inferDeploymentTarget(url)` | Pure function: infers `'cloudflare-workers'` / `'cloudflare-pages'` from a deployment URL's hostname shape (`.workers.dev` / `.pages.dev`); returns `null` rather than guessing on any other shape. Values match the canonical `DEPLOYMENT_TARGETS` enum in `lib/venture-deploy/stack-descriptor.js`. |
| `resolveHealthStatus(correctionTo, naive)` | Pure function: ranks `healthy < warning < critical` and lets a prior manual health-status correction stand only when it is equally-or-more severe than the fresh naive reading — so a fresher, worse reading is never masked by a stale correction. |
| `recordProvisioningReadiness({supabase, ventureId, report})` | Persists the report: updates `ventures.deployment_url` / `.health_status` / `.deployment_target`, and upserts a `launch_deployment_runbook` artifact row in `venture_artifacts` (current-row-per-scope, superseding the prior current row). |

## CLI

`scripts/venture-provisioning/run-exec-boundary-readiness.mjs` — the operator entry point.
Supports `--dry-run` (skips `provisionOrganicChannel` / `provisionPaymentAccountSetup`,
substituting `{ok:false, reason:'dry_run_not_attempted'}`).

Two one-off follow-up scripts also live in `scripts/venture-provisioning/`:
- `correct-altifyai-health-status.mjs` — applies a manual health-status correction (dynamic
  artifact lookup, not a hardcoded row id).
- `file-stripe-idempotency-followup.mjs` — files a `tech_debt` feedback row documenting that
  the Stripe idempotency key expires after 24h (a same-day-retry fix, not a full close — a
  durable fix needs a persisted `ventures.stripe_account_id` column, out of this SD's scope).

## Data integrity notes

- `venture_artifacts` has a partial unique index (`idx_unique_current_artifact`) scoped
  `WHERE is_current = true` over `(venture_id, lifecycle_stage, artifact_type,
  COALESCE(metadata->>'screenId', '__no_screen__'))`. The insert-then-23505-fallback path in
  `recordProvisioningReadiness` filters its fallback `UPDATE` by `is_current = true` in
  addition to the other scope columns — without that filter the `UPDATE` could match a
  historical (`is_current = false`) row and re-trigger the same unique-index violation.
- The stage-23 launch-readiness gate (`fn_stage_artifact_precondition`) remains armed
  (`blocked: true, missing_artifacts: ["launch_readiness_checklist"]`) after every persist —
  this module never satisfies that gate itself.

## Tests

`tests/unit/venture-provisioning/` — 62 tests across three files covering the pure functions
above, the CLI entry points, and the persistence/fallback wiring (including a regression
guard on the `is_current` fallback filter).

## Related

- SD: `SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A` — "Provision the live venture surface (deploy
  → distribution channels → live payment account) — UPSTREAM; irreversible-EXEC
  chairman-gated"
- PR: [#7221](https://github.com/rickfelix/EHG_Engineer/pull/7221)
