# Distill refine: reconcile against INSTITUTIONS (not just SDs) + make reconcile STANDING

## Type
infrastructure

## Target Repos
EHG_Engineer

## Summary
Chairman-ratified Solomon hand-off 2026-07-17 (seams 1+3; capture .prd-payloads/CAPTURE-SOLOMON-DISTILL-INTEGRATION-SEAMS.md). The distill refine Phase D reconciles intake items against `strategic_directives_v2` ONLY — so anything already institutionalized as a role duty / protocol section / contract clause is invisible and resurfaces in the chairman review queue (witnessed today: 3 Fable-era Todoist items — deep-arch-review, flaky-RCA, dedup-sweep — that are already CLAUDE_SOLOMON.md Cluster 1/3 duties resurfaced as "new"). Separately, reconcile is not STANDING — clustering (213-item wave 5, hundreds pending) outruns dedup/reconcile/score, so items reach waves/the review queue without a done-state check.

## Functional Requirements
### FR-1: Reconcile against institutions too (seam 1)
Extend refine Phase D matching to also check `leo_protocol_sections` (role-duty / contract / protocol clauses), not just `strategic_directives_v2`. An intake item whose intent is already absorbed by a protocol section is matched, not surfaced as new.
### FR-2: `already_institutionalized` disposition (seam 1)
Add `already_institutionalized` as a first-class disposition alongside `already_done`, carrying a POINTER to the absorbing section (section id/title) so the chairman/Adam can verify the absorption rather than re-triage. Ground-truth the current disposition enum before extending it.
### FR-3: Reconcile is STANDING on the default path (seam 3)
Fold reconcile into the DEFAULT pipeline path so nothing reaches a wave OR the chairman review queue without a done-state + institution check first (honors the dedup-vs-DONE-STATE doctrine). Not an opt-in step run occasionally.
### FR-4: Explicit NON-GOAL (seam 4, ratified DON'T-build)
Encode as an explicit non-goal in this SD: do NOT wire Solomon into per-item distill scoring. 400+-item 4-persona scoring is Adam's breadth/automation altitude; Solomon's touchpoints are retro output-review (first cycles) then exception-only. This clause exists so a future sourcing pass does not "helpfully" add the oracle to the scoring loop.

## Success Metrics
- metric: institutionalized items resurfacing as new in the chairman review queue; target: 0 (the 3 Fable-era items reconcile to CLAUDE_SOLOMON.md)
- metric: items reaching a wave/review queue without a reconcile done-state check; target: 0
- metric: Solomon wired into per-item scoring; target: no (non-goal held)

## Smoke Test Steps
1. instruction: Re-run refine on the current queue; expected_outcome: the 3 Fable-era items (deep-arch-review, flaky-RCA, dedup-sweep) disposition as already_institutionalized with a CLAUDE_SOLOMON.md pointer, not resurfaced.
2. instruction: Run the pipeline default path on a fresh intake batch; expected_outcome: reconcile (SD + institution + done-state) executed before anything reaches a wave/review queue.

## Sizing / Notes
Tier 2-3 (pipeline path change). SOURCE-AND-GO (Solomon-diagnosed, chairman-ratified — reasoning done; no re-consult). Plan-integrity work (keeps the chairman review queue honest). Relates SD-LEO-INFRA-DISTILL-ROADMAP-SINGLE-WRITER-001 (seam 2).
