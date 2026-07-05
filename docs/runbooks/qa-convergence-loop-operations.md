# Runbook: QA Convergence-Loop Operations

**Category**: Protocol
**Status**: Approved
**Version**: 1.0.0
**Author**: SD-LEO-DOC-CHAIRMAN-REVIEW-RUNBOOK-001
**Last Updated**: 2026-07-05
**Tags**: qa, convergence-loop, adherence-rubric, post-build-verdicts

> **Update trigger**: The pass-bar thresholds and verdict counts cited below are
> sourced live from `strategic_directives_v2.metadata.rubric_thresholds_ratified`
> (on `SD-LEO-INFRA-POST-BUILD-ARTIFACT-001`) and the `post_build_verdicts` table.
> Both can change independently of this doc — **re-verify by direct query** before
> trusting a cited number, and re-verify this doc whenever the ratified thresholds
> or gate stages change (per the chairman's own change policy, see "Ratified Pass
> Bar" below).

## Purpose

This is the operator-facing end-to-end description of the QA convergence
loop: how a venture's built product is checked against what was planned,
scored, remediated, and finally handed to the chairman for a taste-only
review. It was built by the `SD-LEO-INFRA-POST-BUILD-ARTIFACT-001` family
(children -A through -E) and consumed by
`SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001`. Before this doc, the design
substance existed only in SD metadata, DB rows, and session context.

See also: [chairman-product-review-runbook.md](./chairman-product-review-runbook.md)
(what happens after this loop converges).

## Pipeline Order

The loop runs in a fixed sequence, with the chairman review always **last**:

1. **Completeness** — enumerate every planning artifact (blueprint user-story
   pack, persona/brand implied surfaces, data model, technical architecture,
   schema spec, positioning brief) and confirm each has a corresponding,
   evidence-linked entry to score against. Nothing is silently dropped from
   the scope of scoring.
2. **Adherence rubric** — score each dimension (see "Ratified Pass Bar"
   below) on a behaviorally-anchored 1-5 scale.
3. **Deviation trichotomy** — classify every gap (see "Deviation Semantics"
   below).
4. **Remediation** — route every below-bar dimension or undocumented
   deviation to a fix (see "Remediation Routing" below).
5. **3-cycle convergence bound** — remediation + rescoring repeats for up to
   3 cycles.
6. **Escalation** — if the loop has not converged after 3 cycles, escalate
   rather than looping indefinitely.
7. **Chairman review** — runs strictly **after** convergence (or escalation
   resolution), per
   [chairman-product-review-runbook.md](./chairman-product-review-runbook.md).
   The chairman elected strict QA-before-review even for the first venture
   through this gate (MarketLens) — "let the QA design run first" — despite
   an available concurrent-informed exception.

## Ratified Pass Bar

Chairman-ratified 2026-07-04, stored in
`strategic_directives_v2.metadata.rubric_thresholds_ratified` on
`SD-LEO-INFRA-POST-BUILD-ARTIFACT-001`:

> **Every dimension >= 3 AND mean >= 4 AND zero unscored dimensions.**
> Scale: behaviorally-anchored 1-5.

**Change policy**: threshold changes are **future-ventures-only** — a fresh
ratification is required, and the venture currently in the loop is never
retroactively re-scored under new thresholds (the gate-freeze that applies
to gate logic extends to rubric thresholds too).

## Deviation Semantics

Every planning-artifact-to-built-product gap is classified into exactly one
of three buckets — no fourth "unclear" bucket exists:

| Classification | Meaning |
|---|---|
| **Built-as-planned** | The built product matches the planning artifact; no deviation. |
| **Deviated-documented** | The build differs from the plan, but the deviation carries a recorded weight and a reason-quality assessment (i.e. someone explicitly decided to deviate, and said why). |
| **Deviated-UNDOCUMENTED** | The build differs from the plan and no reason was recorded. This is the class that matters most — it's silent scope loss. |

## Scorer Independence Rules

These rules exist to prevent a builder from grading its own work:

- **Scorer != builder != remediator.** The person/process that built an
  artifact does not score it; the person/process that scores it does not
  remediate it.
- **Blind rescores.** When a remediation cycle completes, the rescore is
  blind to the prior score (not anchored to "well it was a 2, now it should
  be higher").
- **Evidence-linked-or-unscored.** A dimension cannot receive a score without
  a linked evidence reference (route, component, schema object, test, or
  screenshot). "Could not verify" is never silently treated as "passing" —
  it is left unscored, which itself blocks the pass bar (see "zero unscored
  dimensions" above).

## Where Verdicts Live

Per-item disposition is recorded in the `post_build_verdicts` table:

- `disposition`: one of `BUILT`, `PARTIAL`, `MISSING`
- `evidence_refs`: the linked evidence for that disposition (required —
  see "Evidence-linked-or-unscored" above)
- Other columns: `id`, `venture_id`, `artifact_type`, `claim_ref`,
  `deviation_artifact_id`, `claim_description`, `created_at`, `updated_at`

### Worked Example: MarketLens First Run

As of this writing, `post_build_verdicts` holds **46 total rows** for the
MarketLens first run, verified live by direct query:

| Disposition | Count |
|---|---|
| BUILT | 24 |
| PARTIAL | 18 |
| MISSING | 4 |

**Do not copy these numbers into a future scorecard read without
re-querying** — they describe one specific historical run and will not
match subsequent runs or other ventures.

## Remediation Routing

A below-bar dimension or an undocumented deviation is routed:

```
verdict -> router -> QF (small, ≤tier-appropriate LOC) or SD (larger scope)
```

The router (`lib/eva/convergence-loop.js`'s `routeRemediation`) dispatches
each gap to one of two injected functions depending on the gap kind:
- **Adherence-kind gaps** -> `fileAdherenceFix` -> tier 1/2 creates a Quick
  Fix, tier 3 creates an SD.
- **Completeness-kind / unscored-dimension gaps** -> `backfillCompletenessGap`
  -> a "circularity guard" rejects any backfill sourced from the build/repo
  itself (it must be genuinely upstream evidence, not the same artifact
  re-asserting itself as its own proof).

### Known-Failure Sidebar: QF-20260705-633 (the writer-injection gap)

The router's injected functions (`createQuickFixFn`, `createSdFn`,
`backfillFn`) have **no defaults**. When a call site omitted them, every
routed gap silently threw inside `routeRemediation`'s own try/catch and was
pushed into an `errors`/`deferred` array — **no QF or SD was ever actually
created**, and nothing visibly failed. This was root-caused and fixed by
`QF-20260705-633`: `lib/eva/post-build-convergence-gate.js` now imports
`createQuickFixWriter(supabase)` / `createSdWriter()` from
`lib/eva/convergence-remediation-writers.js` and passes them explicitly at
the call site. **Operator takeaway**: if remediation counts look
suspiciously low or zero after a scoring run, check that the call site
wiring the convergence loop actually passes all three writer functions —
a silent omission here produces no error, just missing remediation.

## Synthetic-Persona T3 Walk (REQUIRED, not optional)

A synthetic-persona journey walk — driving the assembled, deployed/local
product UI with generated personas through the core journeys (land ->
signup -> submit -> results -> feedback) — is a **REQUIRED** evidence layer
of the adherence scoring, not an optional nice-to-have. It is the one layer
that exercises the assembled whole; per-SD test gates do not cover this
(they validate their own SD's slice in isolation). A scorecard without a
passing synthetic-persona T3 walk is incomplete regardless of its other
dimension scores.

## Chairman-as-Formal-Holdout

The chairman's own review (which runs after this loop converges, per
[chairman-product-review-runbook.md](./chairman-product-review-runbook.md))
doubles as a **formal holdout set** for the loop's own validity. If the
loop is working, the chairman's catch-rate — the number of real issues he
finds that the automated pipeline missed — should trend toward zero across
successive walkthroughs. A catch-rate that stays flat or rises is itself a
signal that the loop's scoring or remediation has a gap, independent of any
single venture's outcome.

## Smoke Test

To verify this doc is current: query `post_build_verdicts` for the current
disposition counts and compare against the worked-example table above (they
will very likely differ — that's expected and fine), and confirm the
threshold values in `strategic_directives_v2.metadata.rubric_thresholds_ratified`
on `SD-LEO-INFRA-POST-BUILD-ARTIFACT-001` still read exactly "every
dimension >= 3 AND mean >= 4 AND zero unscored dimensions." If either query
fails or the values have changed, this doc needs a refresh.
