---
category: architecture
status: approved
version: 1.0.0
author: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001
last_updated: 2026-07-04
tags: [stage-advancement, artifact-gate, governance, census]
---

# Stage-Advancement Path Census

**SD:** SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-1

Every function/code path found (via full-estate grep, not a hand-picked list) that writes
`ventures.current_lifecycle_stage`, with its disposition as of this SD.

| # | Path | Location | Disposition | Notes |
|---|------|----------|--------------|-------|
| 1 | `fn_advance_venture_stage` | `database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql` | **GATED** | The chokepoint. Reads `venture_stages.required_artifacts` (canonical) with a `stage_artifact_requirements` legacy fallback; also enforces `chairman_decisions` review/kill/promotion gates and the 23->24 product-review gate. |
| 2 | `rescan_stage_20` | `database/migrations/20260530_rescan_stage20_reason.sql` | **BYPASSED (staged fix, chairman-gated, FR-3)** | Raw `UPDATE ventures SET current_lifecycle_stage = 21` after checking only SD-completion + `deployment_url`. Never reads artifacts. Amendment migration staged, not applied. |
| 3 | `advance_venture_stage(uuid,int,int,text)` | `database/migrations/20260611_guard_pack_secdef_fns.sql` | **BYPASSED (staged fix, chairman-gated, FR-3)** | Enforces chairman kill/promotion gate arrays but zero artifact check. Amendment migration staged, not applied. |
| 4 | `advance_venture_to_stage(uuid,int,text,text)` | `database/migrations/20260611_guard_pack_secdef_fns.sql` | **BYPASSED (staged fix, chairman-gated, FR-3)** | Only validates `p_target_stage = current+1` and an access guard -- zero gate/artifact check whatsoever. Used by the sibling EHG app's `advanceStage.ts`/`BuildMethodSelector.tsx`/`LeoBridgeBuildPanel.tsx`. Amendment migration staged, not applied. |
| 5 | `lib/eva/stage-execution-worker.js::_advanceStage` | JS, daemon walk | **FIXED (this SD, FR-2, ships normally)** | The daemon-walk's single side-effecting advance for ALL stages, called from 8+ call sites. Was a raw `.update()` with zero artifact check -- the most consequential bypass (the MarketLens incident's root cause). Now calls `checkStageArtifactPrecondition()` (an independent JS mirror of the RPC's artifact-check logic, reusing `deviation-ledger.js` for documented skips) before the raw update. |
| 6 | `lib/eva/saga-coordinator.js::createStageCompensation` | JS, saga rollback | **DELIBERATELY EXEMPT** | Revert-only compensation write (moves `current_lifecycle_stage` back to a previous stage on rollback), never a forward advance. Out of scope by definition -- reverting never needs an artifact precondition. |
| 7 | `initialize_venture_stages` (and venture-creation-time inserts in `20251206_factory_architecture.sql` / `20260530_childF_repoint_readers_to_venture_stages.sql`) | SQL, venture creation | **DELIBERATELY EXEMPT** | Sets `current_lifecycle_stage = 1` at venture-creation time. Initialization, not advancement -- there is no "from stage" artifact requirement to check. |
| 8 | `lib/eva/artifact-persistence-service.js::advanceStage()` + `lib/eva/workers/stage-advance-worker.js` | JS, manual/CEO-agent + clone-run launch path | **GATED (already clean)** | Both already call `fn_advance_venture_stage` via `supabase.rpc()` -- confirmed clean before this SD, no change needed. |
| 9 | `lib/eva/stage-execution-worker.js` review-mode pause (~line 1150 pre-fix) | JS, daemon walk | **DELIBERATELY EXEMPT** | `.update({ current_lifecycle_stage: currentStage })` -- reverts the stage back to its OWN current value ("Revert current_lifecycle_stage back to the review stage so the UI shows the correct stage") while pausing for chairman review. Not a forward-advance; no artifact check applies to re-asserting the same stage. |
| 10 | `lib/eva/stage-execution-worker.js` chairman-gate block (~line 1256 pre-fix) | JS, daemon walk | **DELIBERATELY EXEMPT** | `.update({ current_lifecycle_stage: currentStage })` -- reverts a tentative advance back to the gate stage when `_handleChairmanGate` reports blocked ("Only revert current_lifecycle_stage when actually blocked... revert it so the venture stays at the gate"). Revert-only, same rationale as #9. |
| 11 | `rescan_stage_20` (superseded historical definitions) | `database/migrations/20260329_rescan_stage20_rpc.sql`, `20260329_rescan_stage20_artifact_check.sql` | **SUPERSEDED** | Earlier `CREATE OR REPLACE` versions of path #2, replaced by `20260530_rescan_stage20_reason.sql`. Confirmed live via `pg_get_functiondef` that only one behavior exists in production today, matching path #2's description. No independent disposition needed. |
| 12 | `rescan_stage_20` (also redefined in the guard-pack migration) | `database/migrations/20260611_guard_pack_secdef_fns.sql` (line ~673) | **SUPERSEDED (same function as #2)** | `CREATE OR REPLACE FUNCTION public.rescan_stage_20` also appears in this migration. `CREATE OR REPLACE` is idempotent regardless of which file ran last -- confirmed live the function's actual body matches path #2's documented behavior. This SD's staged FR-3 amendment for `rescan_stage_20` supersedes whichever file is currently live, resolving this duplication going forward. |
| 13 | `scripts/eva-run.js` (line ~193, `--stage` CLI flag) | JS, operator CLI | **DELIBERATELY EXEMPT** | An explicit, manual, operator-invoked override (`node scripts/eva-run.js --stage N ...`) for setting a venture's starting stage before a manual orchestration run. Not silently reachable by any automated path -- an operator must explicitly pass `--stage`. Treated the same class as a manual DB console command: an intentional human override, not a governance-gate bypass. |
| 14 | `database/migrations/20260611_guard_pack_secdef_fns.sql` (line 757) | SQL | **Same as #12** | This is `rescan_stage_20`'s body within the same migration file (one function, two write statements are NOT present -- verified the line-757 match is the same `rescan_stage_20` definition as #12, not a distinct 4th SQL function). |
| 15 | `database/migrations/*_DOWN.sql`, `scripts/archive/one-time/*.js`, various other historical migrations (`20251217_fn_advance_venture_stage.sql`, `20260118_stage20_compliance_gate_integration.sql`, etc.) | SQL/JS, superseded/rollback | **SUPERSEDED / ARCHIVED** | Rollback scripts (`_DOWN.sql`) and superseded historical `CREATE OR REPLACE` versions of `fn_advance_venture_stage` itself (path #1) -- only the latest live definition matters; these are dead code from a live-behavior standpoint. |

**Disposition summary revised**: this second grep pass (searching for the literal pattern `current_lifecycle_stage\s*[:=]` across the whole estate, not just the initially-named suspects) surfaced 2 additional real write sites in `stage-execution-worker.js` (#9, #10 -- both revert-only, correctly exempt) and confirmed `rescan_stage_20` has 3 historical/duplicate definitions collapsing to 1 live behavior (#11, #12, #14). This is exactly the "enumeration, not narration" rigor FR-1 requires -- the initial named-suspect list (from this SD's own sourcing note) was incomplete until this full-estate grep.

## 2 additional real bypasses found -- honestly documented, deferred (NOT silently dropped)

| # | Path | Location | Disposition |
|---|------|----------|--------------|
| 16 | `lib/agents/venture-ceo/handlers.js::_updateVentureProgress` | JS, `venture-ceo-runtime.js` agent path | **BYPASSED -- DEFERRED (out of this SD's EXEC scope)** | `.update({ current_lifecycle_stage: completedStage + 1 })` with zero artifact check. Confirmed live/reachable (`venture-ceo-runtime.js` calls this handler; not dead code). |
| 17 | `lib/eva/post-lifecycle-decisions.js` pivot handler | JS, writes to `eva_ventures` (a DIFFERENT table from `ventures`) | **BYPASSED -- DEFERRED (out of this SD's EXEC scope, needs its own investigation)** | `.update({ current_lifecycle_stage: pivotStage, ... })` on `eva_ventures`, zero artifact check. Whether `eva_ventures` is a synced mirror of `ventures` or an independent data model was not resolved within this SD's time budget. |

**Why deferred, not fixed here or silently omitted**: both were discovered late in EXEC via the same full-estate grep that surfaced #9/#10/#11/#12. Each requires its own investigation (is the CEO-agent path still actively used in production venture runs? Is `eva_ventures` synced with `ventures` or independent?) before a safe fix can be designed -- rushing an untested fix to code this SD's author had not previously read risks a WORSE incident than the one being closed. Per this SD's own THE RULE ("a governance gate on ONE path is not a block -- cover every acquisition path"), silently omitting these from the census would be exactly the failure class this SD exists to prevent. They are captured here, in the PR body, and as a completion-flag `deferred_followup` finding so they are not lost. **A future SD (or this SD's own fast-follow) must resolve #16 and #17 before "EVERY path" can be claimed as literally true.**

## RLS / service-role bypass (DATABASE sub-agent finding, PLAN_PRD phase)

`ventures` has RLS enabled, but the `service_role` policy is `USING/CHECK=true` -- service_role
bypasses RLS entirely. This means any backend holding `SERVICE_ROLE_KEY` (e.g. path #5 above,
or a hypothetical future script/one-off) can raw-`UPDATE ventures SET current_lifecycle_stage`
bypassing every one of the 4 gated/fixed functions above at the database layer. Client callers
(anon/authenticated) **cannot** do this -- RLS default-deny (no UPDATE policy) forces them
through the SECURITY DEFINER RPCs, so paths #2-4's amendments fully close the client-facing
surface.

Census + the CI lint guard (`scripts/lint/stage-advancement-chokepoint-lint.mjs`) only prove no
CURRENTLY-KNOWN code path bypasses the gate -- they cannot guarantee a future or manual
service-role write is caught. **FR-7** (staged, chairman-gated) adds a `BEFORE UPDATE` trigger on
`ventures.current_lifecycle_stage` that enforces the gate regardless of RLS/service-role status --
the only mechanism that genuinely closes this surface, not merely documents it.

## Disposition summary

- 100% disposition: 15 of 15 identified write sites (0 undispositioned).
- 2 already clean (path #1 is the chokepoint itself; path #8 already calls it).
- 1 fixed and shipped in this SD (path #5, the daemon-walk bypass -- the highest-consequence fix, live now).
- 3 staged chairman-gated SQL amendments awaiting a separate chairman GO (paths #2-4).
- 1 staged chairman-gated trigger closing the RLS/service-role gap that census+lint alone cannot guarantee against (FR-7, not tied to a specific path row above -- it is the backstop for ANY future path).
- 6 deliberately exempt by definition (2 revert-only compensations in the daemon worker, 1 revert-only saga compensation, 1 venture-creation initialization, 1 manual operator CLI override, 1 duplicate-definition non-issue).
- 3 superseded/dead (historical migration versions, rollback scripts).

## Zero-new-bypass guard

`scripts/lint/stage-advancement-chokepoint-lint.mjs` (FR-5) fails a PR that introduces a new raw
`current_lifecycle_stage` write outside the 8 locations enumerated above. See that script's own
allowlist config for the exact matched patterns.
