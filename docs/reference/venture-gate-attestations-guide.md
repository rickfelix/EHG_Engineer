# Venture No-Crack Gate — Attestations, PBN Status, and the Promotion Criterion

**Category**: Reference
**Status**: Approved
**Version**: 1.1.0
**Author**: SD-FDBK-FIX-VENTURE-CRACK-GATE-001
**Last Updated**: 2026-08-18
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

## Post-merge hardening (2026-08-18, PR #7222)

Three rounds of adversarial review on a small follow-up PR surfaced real defects, including one
that had shipped silently in the original PR and would have affected the majority of the target
population. Documented here so a future reader of the code doesn't have to re-derive it.

- **`set_venture_pbn_verdict_stage_zero(uuid, jsonb)` was a silent no-op for most ventures.** The
  original write called `jsonb_set(metadata, '{stage_zero,pbn_verdict}', p_pbn_verdict, true)` — a
  two-level path. Postgres's `create_missing=true` only auto-creates the *final* path element, not
  a missing intermediate container, so for any venture without an existing `metadata.stage_zero`
  key (114 of 152 live ventures at the time — the exact population `retroactive-pbn-score.mjs`
  exists to backfill), the call returned the metadata **completely unchanged**, with no error. The
  caller saw no `writeError` and reported success for a verdict that was never persisted. Fixed by
  collapsing to a single-level `jsonb_set` on `{stage_zero}` merged via `||`, which correctly
  creates the key when absent and preserves sibling `stage_zero` fields when present.
- **The "already scored" guard is now atomic**, not a check-then-act SELECT-then-UPDATE — it's
  folded into the `UPDATE ... WHERE` predicate itself, so two concurrent calls for the same venture
  can't race past the check before either commits.
- **Both leg of the pipeline touch triggers on `ventures`** that a naive `INSERT`/behavioral-proof
  didn't originally account for: `trg_enforce_stage0_origin` (blocks direct INSERT unless
  `leo.stage0_bypass` is set) and `auto_populate_company_id_trigger` (raises for a NULL
  `company_id` outside a real auth session — and `company_id` **does** carry a live FK to
  `companies(id)`, confirmed via `pg_constraint`; an `information_schema`-based check that reported
  otherwise was wrong). The migration's own `DO $verify$` block now disables the second trigger for
  its transaction rather than fabricating a `company_id`.
- **S1/S2, carried forward as FR-9 preconditions, not fixed here**: the PBN leg's storage integrity
  is weaker than the two attestation legs' append-only/audit-trail guarantees (plain mutable jsonb,
  writer-supplied timestamp) — a gate is only as strong as its weakest input, and PBN is that input
  today. The `--fleet-summary` promotion window also counts *rows* (one per venture per sweep
  cycle), not *cycles* — with few live ventures, "5 most recent rows" can span less than 2 real
  sweep cycles. Both are pre-existing design questions outside this SD's scope; a future SD should
  resolve them before ever flipping either layer from observe-only to enforcing.

## The producer-agnostic contract (SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-2)

`fetchLatestAttestation()` / `evaluateCrackGateStatus()` (`lib/eva/lifecycle/crack-gate-evaluator.js`)
read a `venture_gate_attestations` row by `(venture_id, check_type)` only — they never branch on
`attested_by`/`produced_by`. This is the named verdict contract: any row that satisfies the
table's own schema/CHECK constraints is honored identically regardless of producer. Today the
only `stage17_judgment` producer is a human via `record-gate-attestation.mjs` (above); when APA
Child E ships its automated producer, it satisfies the identical contract with zero change to the
read path. `tests/unit/marketing/crack-gate-evaluator.test.js`'s "FR-2 producer-agnostic contract"
block proves this against two differently-attributed row shapes (human vs. a hypothetical
APA-E-shaped machine actor).

FR-2 also enriched Stage-17's own pre-existing `eva_stage_gate_results` row (via
`recordGateResult()`'s `criteria` param, in `stage-17-blueprint-review.js`) with structured
judgment evidence (thresholds applied, gap counts, wireframe-gating flag) — this stays entirely
within Stage-17's own audit trail and does **not** write to `venture_gate_attestations`. FR-2
deliberately does not add an automated attestation write from Stage-17's own scoring pass: see
"Explicitly out of scope" below.

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
