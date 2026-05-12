<!-- Archived from: C:/Users/rickf/.claude/plans/sd-gate-auto-advance-truth-unification.md -->
<!-- SD Key: SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 -->
<!-- Archived at: 2026-05-12T18:19:52.048Z -->

# Gate Auto-Advance Truth Unification — single source of truth between UI + worker auto-advance gating

## Priority
high

## Description

The UI's `isGlobalAutoApprove` computation in `VentureActionBar.tsx` (the consumer) does not mirror the worker's 4-layer `_canAutoAdvance` check in `lib/eva/stage-execution-worker.js:3070-3127` (the producer). Result: 4 of 26 stages enter a stuck state where the UI hides Continue/Pause/Approve CTAs (showing "Auto-advancing...") while the worker refuses to actually auto-advance — chairman is trapped with no UI affordance to proceed.

Empirical witness: NameSignal venture at S11 (Naming & Visual Identity, review-mode) on 2026-05-12. After clicking Continue at S10, the venture advanced to S11 and the UI displayed "Auto-advancing..." badge with no CTAs. The worker's `canAutoAdvance(11)` had returned false at L4 (review-mode default-pause, no `stage_overrides.stage_11.auto_proceed=true` opt-in). User reported: "right now I'm not seeing a continue button".

**This is the same writer-consumer drift class as the trilogy shipped 2026-05-12, now at the UI-render layer for auto-advance gating specifically.** The trilogy closed gate-decision unification (SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001), gate-artifact name unification (SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001), and gate-UI surface unification (SD-LEO-REFAC-GATE-PATTERN-UNIFICATION-001). This SD makes it a quadrilogy by closing the auto-advance-eligibility unification.

Cross-stage analysis identified two distinct sub-classes:

**Class A — Review-mode default-pause (S7, S9, S11):**
Worker's L4 blocks review-mode stages from auto-advancing unless `stage_overrides[stage_n].auto_proceed === true` is explicitly set. UI does NOT check L4 — it only computes `global_auto_proceed && !hard_gate_stages.includes(n)`. Currently only S8 has the override set (manually, for NameSignal verification). S7/S9/S11 all fall into this stuck state when their pending decision is created by the worker.

**Class B — Hard-gate-stages array drift (S16):**
`stage_config.gate_type='promotion'` marks 11 stages as kill/promotion gates (S3, S5, S10, S13, **S16**, S17, S18, S19, S23, S24, S25). But the UI-side `chairman_dashboard_config.hard_gate_stages` array contains only 10 (S16 is missing). UI thinks S16 is auto-advance-eligible and hides CTAs; worker's L2 refuses because `stage_config.gate_type='promotion'`. Same stuck state.

Both sub-classes share a single root: the UI's `isGlobalAutoApprove` re-implements gating logic from a different (drifting) source instead of consuming the same authoritative computation the worker uses. The `hard_gate_stages` JSON array is a hand-maintained mirror of `stage_config.gate_type` — and like every hand-maintained mirror, it has drifted.

## Rationale

User explicitly authorized "file the SD and drive through like the prior three" — same directive that produced the trilogy shipped today. The user observed S11 stuck-no-CTA personally during UAT, and the cross-stage analysis confirmed 4 stages affected today + structural risk of more if new gate types are added in future without remembering to update `hard_gate_stages`.

Prior related SDs:
- SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 (shipped 2026-05-12) — unified gate decision logic across worker + UI hooks; introduced 4-layer `_canAutoAdvance` in the worker
- SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 (shipped 2026-05-12) — unified reality-gate artifact-name across DB + worker
- SD-LEO-REFAC-GATE-PATTERN-UNIFICATION-001 (shipped 2026-05-12) — unified gate UI surface (removed pre-processing shell, composite indicator)
- **This SD** (quadrilogy closer) — unifies auto-advance-eligibility truth between worker + UI

## Scope (Functional Requirements)

FR-1: Server-side SECURITY DEFINER RPC `can_auto_advance(p_stage_number int) returns table(can boolean, reason text, layer int)` that encapsulates the 4-layer check. Single source of truth. Reads `chairman_dashboard_config` (`global_auto_proceed`, `stage_overrides`) + `stage_config` (`gate_type`, `review_mode`). Returns `{can: false, layer: 4, reason: 'review-mode default-pause (no opt-in)'}` for S11 today, etc.

FR-2: Worker `lib/eva/stage-execution-worker.js:_canAutoAdvance` refactored to call the new RPC instead of re-implementing the 4-layer logic locally. Single point of authority. Keeps the existing logger for observability.

FR-3: UI hook `useStageGovernance` (already shipped in trilogy) extends to expose `canAutoAdvance(stage: number): { can: boolean; reason: string; layer: number } | null` derived from the same RPC with React Query caching (60s TTL + realtime invalidation on `chairman_dashboard_config` changes — same pattern as the trilogy).

FR-4: VentureActionBar.tsx's `isGlobalAutoApprove` computation **deleted**. Replaced with `governance.canAutoAdvance(effectiveStage)?.can === true`. The misleading "Auto-advancing..." badge fires only when this is true. When false, the gate-action branch renders (Continue/Pause, GO/NO-GO, Approve/Pause as per gate type).

FR-5: Deprecate `chairman_dashboard_config.hard_gate_stages` column — it's now derivable from `stage_config.gate_type`. Mark @deprecated in migration COMMENT; add follow-up SD to remove the column entirely after one release of bake-in. NO removal in this SD (out of scope for blast radius).

FR-6: Tests:
- 26 unit tests for the RPC (one per stage, with stage_config + chairman_dashboard_config fixtures, asserting expected layer + reason)
- 4 regression tests for the empirical witnesses (S7/S9/S11/S16 all return `can=false` with correct layer + reason)
- 1 worker-UI equivalence test that for every stage 1-26, the worker's `_canAutoAdvance` result matches `useStageGovernance.canAutoAdvance` exactly
- 4 UI integration tests that S7/S9/S11/S16 with pending decisions render Continue/Pause CTAs (not "Auto-advancing...")
- 1 Playwright e2e on NameSignal S11 (or fresh fixture) verifying the user can click Approve and the venture advances

## Out of Scope

- **Removing** `hard_gate_stages` column from `chairman_dashboard_config` — deprecate only; removal in a follow-up SD after bake-in
- Migrating the existing `stage_overrides.stage_8` opt-in pattern to a new schema — keeps the existing JSONB structure
- Changing the worker's L1/L2/L3/L4 ordering or semantics — only consolidating where the logic LIVES
- Changing the UI's "Auto-advancing..." badge copy or styling — keep current visuals; only the conditional changes
- Per-venture stage_overrides (currently global) — out of scope; one-source-of-truth migration only

## Risk

- **RPC roundtrip latency in UI** — every stage page load now makes 1 extra RPC call. Mitigation: react-query caching at 60s TTL (same pattern shipped in trilogy via `useStageGovernance` for `chairman_dashboard_config`); realtime invalidation on config changes. Acceptable cost for correctness.
- **Worker refactor regression risk** — worker currently passes 4-layer locally; switching to RPC introduces a network dependency per auto-advance check. Mitigation: integration test exercises a full venture pipeline (S1→S26) end-to-end before merge; worker keeps a same-tick local cache.
- **`hard_gate_stages` consumers we don't know about** — there may be other code paths that read this column. Mitigation: grep audit included in PLAN-phase work; if other consumers exist, this SD migrates them too OR documents them as deprecated readers.
- **S8 stage_overrides opt-in regression** — the only currently-opted-in stage. Test must verify S8 still auto-advances under the new RPC path before merge.

## Success Criteria

1. RPC `can_auto_advance(p_stage_number int)` deployed and returns correct verdict + layer + reason for all 26 stages
2. Worker `_canAutoAdvance` calls the RPC and produces identical results to the previous local implementation across all 26 stages
3. UI's `isGlobalAutoApprove` no longer computed locally; replaced by `governance.canAutoAdvance(stage)?.can === true`
4. S7, S9, S11, S16 with pending decisions render `Continue`/`Pause` (or `Approve`/`Pause` for review-mode) CTAs in the header — NO "Auto-advancing..." badge
5. S8 with `stage_overrides.stage_8.auto_proceed=true` continues to render "Auto-advancing..." badge (existing opt-in not broken)
6. 36+ tests passing (26 RPC unit + 4 witness regression + 1 worker-UI equivalence + 4 UI integration + 1 Playwright)
7. CI gates green; ≥85% sub-agent confidence on DATABASE + DESIGN + TESTING + REGRESSION

## Estimated Effort

- Tier 2 SD
- LOC: ~120-180 src (RPC migration + worker refactor + UI hook extension + VentureActionBar swap) + ~250-350 test
- Touched files: ~5-7 (1 migration, stage-execution-worker.js, useStageGovernance.ts, VentureActionBar.tsx, +tests)
- 1 DB migration (CREATE FUNCTION can_auto_advance + grants + audit + realtime publication)
- Target repos: `EHG_Engineer` (RPC + worker) + `EHG` (UI hook + VentureActionBar + tests)

## Dependencies

None hard. Builds on the trilogy that just shipped:
- `useStageGovernance` hook (from SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001) — extend, don't replace
- `lib/eva/stage-governance.js` cached governance reader — extend with RPC wrapper
- `chairman_dashboard_config` table + realtime publication — already in place

## Empirical Witness Data

For PLAN-phase verification — current state of NameSignal venture `57e2645a-8288-4b55-9a44-0805ad4a3df1`:
- Currently at S11 with `chairman_decisions.id=756b1dfc, status=pending, decision_type=review`
- `chairman_dashboard_config.stage_overrides` = `{stage_8: {auto_proceed: true, ...}}` only
- `hard_gate_stages` = `[3, 5, 10, 13, 17, 18, 19, 23, 24, 25]` (S16 missing — drift from `stage_config.gate_type='promotion'`)
- Per cross-stage analysis: **4 stuck (S7, S9, S11, S16)** + 22 aligned + 0 silent

## Deletion Audit (Q8)

- Original proposal included migrating `stage_overrides` from JSONB to a normalized per-stage table. **Trimmed** — JSONB structure is fine, the bug is in computation, not storage. Saves ~150 LOC.
- Original proposal included removing `hard_gate_stages` column. **Trimmed to deprecate only** — removal is a downstream SD after one release of bake-in. Saves blast-radius risk.
- Original proposal included Playwright e2e for all 4 witness stages. **Trimmed to 1 e2e (NameSignal S11)** — sufficient for empirical witness; other 3 covered by UI integration tests at unit level.

Total scope reduction from initial proposal: ~30% LOC and 0 FRs (FR count preserved, depth trimmed).
