# Venture No-Crack Gate — Attestations, PBN Status, and the Promotion Criterion

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-FDBK-FIX-VENTURE-CRACK-GATE-001
**Last Updated**: 2026-08-17
**Tags**: venture-lifecycle, governance, observe-only, pbn, chairman-review

## What this is

A structural (machine-enforced, not conventional) gate for the commitment: *before any venture
faces strangers via a distribution/traffic push, it must have a PBN validation score, a Stage-17
UI/UX judgment attestation, and an explicit chairman site-review attestation.*

This closes the AltifyAI crack: that venture reached live-deploy via a hand-run deploy CLI that
never touched any in-repo chokepoint — not even `lib/venture-deploy/promote.js`. A gate wired
only into the marketing-publish chokepoint (the original design proposal) would **not** have
caught it. The corrected design has two layers:

1. **Primary / detective** — a new job in `scripts/cron/venture-ops-actuals-sweep.mjs` that
   evaluates every venture with a live `deployment_url` (the harm surface, regardless of deploy
   path) each cycle.
2. **Secondary / preventive** — a precondition in `lib/marketing/autonomy-gate.js`'s
   `checkPublishAuthorization()` and `evaluateGraduation()`, covering in-repo-mediated marketing
   distribution.

Both layers call the same evaluator (`lib/eva/lifecycle/crack-gate-evaluator.js`) and both ship
**OBSERVE-ONLY**: neither actually blocks anything yet. See "The promotion criterion" below.

## The three checks

| Check | Source | Status today (measured 2026-08-17) |
|---|---|---|
| PBN validation score | `venture_pbn_status(uuid)` DB function, reading both existing (disjoint) PBN storage locations | 151/152 ventures `PBN_NOT_SCORED`; 1 `PBN_SOURCE_UNAVAILABLE` (a nursery row whose verdict column doesn't exist yet — the underlying migration is separately chairman-gated) |
| Stage-17 UI/UX judgment | `venture_gate_attestations` table, `check_type='stage17_judgment'` | No rows exist. The automated judgment engine (APA Child E) is a separate, unbuilt draft SD — this SD provides an interim human-attested path via `record-gate-attestation.mjs`, not the automated engine itself |
| Chairman site review | `venture_gate_attestations` table, `check_type='chairman_site_review'` | No rows exist. A prior, purely conventional version of this check already exists as a coordinator-maintained metadata marker on `SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-E` (`state=REQUIRED-UNMET`) — this SD's structural attestation is meant to supersede that marker for AltifyAI, not run alongside it indefinitely |

## Running the tools

```bash
# Per-venture status (read-only)
node scripts/eva/check-gate-attestation-status.mjs <venture-id> [--json]

# Fleet-wide observe-only promotion-readiness summary
node scripts/eva/check-gate-attestation-status.mjs --fleet-summary [--json]

# Record an interim human-attested check (real actor identity required; enforced by DB CHECK constraints)
node scripts/eva/record-gate-attestation.mjs \
  --venture <uuid> --type stage17_judgment --verdict PASS \
  --citation "https://..." --actor "rick@example.com" --producer "manual-review" \
  --subject-ref "probe://<venture-url>" --path-to-pass "n/a"

# Retroactive PBN score for a pre-gate venture (targets by UUID only — never by name)
node scripts/eva/retroactive-pbn-score.mjs --venture-id <uuid> [--dry-run]

# Detective sweep, one cycle
node scripts/cron/venture-ops-actuals-sweep.mjs --once
```

Exit codes on both CLIs: `0` = clear/ready, `1` = not met/not ready, `2` = could not determine
(e.g. the attestations table has not been chairman-applied yet).

## Deployment sequencing

`database/chairman-gated/20260817_venture_gate_attestations.sql` and
`20260817_venture_pbn_status_read.sql` are **chairman-gated** (blank `@approved-by` header —
they create RLS policies, so `isDelegatableForApply()` scopes them to a chairman apply ceremony,
not Adam-delegated apply). `database/migrations/20260817_set_venture_pbn_verdict_stage_zero.sql`
is **not** chairman-gated (a plain function, no RLS/trigger) and can go through the normal
Adam-delegated path.

Until the two chairman-gated migrations are applied, every code path that reads
`venture_gate_attestations` degrades to a distinct `ATTESTATION_SOURCE_UNAVAILABLE` state rather
than crashing or silently passing — this SD is safe to merge before the chairman ceremony.

## The promotion criterion (observe-only → enforcing)

This SD does **not** flip either layer to enforcing. A future SD should do so only once **all**
of the following hold, measurable via `check-gate-attestation-status.mjs --fleet-summary`:

1. Both chairman-gated migrations have been applied (attestations table + PBN status function
   both live).
2. `retroactive-pbn-score.mjs` has been run for the real deployed ventures (`deployment_url IS
   NOT NULL` — 3 today: AltifyAI, MarketLens, CronGenius).
3. At least **5 consecutive observe-only cycles** (`PROMOTION_MIN_CONSECUTIVE_CLEAN_CYCLES` in
   `check-gate-attestation-status.mjs`) show **zero** `would_block` observations — i.e. the gate
   has watched real traffic and found nothing it would have wrongly blocked.

`--fleet-summary` reports live standing against this exact criterion; it is not a TODO.

## Explicitly out of scope

- **The APA-E automated Stage-17 judgment engine itself** — a separate, unbuilt draft SD
  (`SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-E`). This SD's attestation table is designed
  so APA-E can become an automated writer to it later without a schema change.
- **The disjoint/stale dual-location PBN storage bug** (nursery vs. metadata destinations can
  disagree; a re-check at unpark never refreshes a stale nursery verdict) — `venture_pbn_status`
  reads around this robustly (including a dedicated `PBN_CONFLICT` state) but does not fix the
  underlying storage design.
- **A known, separate landmine**: `lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js`
  writes a `chairman_decisions` auto-approval that currently silently no-ops (the table has no
  `resolved_at` column, and the write's error is unbound). Adding that column later — an
  innocuous-looking additive migration — would silently arm fleet-wide machine self-approval.
  This SD does not touch that code path; it is logged separately as a harness bug. It is the
  reason this SD's own attestations deliberately live in a new table, not in `chairman_decisions`.
- **An EHG-frontend dashboard card.** `target_application=EHG_Engineer` — this SD is backend/CLI
  only; a dashboard surface for the same data is a natural, separate follow-up.
