# DataDistill Honest-Launch Calibration Readout

**Category**: Report | **Status**: Draft | **Version**: 0.2.0 | **Author**: SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 | **Last Updated**: 2026-06-11 | **Tags**: calibration, gates, honest-launch, adam-roadmap

FR-4 deliverable: per gate crossed, predicted-vs-actual, miscalibration notes. First clean
calibration cohort — every verdict below is evidence-backed (gate_criteria populated per
SD-LEO-FIX-PERSIST-KILL-GATE-001) and every override chairman-recorded (SD-LEO-FIX-MAKE-VENTURE-STAGE-001).

Venture: DataDistill `510177ba` (Bun CLI/library; repo public, no hosted deployment — honest scope).

## Gates crossed

| Gate | Machine verdict (predicted) | Chairman/reality (actual) | Calibration note |
|---|---|---|---|
| S15 exit (taste) | ESCALATE (taste gate flagged) | Chairman OVERRIDE approved (decision 5338c897, 2026-06-11 11:05) — deliberate build-out forcing, recorded first-class | Gate correctly escalated an ambiguous-taste case; the override path worked as designed (recording, not bypass). No miscalibration — this is the intended human-in-loop shape. |
| S23 exit (launch readiness kill gate) | READY, 100% readiness, 3/3 required pass + 3 advisory (analytics/monitoring/legal: no automated producer, chairman attestation) | Chairman GO (decision f184cc80, 12:29) | Aligned. Caveat for calibration: the 3 advisory categories pass by ATTESTATION not evidence — the gate predicted READY partly on unverifiable categories. Future: advisory-with-attestation should be visually distinct from verified-pass in the checklist artifact. |
| S23→24 advance | checkGateDebt: no blocking debt; chairman decision satisfies | Advanced 12:33 via fn_advance_venture_stage (transition 74991f5c, full handoff_data audit) | Aligned. Binding-gate machinery exercised live for the first time on a real venture. |
| S24 exit (go-live) | Analyzer: ready_to_launch, READY, 3 channels (targeting ready; ad-copy headlines NOT ready — `ad_copy_ready=false` all 3) | Chairman GO via coordinator (decision 9c44db4a, 13:08; pilot scope explicit) — launched_at stamped, launch_metrics t=0 emitted, advanced 24→25 by the approval flow | Aligned, with precedent set: "targeting ready, copy pending" is acceptable launch-readiness for pilot scope. Calibration note: the exit gate itself (launch_metrics verifier) was structurally unsatisfiable until defect #10 — gate declarations must ship WITH their producers. |
| S25 exit (post-launch review) | Review persisted honestly at t=0: zero metrics (no elapsed window), 2 assumptions validated / 2 invalidated, 4 learnings (artifact 7d197a3e) | PENDING chairman decision bf060e27 (routed via coordinator) | t=0 post-launch review is definitionally thin — stage contract should gate on a minimum elapsed window or accept an explicit t0_review mode. |
| S26 entry/exit | — not yet reached — | — | — |

## First-contact defect log (FR-3)

| # | Defect | Class | Fix |
|---|---|---|---|
| 2 | Contracts 21-26 pre-redesign stale (phantom QA/release products); S23 re-eval hard-blocked on phantom `stage-22.promotion_gate` | stale-SSOT-mirror | Contracts repointed to venture_stages SSOT; consumes optional (commit 4b0d5b22) |
| 3 | S20 persisted generic `stage_20_analysis`; S23 preflight requires typed `code_quality_report` → every venture reached S23 as SKIPPED | typed-artifact-contract gap | S20 analysisStep wraps result in typed artifact (commit 4b0d5b22) |
| 6 | `venture_artifacts_artifact_type_check` omitted `code_quality_report` — no venture could EVER satisfy S23's code_quality category | constraint/registry drift | Prod migration applied (20260611, additive CHECK widening) |
| 9 | S24 read channels only from stage22Data; distribution lives at S21 post-resequence → zero channels on first contact | positional-upstream-read | any-of read via `__byType` accessors (commit 4b0d5b22) |
| (cast) | `fn_advance_venture_stage` required-artifacts cast defect | RPC type cast | Migration 20260611_fix_advance_stage_required_artifacts_cast.sql |
| (merge-shadow) | Merged stageNNData is last-writer-wins across a stage's artifacts — later co-output (growth_playbook) shadows earlier fields | artifact-merge semantics | `__byType` lossless accessor used at all new read sites |
| 10 | S24 exit gate (FR-5 verifiers) requires a current `launch_metrics` artifact with channels activated — NO producer existed anywhere; 24→25 advance structurally impossible for every venture | gate-without-producer | S24 go-live analyzer now emits launch_metrics t=0 on launch decision (commit pending); live artifact persisted via typed-artifacts batch path |

## Calibration synthesis (to complete at S26)

- Pattern so far: the GATES are better calibrated than their INPUTS — both crossed gates aligned with chairman verdicts, but S23's readiness was partly attestation-based and S24's "ready" tolerates missing ad copy. Calibration work should target input honesty (attestation vs evidence flags) before re-tuning thresholds.
- The unexercised-stage defect rate (6 defects in S20-24 contact) validates the campaign premise: every defect found here is one the synthetic canary (SD-LEO-INFRA-SYNTHETIC-CANARY-VENTURE-001) will catch routinely going forward; frontier extension past S23 now unblocked.

*Sections above S25/S26 + final synthesis to be completed as the campaign reaches stage 26.*
