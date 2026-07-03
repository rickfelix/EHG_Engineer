# Ship-witness: enforce-flip readiness (Ship-witness D)

**SD**: SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D)
**Status**: Approved
**Category**: Protocol
**Version**: 1.0.0
**Last Updated**: 2026-07-03

## What this is

Sibling A's mergeWork() P1-P5 ladder (`lib/ship/merge-witness-ladder.mjs`) is
strictly OBSERVE-ONLY — its `overall` field is hardcoded to the literal
string `'observe-only'` and never blocks a real merge. This SD builds the
**capability** to compute a real pass/fail verdict and refuse a merge on it,
but does **not** activate that capability in production. Activation is a
separate, future decision gated on real adoption evidence.

Two new modules:

- `lib/ship/witness-adoption.mjs` — measures adoption. `detectUnwitnessedMerges()`
  finds platform-repo merges with **zero** `merge_witness_telemetry` row at
  all (a WATCH-HOLE — observe was skipped entirely, not merely
  recorded-and-allowed). `computeAdoptionReadiness()` answers "has adoption
  been 100%-via-witness for N consecutive days?"
- `lib/ship/ship-witness-enforcement.mjs` — `evaluateEnforcementDecision()`
  computes a real `observe`/`allow`/`block` decision, but **only** when
  `SHIP_WITNESS_ENFORCE_MODE=enforce` **and** `computeAdoptionReadiness()`
  independently reports `ready: true`. Neither condition alone is sufficient.

`lib/ship/auto-merge.mjs`'s `attemptAutoMerge()` gained one new optional
param, `enforcementDecision`. Every existing caller (including the real
`/ship` Step 6 snippet) omits it, so behavior is byte-identical to before
this SD. Only a caller that explicitly supplies
`evaluateEnforcementDecision` can ever cause a real pre-merge refusal.

## The readiness bar

`computeAdoptionReadiness()` requires **7 consecutive evidenced days at
100%-via-witness** (the design spec's own threshold — see Family status
below). Semantics:

- A day counts toward the streak only if it had **at least one merge** and
  **all** of that day's merges were witnessed.
- A day with **zero merges** is skipped — it neither breaks nor extends the
  streak. Readiness requires actual evidence, not silence.
- A day with **any** unwitnessed merge resets the streak; days before the gap
  do not count.

Run `node scripts/ship-witness-enforce-readiness.mjs` at any time to check
current readiness. It only reports — it never flips anything.

**As of this SD's delivery, readiness is false.** `merge_witness_telemetry`
has exactly one row (from PR #5415, the merge that first wired the
substrate into production). The 7-day bar cannot possibly be met yet.

## Cutover timestamp

`WITNESS_CUTOVER_ISO = '2026-07-03T03:37:35Z'` (`lib/ship/witness-adoption.mjs`)
— the instant PR #5415 (SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001) merged
and `merge_witness_telemetry` wiring went live in the real `/ship` Step 6
flow. Merges before this point are excluded from adoption scoring entirely
— the substrate did not exist to observe them, and counting them as
unwitnessed would produce a permanent false floor, not a real signal.

## The WATCH-HOLE contract

Any merge with **no** `merge_witness_telemetry` row at all means observe was
skipped entirely — a blind spot, distinct from a merge that has a telemetry
row showing a failed/bypassed rung (which means the witness caught it and is
working as designed). `lib/governance/gauge-registry.js`'s new
`ship-witness-unwitnessed-merge` entry runs on the existing
`scripts/gauge-runner.mjs` cadence and escalates any WATCH-HOLE via the
framework's existing `feedback` table pipeline — no new alerting mechanism
was built.

Two specimens are already banked as the rationale for this contract
(recorded in the SD's own description, chairman/coordinator/Adam triage
2026-07-03):

1. **Self-attested authority** — a worker self-authored the chairman
   `@approved-by` attestation in the witness-A migration itself (PR #5412,
   permanent git history).
2. **Observe-phase catch** — QF-20260702-806 force-completed with
   `merge_witness` telemetry logging `verified:false`; the witness recorded
   the exact bypass class on day 0 (observe worked as designed — this is
   the class D's enforce-flip would eventually convert from record to
   block).

## Deliberately NOT delivered by this SD

- **P4 (protection integrity) / escapeAuth**: sibling A's ladder still
  reports P4 as `not_applicable` unconditionally, even though branch
  protection (N1/P0) is now live on both platform repos. A real P4 check
  needs a dual-key audited escapeAuth table that does not exist yet — that
  is a separate, future SD's scope, not this one's.
- **Wiring `evaluateEnforcementDecision` into the real `/ship` Step 6
  snippet.** This SD ships the capability and the readiness measurement, not
  the activation. Wiring it live today would exercise dead code against zero
  real decisions (readiness is provably false) and would pre-empt the
  explicit human/chairman decision that should gate a fail-closed flip on a
  shared merge path.

## Family status

- **A** — SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 (completed): the P1-P5
  observe-only ladder + `merge_witness_telemetry` substrate.
- **B** — SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (completed): the
  `applications.trust_tier` hook (see `ship-witness-venture-trust-tier.md`).
- **C** — SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001 (completed): venture-build
  walker completion gates on a merged PR.
- **D** — SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (this SD): adoption
  measurement + gated, currently-inert enforce-flip capability.
