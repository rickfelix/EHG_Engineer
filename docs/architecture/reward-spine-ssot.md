---
category: architecture
status: approved
version: 1.0.0
author: SD-LEO-INFRA-REWARD-SPINE-ONE-001-A
last_updated: 2026-07-04
tags: [reward-spine, outcomes, gauges, anti-goodhart, governance]
---

# Reward Spine — One Outcome-Grounded Definition of "Better"

**SD:** SD-LEO-INFRA-REWARD-SPINE-ONE-001 (parent, orchestrator) / SD-LEO-INFRA-REWARD-SPINE-ONE-001-A (this child)

**Purpose:** a single, quotable definition of what "better" means for LEO's self-improvement
loops, so that any consumer — a gate, a gauge, a dispatch decision — can be checked against a
real outcome instead of a process proxy. This doc does not introduce any new subsystem; every
layer below composes over an existing, already-shipped carrier.

## Diagnosis

Today's loops optimize **process proxies** that have been Goodharted:
`retrospectives.quality_score` twin-peaks just above its own gate across thousands of retros;
adherence probes PASS on windows that contain the very failure class they're meant to catch;
an SD can carry an 11/11-green sprint with no actual product surface shipped. Reinforcement
currently rewards **looking compliant**, not **being effective**.

## THE RULE

> **Anything that gates or routes behavior must trace to L1, L2, or L3. Process gauges
> (`retrospectives.quality_score`, adherence-probe pass-rate, raw gate pass-rate) are
> DIAGNOSTICS ONLY — they may inform investigation, but no consumer may cite one as an
> optimization target or a gating threshold.**

This is deliberately one sentence so Child C's grep-verifiable lint check can quote it directly.

## The three outcome layers

### L1 — WORK (per completed SD/QF)

**Definition:** a completed SD/QF's outcome is `shipped-clean` iff **shipped-clean AND
no-recurrence-in-window AND no-revert**. Anything else is `unproven` (not `clean` — see the
coverage caveat below) or `caused_rework`.

**Real carriers (verified live, 2026-07-04, this SD):**

| Signal | Carrier | Columns/functions |
|---|---|---|
| Shipped-clean (merge-level) | `merge_witness_telemetry` | `repo, work_key, tier, lane, via_mergework, overall, rungs, evaluated_at` |
| No-recurrence | `issue_patterns` | `first_seen_sd_id, last_seen_sd_id, resolution_date, dedup_fingerprint` |
| No-revert / false-green detection | `scripts/ci/red-merge-detector.mjs` | `decide()`, `detectBaselineRot()`, `genuineReachableRegressions()` |
| Completion-date windowing | `v_sd_completion_integrity` | `is_ghost_completed`, `updated_at` |

**⚠️ Known coverage gap (do not paper over):** as of this SD, `merge_witness_telemetry.overall`
reads `'observe-only'` on every sampled row (100% of a 1000-row sample), and the most recent
rows carry `rungs = []`. The merge-witness ladder (`lib/ship/merge-witness-ladder.mjs`) exists
and is wired for observation, but is **not yet emitting real per-rung pass/fail verdicts** for
the majority of merges. **Any L1 consumer (Child D) MUST print an honest coverage denominator
("N/M items had usable witness data") rather than silently treating unwitnessed work as
clean.** Treating `rungs = []` as "no issues found" would recreate exactly the Goodhart failure
this spine exists to close.

**⚠️ Ghost-completed noise:** the original reward-spine design brief cited
`v_sd_completion_integrity` as showing 2,422/3,732 ghost-completed SDs. **That figure is
stale/wrong.** A live query on 2026-07-04 (this SD) shows **269 ghost-completed out of 4,890
total rows**. Any backtest MUST re-query `v_sd_completion_integrity` live at build/run time —
never copy either the old or the new number into code as a constant.

### L2 — LESSON (per applied advisory/pattern)

**Definition:** a lesson's outcome is `worked` iff it was applied AND its target recurrence
stopped, with a named closer-of-record (not the proposer).

**Real carriers — do NOT rebuild, these already ship:**

- **Leaf-2 (closure gate):** `lib/governance/pattern-closure.js` — `closeIssuePatterns()`,
  `hasValidPreventionArtifact()`. Gates `issue_patterns` resolution on a non-empty
  `prevention_checklist` (a named guard/gate/test, not a hand-wave). Enforcement flag:
  `chairman_dashboard_config.metadata.pattern_registry_enforce_prevention_required`
  (**currently OFF** — byte-identical-to-today behavior until an operator flips it after
  observing at least one leaf-3 measurement window). SQL twin:
  `resolve_completed_sd_patterns()` in
  `database/migrations/20260704_pattern_closure_prevention_gate.sql` (same flag, same rule,
  fires from the SD-completion DB trigger which cannot import a JS module).
- **Leaf-3 (per-loop health KPI):** `lib/governance/per-loop-health-gauges.js` —
  `computeLoopHealth()`, 6 `LOOP_IDS` (A–F). Reads `v_improvement_ledger` (documented in
  `docs/architecture/improvement-ledger-ssot-spine.md` — a UNION of 6 loop views over
  `protocol_improvement_queue`, `session_coordination`, `retrospectives`,
  `convergence_ledger_runs`/`stages`, `feedback`, `issue_patterns`). Computes
  `witnessesBeforePrevention` (an un-prevented backlog) and `recurrenceAfterClosure` (a
  RECORD reappearing after that cycle's own PREVENT) — **this is the recurrence-after-closure
  KPI**, already live, not something this SD's children build fresh.
- **The advice ledger:** `solomon_advice_outcome_ledger` — cols `id, advisory_id,
  correlation_id, sd_key, proposal_summary, proposal_kind, decision, decision_by, decision_at,
  outcome, outcome_sd_key, outcome_ref, cost_tokens, cost_wall_ms, created_at, updated_at`.
  Live count (2026-07-04): **80/87 rows `outcome='unknown'`** (the original brief's "64/64" is
  stale — the table has grown). `scripts/solomon-ledger-reconcile.cjs` already implements
  auto-close from downstream SD terminal status (`completed`→`shipped_clean`,
  `cancelled`→`reverted`) and has run manually at least once (7 rows closed to
  `shipped_clean`). **Its gap is not logic — it's that nothing schedules it, and there is no
  `closed_by`/`closed_at` column to record the closer-of-record.** This is Child B's scope.

### L3 — VENTURE (usage telemetry / cash-burn / customer events)

**Definition:** a venture's outcome is grounded in real usage, revenue, and customer signal —
not internal build velocity.

**Carrier:** venture telemetry feeds now landing (owned by the Resilient sprint E/D items).
This spine defines the **interface** L3 must eventually satisfy (a venture-level analog of
L1's shipped-clean/no-recurrence/no-revert triad); it does not build L3 instrumentation itself
— explicitly out of scope for this SD (see parent PRD TR-1).

## Anti-Goodhart mechanics

1. **Closure by a different actor than the scored one.** Example already in this codebase:
   `scripts/solomon-ledger-reconcile.cjs` closes a ledger row by reading
   `strategic_directives_v2.status` (the downstream SD's own terminal state), never by asking
   the original advisory's author whether it "worked."
2. **No self-reported outcomes.** Every L1/L2 signal above is captured from downstream system
   state (a merge event, a completion timestamp, a recurrence count) — never a free-text
   self-assessment.
3. **Periodic sample-audit of the signal itself.** The signal's own health is measured, not
   just what it measures — this is exactly what leaf-3's `witnessesBeforePrevention` /
   `recurrenceAfterClosure` KPIs do for L2, and what Child D's honest coverage denominator does
   for L1.

## Diagnostic-only gauges (explicitly demoted)

Named here so Child C's machine-checkable marking has an unambiguous starting list:

- `retrospectives.quality_score` — twin-peaks just above its own gate; diagnostic only.
- Adherence-probe pass-rate — passes on windows containing the very failure class it should
  catch; diagnostic only.
- Raw LEO gate pass-rate (any handoff gate score) — measures process compliance, not outcome;
  diagnostic only.

No consumer may cite any of the above as a gating threshold or an optimization target going
forward (Child C adds the grep-verifiable check).

## Children of this spine (execution order)

| Child | Scope | Depends on |
|---|---|---|
| **A** (this doc) | SSOT definitions | none |
| **B** | Advice-ledger closure: schedule `solomon-ledger-reconcile.cjs`, add closer-of-record column(s) | A |
| **C** | Target-vs-diagnostic marking on `lib/governance/gauge-registry.js`'s `GAUGE_REGISTRY` + grep-verifiable lint | A |
| **D** | L1 per-work-item computation + backtest CLI, honest coverage denominator | A |

## Re-verify-live instruction

The two corrected numbers in this doc — **269/4,890 ghost-completed** and **merge-witness
`overall='observe-only'`/`rungs=[]` on 100% of a recent sample** — were measured 2026-07-04
during this SD's PLAN phase. **Any future consumer, especially Child D's backtest, MUST
re-query `v_sd_completion_integrity` and `merge_witness_telemetry` live at build/run time.**
Do not hardcode either figure as a constant; both will change as the system evolves.
