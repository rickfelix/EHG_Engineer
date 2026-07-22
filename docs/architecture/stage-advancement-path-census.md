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
| 7 | `initialize_venture_stages` (and venture-creation-time inserts in `20251206_factory_architecture.sql` / `20260530_childF_repoint_readers_to_venture_stages.sql`), plus the equivalent JS-side creation inserts in `lib/eva/pipeline-runner/pipeline-executor.js:95`, `lib/eva/pipeline-runner/synthetic-venture-factory.js:187`, and `lib/eva/stage-zero/chairman-review.js:135` | SQL + JS, venture creation | **DELIBERATELY EXEMPT** | Sets `current_lifecycle_stage = 1` at venture-creation time (all 3 JS sites confirmed via grep to be `.insert()` payloads for a brand-new venture row, not an `.update()`). Initialization, not advancement -- there is no "from stage" artifact requirement to check. These 3 JS sites were missed by the initial named-suspect enumeration and only surfaced during the adversarial code-review pass on this SD's own PR (#5557) -- corrected here so the "15 of 15" disposition claim below is accurate against `scripts/lint/stage-advancement-chokepoint-allowlist.json`, which already allowlisted them under the same class. |
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

## Post-census addition (2026-07-10)

**Path #16 — S20-26 harness forced-stage-set** (`scripts/harness/s20-run.mjs`): a DELIBERATE, self-reporting
bypass used only by the simulated-run harness under `--advance-policy=forced-stage-set` and only for
`is_demo` fixture ventures. The real gate block is journaled BEFORE any forced set (drivability evidence
preserved), and the write is declared through the harness config-diff seam as the `forced_stage_set`
divergence — unsanctioned use self-reports as `TEST_MODE_DIVERGENCE` in the run journal. Exists because
S20/S23 declare unresolvable binding verifiers (no registered verifier; fail-closed since PR #5801), which
no run output can satisfy. Disposition: deliberately exempt (test-instrument, fixture-scoped, journaled).

## Post-census addition (2026-07-16)

**`database/migrations/20260716_high_consequence_stage_gates.sql`** — the latest `CREATE OR REPLACE`
of `fn_advance_venture_stage` (path #1, the chokepoint itself), adding SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001's
high-consequence blocking-gate HOLD check (FR-3). Additive only: a new `IF v_is_high_consequence THEN ... EXISTS(...)`
block inserted between the pre-existing product-review check and the S22-flag/artifact-precondition
logic; the function's single canonical `UPDATE ventures SET current_lifecycle_stage` write is
unchanged. The equivalent additive 4th backstop was added to path #5's daemon-walk chokepoint
(`lib/eva/stage-execution-worker.js::_advanceStage`, already in the allowlist) in the same PR — both
must carry it since path #8 (`artifact-persistence-service.js`) delegates to the RPC and only
inherits the hold from that side. Disposition: superseded-historical-on-next-migration, same as
every other dated `fn_advance_venture_stage` entry below.

## Post-census addition (2026-07-22) — SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A

**Authoritative-store finding (re-confirmed, EXEC investigation)**: `ventures.current_lifecycle_stage`
remains the sole authoritative store the blocking-gate check reads/writes — both
`fn_advance_venture_stage` (path #1) and `lib/eva/stage-execution-worker.js` (path #5) read/write it
directly. `workflow_executions.current_stage` is NOT authoritative: it is a parallel, write-only
observability log maintained independently by `lib/eva/workers/stage-advance-worker.js` (see below) and
is never read by any blocking-gate check.

- **`database/migrations/20260722_high_consequence_actuation_completeness.sql`** — another additive
  `CREATE OR REPLACE` of `fn_advance_venture_stage` (path #1). Layers a NEW cutover kill-switch
  (`leo_feature_flags.HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED`, default OFF) underneath the
  pre-existing `LEO_HIGH_CONSEQUENCE_GATES_ENABLED` check from the 2026-07-16 migration, and adds a
  `DELETE FROM venture_stage_cutover_grandfather` consumption step on a successful advance. Also
  performs the actual cutover: `venture_stages.is_high_consequence=true` for stages 3/19/24 (effect
  gated by the new flag), `venture_stages.is_irreversible=true` for stage 24 (a NEW, independent
  signal), and a one-time snapshot of every venture already sitting at stage 3/19/24 into
  `venture_stage_cutover_grandfather` so the cutover cannot retroactively halt them.
- **`lib/eva/stage-governance.js`** — the single JS-side read both of path #5's two chokepoints
  consume (`isHighConsequence`/`highConsequenceStages`) now ALSO gates on the same
  `HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED` flag, read alongside the existing `venture_stages` query
  (same 60s cache TTL). This keeps the JS side and the SQL RPC side in identical lockstep: until the
  flag is deliberately flipped on, is_high_consequence reads as false everywhere regardless of the DB
  column (TR-1 reversibility).
- **`lib/eva/chairman-decision-watcher.js::createOrReusePendingDecision`** — before minting a
  BLOCKING decision, checks `venture_stage_cutover_grandfather` for the exact `(venture_id,
  stage_number)` pair; if present, mints non-blocking instead (logged) and leaves the row in place
  until the venture actually advances past that stage (consumption lives in the RPC/`_advanceStage`,
  not here — see migration notes above; repeated same-visit poll-tick calls must not un-grandfather
  mid-visit).
- **`lib/eva/workers/stage-advance-worker.js` (`StageAdvanceWorker`)** — path #8 was previously
  dispositioned "GATED (already clean)" on the strength of delegating to `fn_advance_venture_stage`
  via `supabase.rpc()`. This SD's audit found two real defects in that same worker, both now fixed:
  (1) its own `GATE_STAGES` set (used only to decide whether THIS worker should attempt an advance at
  all, separate from the RPC's own enforcement) omitted Stage 19, so it would attempt — and the RPC
  would then correctly block — an advance the worker itself should never have attempted; (2) it
  previously updated `workflow_executions.current_stage` (its own non-authoritative observability
  pointer) BEFORE calling `advanceStage()`/checking the RPC result, so a gate-blocked or failed
  advance left that pointer pointing at the next stage even though `ventures.current_lifecycle_stage`
  (the authoritative store) never moved. Both fixed: `GATE_STAGES` now includes 19, and the RPC call
  is awaited (wrapped in try/catch) with the `workflow_executions` update moved to AFTER a confirmed
  success, skipped entirely (via `continue`) on any thrown block/failure.
- **New: `lib/eva/artifact-persistence-service.js::emergencyUnblockGate()`** (FR-3) — a liveness-only
  action that re-opens a stuck, pending, blocking `chairman_decisions` row without ever writing an
  approving `decision` value and without ever calling any stage-advance RPC. It does not itself write
  `ventures.current_lifecycle_stage` or any equivalent column, so it is not a new "path" in this
  census's sense — documented here for completeness since it is the newest piece of the audit
  substrate this file tracks. For an irreversible gate (`venture_stages.is_irreversible=true`,
  Stage-24-class), it additionally returns `requiresManualConfirmation:true`; there is no single-call
  route from this function to an actual advance.
- **ehg app repo (frontend)** — a parallel reconciliation lands in the `ehg` app repo
  (`feat/SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A` branch there) for the divergent hard-gate-array
  sources (`useStageDisplayData.ts`, `gate-config.ts`, `useChairmanConfig.ts`, `useStagePolicy.ts`,
  `useStageGovernance.ts`) and the UI advance-stage write path (`src/lib/ventures/advanceStage.ts`).
  That repo is out of THIS census's scope (EHG_Engineer only) but is the other half of "every
  advancement path honors is_high_consequence+blocking identically" — see that repo's own PR for the
  file:line detail.

### Re-verified disposition of the 2 previously-deferred bypasses (#16, #17)

Both remain out of THIS SD's EXEC scope per explicit direction (not modified here), but were
re-examined specifically for whether they write to the NEWLY-gated stages (3/19/24):

- **#16 `lib/agents/venture-ceo/handlers.js::_updateVentureProgress`** — confirmed: this still
  performs an unconditional `ventures.update({ current_lifecycle_stage: completedStage + 1 })` with
  **no stage-number restriction whatsoever** and no high-consequence/blocking check of any kind.
  `completedStage` is fleet-supplied metadata from a CEO-agent task-completion message, so this path
  CAN write across stage 3→4, 19→20, or 24→25 exactly like any other transition — it is not merely
  the old artifact-gate bypass, it is *also* a live, confirmed, reachable bypass of the new
  high-consequence blocking gate on the authoritative store. Deferred, not fixed, per this SD's
  explicit "do not modify" scope — but the risk is now materially higher than when #16 was first
  logged (2026-07-04), since a high-consequence stage is, by definition, the class of stage where an
  unaudited silent advance matters most. **Flagged for urgent follow-up**, not merely routine cleanup.
- **#17 `lib/eva/post-lifecycle-decisions.js::handlePivot`** — confirmed: still writes
  `current_lifecycle_stage` to `eva_ventures`, not `ventures` — a different table from the one the
  high-consequence gate (and every other chokepoint in this census) reads. Whether `eva_ventures` is a
  synced mirror of `ventures` remains unresolved (same as the 2026-07-04 finding). Additional note
  surfaced by this SD: `handlePivot`'s own doc comment says it resets "`current_lifecycle_stage` to an
  earlier stage for re-entry" — i.e. it can move a venture's stage number BACKWARD. This SD's
  grandfather-table design (chairman-decision-watcher.js / the 20260722 migration) relies on the
  assumption that `ventures.current_lifecycle_stage` cannot re-enter a previously-visited stage number
  (supported by `fn_advance_venture_stage`'s forward-only advancement and `gate_boundary_config`'s
  `CHECK (to_stage > from_stage)`). That assumption is scoped to `ventures`, not `eva_ventures` —
  `handlePivot` writing to a DIFFERENT table does not itself invalidate it, but if `eva_ventures` ever
  turns out to be a synced/promoted-back-to pointer for `ventures.current_lifecycle_stage`, the
  no-re-entry assumption would need re-examination before it can be relied on for
  `ventures`-side logic. Documented as an open risk, not resolved here (same "needs its own
  investigation" disposition as 2026-07-04).

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
