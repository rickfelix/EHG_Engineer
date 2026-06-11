<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_p2_initiative_backbone.md -->
<!-- SD Key: SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001 -->
<!-- Archived at: 2026-06-09T16:13:43.369Z -->

# Initiative backbone: canonical vision spine + promote objectives to Initiative (reuse-first)

## Type
infrastructure

## Priority
high

## Objective
Establish the Initiative backbone by REUSING existing structures (chairman reuse-first directive): make `eva_vision_documents` the canonical vision spine, promote OKR `objectives` to the Initiative grain, and cross-link initiatives / OKRs / orchestrator-SDs / roadmap-waves — so "one Initiative -> many SDs over time" becomes a real, navigable hierarchy with no new parallel entity.

## Scope
- VISION SPINE: make `eva_vision_documents` canonical. Promote the existing L1 doc `VISION-EHG-L1-001` (already active + chairman_approved) as the strategy apex. Add ONE nullable FK `objectives.eva_vision_id -> eva_vision_documents(id)`. Repoint the 7 `objectives` + `okr_generation_log` + the `v_okr_hierarchy` / `v_okr_scorecard` views + `scripts/modules/sd-next/data-loaders.js` + the EHG `useOKRScorecard.ts` off the dormant `strategic_vision`, then RETIRE `strategic_vision` (1 dormant row; the two roots share NO FK today and only 1 SD overlaps both systems).
- MISSION FOUNDATION (reuse-first, additive): mission is the foundation "why" that the vision spine CITES — keep it a PEER anchor, NOT a new apex (do NOT re-parent the 216 active vision docs). Add ONE nullable up-FK `eva_vision_documents.mission_id -> missions(id)` (mirrors the existing `parent_vision_id` / `objectives.vision_id` conventions) and backfill the active L1 doc to the single existing portfolio mission (`missions` where `venture_id IS NULL`). Nest per the L1/L2 vision pattern: portfolio mission (venture_id NULL) <-> L1 vision; per-venture mission (venture_id set) <-> that venture's L2 vision, with COALESCE-to-portfolio fallback at read. Do NOT add `mission_id` to objectives/SDs (they inherit mission transitively through their vision) or `ventures.mission_id` (`missions.venture_id` already expresses per-venture scope). Initiatives then gain a mission reference for free via objective -> vision -> mission_id.
- INITIATIVE GRAIN: promote `objectives` AS the Initiative (no new table). Give orchestrator SDs (`sd_type='orchestrator'`) and `roadmap_waves` a nullable `initiative_id` (= objective id). Reuse `roadmap_baseline_snapshots` (versioned chairman-approved baselines) + `kr_progress_snapshots` (over-time tracking).
- RE-ACTIVATE LINKAGE: replace the archived one-shot `align-sds-to-krs.js` with a recurring OKR<->SD alignment job; re-activate the dormant `okr-wave-linker` so initiatives, OKRs, roadmap waves, and SDs cross-link.

## Acceptance Criteria
- `objectives` hang off the L1 `eva_vision_documents` node; `strategic_vision` retired with zero orphaned dependents.
- Orchestrator-SDs + `roadmap_waves` carry a nullable `initiative_id`.
- A recurring OKR<->SD alignment job runs; views/loaders/EHG hook read the new spine.

## Success Metrics
- `strategic_vision` dropped, 0 orphaned dependents.
- A growing share of active orchestrator-SDs carry an `initiative_id`.
- OKR<->SD alignment count grows post-job (not frozen at 33).

## Rationale
Reuse-first keystone: three usable groupings (orchestrator-parent SD trees, the OKR hierarchy, roadmap waves) already exist but are unconnected. This unifies them with ONE nullable FK + view repointing — no new tables, and it DELETES a redundant root (`strategic_vision`). Depends on P0 (revived OKR loop) and P1 (honest surfaces). Schema change — migration reviewed (chairman-authorized). See the performance-framework plan + docs/protocol/README.md.
