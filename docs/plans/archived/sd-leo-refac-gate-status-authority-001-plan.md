<!-- Archived from: C:/Users/rickf/.claude/plans/sd-gate-status-authority-unification.md -->
<!-- SD Key: SD-LEO-REFAC-GATE-STATUS-AUTHORITY-001 -->
<!-- Archived at: 2026-05-12T20:05:47.249Z -->

# Gate Status Authority Unification — worker-state-driven UI labels for gate stages

## Priority
high

## Description

The VentureActionBar conditional chain renders "Awaiting Decision" for all 15 gate-type stages (kill + promotion + review-mode) whenever `hasDecisionPending === false`, regardless of whether the worker has actually finished its stage analysis. Result: during the ~10-180 second window the worker spends analyzing a gate stage, the chairman sees a label that falsely implies they should act — when in reality the system is still processing.

Empirical witness: NameSignal venture (`57e2645a-8288-4b55-9a44-0805ad4a3df1`) on 2026-05-12 cascaded S11 → S12 → S13 after Continue at S11. Between 19:58:02 (advance to S13) and 20:01:02 (chairman_decisions row created), the UI displayed "Awaiting Decision" with no buttons + a generic empty placeholder body. The user reported: *"when it got to stage 13, it said 'awaiting chairman decision' or something like that. When really what it was doing was processing in the background, and that's not consistent with the earlier stages."*

The non-gate stages (S12 in the witness, plus S1/S2/S4/S6/S14/S15/S20/S21/S22/S26 = 11 total) DO show "Processing" correctly during their worker-analysis windows because they hit the `isWorkerProcessing` branch later in the conditional chain. The 15 gate stages (S3, S5, S7, S8, S9, S10, S11, S13, S16, S17, S18, S19, S23, S24, S25) get short-circuited at the `(isGate || isReviewMode) && !hasDecisionPending` branch BEFORE the worker-processing check is consulted.

Same producer/consumer drift class as the quadrilogy shipped 2026-05-12 (gate decision / artifact / UI surface / auto-advance eligibility), now at the **gate stage-status display surface**. The UI infers "chairman should act" from `(isGate, !hasDecisionPending)` without consulting `venture_stage_work.stage_status` — which the worker writes authoritatively. Five SDs, one root cause across five architectural seams.

## Rationale

User direct quote 2026-05-12 (post-NameSignal-S13-witness): *"file the SD and drive through like the prior four"*. Plus a separate directive to *"look to see if there is a larger extent of condition on any of the other stages where there is a gate"* — answered: 15 of 26 stages affected, ~58% of pipeline surface area.

Prior related SDs (the quadrilogy this SD closes into a pentalogy):
- SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 — gate decision logic
- SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 — gate artifact-name
- SD-LEO-REFAC-GATE-PATTERN-UNIFICATION-001 — gate UI surface
- SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 — auto-advance eligibility
- **This SD** — gate stage-status display authority

## Scope (Functional Requirements)

FR-1: VentureActionBar.tsx consumes `stageWork.stage_status` (already available via the existing `useVentureWorkflow(venture.id)` call at line 43) as the authoritative worker-state signal. The component already destructures `stageWork`; the change is to USE it for branching, not to add a new hook.

FR-2: Re-order the conditional chain so worker-processing state wins over the "Awaiting Decision" gate fallback. The new precedence:
1. `isTransitioning` → "Advancing..."
2. `isFinalStage` → "Final"
3. `hasDecisionPending && isGlobalAutoApprove` → "Auto-advancing..." (auto-advance happy path)
4. `showGateActions (hasDecisionPending)` → CTAs + pending-approval composite indicator
5. **NEW**: worker mid-analysis (`stageWorkForCurrentStage?.stage_status === 'pending' || === 'in_progress'`) → "Analyzing stage..." with spinner (FR-2 critical insertion point)
6. `(isGate || isReviewMode) && !hasDecisionPending` → "Awaiting Decision" (the genuine race-window edge case, now correctly narrow)
7. `isWorkerProcessing` (autoAdvance-derived) → "Processing"
8. `showManualComplete` → Complete button
9. default → "Processing" fallback

FR-3: Helper hook `useStageWorkForStage(ventureId, stageNumber)` reads the venture_stage_work row for the current stage from React Query (60s TTL + realtime invalidation on venture_stage_work UPDATE — pattern matches useStageGovernance from VGU-001). Without this, FR-2 would have to re-query inline.

FR-4: Verify `venture_stage_work` is in the supabase_realtime publication (the worker writes to it). If not, ALTER PUBLICATION supabase_realtime ADD TABLE venture_stage_work — same pattern as DB-8 from SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 for chairman_dashboard_config.

FR-5: Tests for the unified state-authority pattern:
- 15 gate-stage × 2 worker-state (pending/in_progress) tests asserting "Analyzing stage..." badge renders (NOT "Awaiting Decision")
- 15 gate-stage × completed-no-decision test asserting "Awaiting Decision" still fires for the genuine race-window
- 11 non-gate-stage × any state tests asserting no regression on the currently-correct "Processing" path
- 1 Playwright e2e advancing NameSignal through a gate stage and asserting the badge text flips from "Analyzing stage..." to the composite gate badge once the worker emits the decision
- Total: ~42 tests

## Out of Scope

- Changing the "Auto-advancing..." badge for the gate-auto-advance path (auto-advance-eligibility was settled in SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 the same day)
- Changing the composite pending-approval badge UI (settled in SD-LEO-REFAC-GATE-PATTERN-UNIFICATION-001 the same day)
- Adding a separate React Query layer for venture_stage_work — FR-3 reads from useVentureWorkflow which already loads it
- Per-stage analysis-progress indicators (percent done, ETA) — defer to UX polish follow-up
- Worker-side changes (no worker logic changes; this is a pure consumer-side correction)

## Risk

- **Realtime publication gap**: if `venture_stage_work` is not in supabase_realtime, the UI's "Analyzing stage..." badge won't auto-flip to the gate-action surface when the worker completes. Mitigation: FR-4 verifies + adds if missing; explicit test asserts realtime UPDATE flips state.
- **State-status enum drift**: if the worker introduces a new `stage_status` value (e.g., 'failed', 'retrying'), the FR-2 conditional won't catch it and falls through to the old "Awaiting Decision" — same defect class re-emerges. Mitigation: TypeScript discriminated union on stage_status + exhaustive switch with default → "Processing" fallback.
- **Race condition**: between `stage_status='completed'` and `chairman_decisions` row creation, the genuine "Awaiting Decision" branch fires briefly (~milliseconds). This is the intended behavior post-fix. Mitigation: PLAN-phase DESIGN review confirms this is acceptable; if not, add a `last_completed_at < 5s` guard.

## Success Criteria

1. VentureActionBar branches on `stageWork.stage_status` before the gate-fallback "Awaiting Decision"
2. 15 gate stages render "Analyzing stage..." with spinner during worker mid-analysis (verified via NameSignal S13 simulation OR fresh fixture venture)
3. 11 non-gate stages continue to render "Processing" (no regression)
4. "Awaiting Decision" still fires for the genuine race-window (worker completed, decision row not yet emitted)
5. ≥40 tests passing (15 gate × 2 + 15 race-window + 11 non-gate + ≥1 Playwright)
6. CI gates green; ≥85% sub-agent confidence on DESIGN + TESTING + REGRESSION
7. Manual smoke on NameSignal: advance a venture through a gate stage; verify the badge text flips from "Analyzing stage..." → composite gate badge (e.g., "Kill Gate" + GO/NO-GO) once worker emits decision

## Estimated Effort

- Tier 2 SD
- LOC: ~40-80 src (conditional reorder + new helper hook + types) + ~250-350 test
- Touched files: 3-5 (VentureActionBar.tsx, new useStageWorkForStage.ts or extension, types, tests)
- 0-1 DB migration (only if FR-4 needs to ADD venture_stage_work to publication)
- Target repos: `EHG` (UI) only; possibly EHG_Engineer if FR-4 migration needed

## Dependencies

None hard. Builds on:
- `useVentureWorkflow` already loads `stageWork` (the data is already in the component)
- `venture_stage_work` table schema already has `stage_status` column with values pending/in_progress/completed
- Realtime publication membership for chairman_dashboard_config (just shipped via SD-LEO-REFAC-GATE-AUTO-ADVANCE-001) demonstrated the pattern

## Empirical Witness

NameSignal venture `57e2645a-8288-4b55-9a44-0805ad4a3df1` at S13 on 2026-05-12:
- 19:58:02 — Venture advanced from S12 to S13
- 19:58:02 to 20:01:02 — `venture_stage_work.stage_status = 'in_progress'`, no chairman_decisions row, UI showed "Awaiting Decision" with empty placeholder body. **The 3-minute UX gap.**
- 20:01:01 — Worker writes `stage_status='completed'` + advisory_data (14 keys)
- 20:01:02 — Worker writes `chairman_decisions` pending row
- 20:01:02+ — UI flips to "Kill Gate" composite badge + GO/NO-GO CTAs (correct end state)

Blast-radius math: 15 of 26 stages × ~60-180 second worker windows × every time a venture advances = chairman gets a misleading "Awaiting Decision" prompt many times per venture lifecycle.

## Deletion Audit (Q8)

- Original proposal included per-stage analysis-progress UI (percent done, ETA). **Trimmed** — defer to UX polish follow-up. Saves ~150 LOC of progress-bar work.
- Original proposal included migrating useVentureWorkflow's React Query setup to expose stageWork as a separate hook. **Trimmed** — read directly from existing destructured value. Saves ~50 LOC.
- Total scope reduction: ~30% LOC, 0 FRs.
