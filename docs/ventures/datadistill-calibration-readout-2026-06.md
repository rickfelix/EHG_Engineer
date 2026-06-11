# DataDistill Honest-Launch Calibration Readout — 2026-06

**SD:** SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 · **Venture:** DataDistill (`510177ba-435f-4dd7-bfa5-6154cc8cf54b`) · **Audience:** Adam roadmap (dq-review-adam lineage)
**Status:** stages 20–24 complete (first venture ever to enter stage 24); launch decision pending via coordinator; this document updates as 24→26 completes.

## Purpose

First clean calibration cohort: every gate verdict below is evidence-backed (`gate_criteria` populated, `evaluated_by` non-null), every override a recorded `chairman_decisions` row. Historical gate history (1,102 rows, evaluated_by NULL) is build-out-contaminated; this cohort is the new baseline.

## Per-gate predicted-vs-actual

| Gate | Predicted (what the system said) | Actual (what honest evaluation concluded) | Calibration note |
|------|----------------------------------|-------------------------------------------|------------------|
| S15 exit (Architecture taste) | ESCALATE — "No dimension scores provided. Chairman review required." (2026-05-31) | Chairman override `5338c897`: architecture implicitly accepted by 8 subsequent build stages (MVP built, security audit done). | MISCALIBRATED-MACHINERY: the ESCALATE was a missing-scores gap, not a substantive rejection. Taste gates emitting no dimension scores produce un-actionable escalations. |
| S23 entry+exit (2026-06-01 rows) | passed=false, contentless (correlationId only, no scores/notes) | Machinery no-op — superseded by honest re-evaluation. | FALSE NEGATIVE class: contentless fail rows carry zero diagnostic value and blocked the venture under binding gates. |
| S20 exit (Code Quality, re-run) | — (never produced canonical artifact before) | PASS via Gemini validation; `code_quality_report` persisted (first ever — the type was blocked by a DB constraint, defect #6). | Pre-fix, S23's code_quality category was structurally unsatisfiable fleet-wide. |
| S23 exit (Launch Readiness, re-run) | SKIPPED → (post-fixes) READY, 100%, 3/3 required pass | Chairman GO `f184cc80`: advance 23→24. | WELL-CALIBRATED after defects fixed: gate verdict and chairman judgment agreed. The first SKIPPED was honest signal of genuinely-missing upstream artifacts. |
| S24 entry | READY precondition satisfied | PASS — first venture in stage 24. | — |
| S24 exit (Go Live analysis) | ready_to_launch, 3 channels (blog_seo, twitter_x, email) | Pending chairman launch decision (routed via coordinator, corr `13a64707`). | — |

## First-contact defect log (FR-3)

9 defects on first live contact with S20–S24, all fixed forward (PR #4635, merged; 2 prod migrations applied):

| # | Class | Defect | Disposition |
|---|-------|--------|-------------|
| 1 | gate-debt | S15 ESCALATE + S23 contentless fail stranded as unresolved blocking debt | Resolved: chairman override (S15) + honest re-eval (S23) |
| 2 | contract-drift | stage-contracts 21–26 pre-redesign stale vs venture_stages SSOT | Fixed inline (repointed to live template schemas) |
| 3 | artifact-naming | S20 persisted generic `stage_20_analysis`, not canonical `code_quality_report` | Fixed inline (typed-artifacts wrapper) |
| 4 | contract-vs-design | Contract minItems-1 default rejected S23's designed SKIPPED (empty checklist) | Fixed inline (minItems 0) |
| 5 | llm-output-tolerance | Off-spec channel ("linkedin") hard-killed the distribution stage | Fixed inline (filter + preserve as `extra_channels`) |
| 6 | db-constraint | CHECK constraint omitted `code_quality_report` — S23 unsatisfiable fleet-wide | Migration applied (additive widening) |
| 7 | positional-swap | S23 scorer read distribution from stage 22 post-resequence | Fixed inline (any-of both positions) |
| 8 | rpc-type-cast | `fn_advance_venture_stage` text[]→jsonb cast exception — advancement impossible from any artifact-gated stage | Migration applied (function fix) |
| 9 | deps+shadowing | S24 channels: wrong stage + CROSS_STAGE_DEPS missing 21 + merge shadowing | Fixed inline (`__byType` + deps; RCA `4ef74cda`) |

## Calibration findings for the Adam roadmap

1. **The launch corridor was never traversable.** Defects #6 and #8 each independently made stages 23–24 impossible for ANY venture. "Ventures at stage 23" before this campaign got there through non-binding gates. The canary venture probe should add S20–S24 to its frontier once stable.
2. **Contentless gate rows are worse than no rows** (S23 2026-06-01 class): they block under binding enforcement while carrying zero diagnostic signal. Gate writers should be required to populate notes/score or not write.
3. **Taste-gate ESCALATE without dimension scores is un-actionable** (S15 class) — the chairman had nothing to review. Escalations should carry the evidence they demand review of.
4. **Positional-swap residue from the S18–26 resequence is a live defect class** (#2, #7, #9 — three independent instances). A drift-lint of stage-numbered reads vs venture_stages SSOT would catch the remainder statically.
5. **Gate-vs-chairman agreement was perfect post-fix** (S23 READY → chairman GO): early evidence the gate system calibrates well once the machinery actually runs.

## Outstanding

- S24 launch decision (chairman, via coordinator) → 24→25→26 run + post-launch/growth gate rows.
- Final predicted-vs-actual entries for S25/S26 once executed.
