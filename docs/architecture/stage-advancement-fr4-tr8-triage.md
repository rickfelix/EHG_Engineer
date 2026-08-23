# Stage-Gate Hardcoded-Set Representations — FR-4/TR-8 Triage

**SD:** SD-LEO-INFRA-MINUS-GATE-SSOT-001 (T-minus P2 — Gate SSOT)
**Purpose:** Per FR-4/TR-8, publish a written, individually-justified disposition for every
hardcoded kill/promotion/gate stage-number representation found during this SD's LEAD-phase
investigation — not a blanket "derive everything from the SSOT" treatment, and not an implicit
disposition left only in code comments.

**Why this document exists:** a prior SD (SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001, completed
2026-05-12) claimed success criterion #2 — "0 hardcoded callsites remain" — without a durable
artifact to verify that claim against. A grep run during this SD's LEAD phase found 8 live
callsites of the exact constants that SD claimed were eliminated. This document exists so the
next SD (or lint rule, see FR-7) has something concrete to check completeness against.

**SSOT reference (as of this SD, TR-1):** `lib/eva/stage-governance.js`'s raw `gate_type` view —
`killStagesRaw = {3, 5, 13, 23}`, `promotionStagesRaw = {10, 16, 17, 18, 19, 24, 25}`.

## In scope — derived from the SSOT this SD (FR-1/FR-4)

| # | Location | Was | Disposition | Notes |
|---|----------|-----|--------------|-------|
| 1 | `lib/agents/modules/venture-state-machine/stage-gates.js` (`KILL_GATE_STAGES`, `PROMOTION_GATE_STAGES`) | `[3,5,13,24]` / `[17,18,23]` | **DERIVE (done, FR-1)** | Constants removed; `validateStageGate`/`getGateType` now call `getStageGovernance(supabase).isKillRaw/isPromotionRaw`. |
| 2 | `lib/eva/devils-advocate.js` (`KILL_GATES`, `PROMOTION_GATES`, `ALL_GATES`) | `[3,5,13,24]` / `[17,18,23]` | **DERIVE (done, FR-1)** | Converted to async accessors `getKillGates(supabase)` / `getPromotionGates(supabase)` / `getAllGates(supabase)`; `isDevilsAdvocateGate` is now `async (supabase, stageId)`. Independent literal copy of the SAME wrong pair as #1 — live-consumed by `eva-orchestrator.js` at two call sites (the DA-gate classification and the kill-gate route-to-review predicate). |
| 3 | `lib/eva/workers/stage-advance-worker.js` (`GATE_STAGES`) | `[3,5,13,16,17,19,21,22,23,24]` | **DERIVE + EXPLICIT CARVE-OUT (done, FR-4)** | Not a strict subset/superset of the raw kill/promotion sets: was missing promotion stages 10/18/25 (an active bypass, now closed) and additionally hardcoded stages 21/22 (`gate_type='none'`, `review_mode='review'`) for a reason this SD's investigation could not trace to a generic rule (stages 7/8/9/11 also carry `review_mode='review'` but were never in this set). Resolved as `blockingStagesRaw ∪ {21, 22}` — the union is derived, the `{21,22}` term is an explicit, named, non-generic carve-out. Generalizing to "all review_mode stages" was deliberately NOT done; that is a separate, un-investigated question. |
| 4 | `database/migrations/20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql` (`advance_venture_stage` SQL function; `v_kill_gates`, `v_promotion_gates`, `v_all_gates`) | `[3,5,13,24]` / `[17,18,23]` / union | **DERIVE (staged, FR-2)** | Authored by SD-LEO-INFRA-RECONCILE-EHG-REPO-001; already rewrites the function to read `venture_stages.gate_type` per-row instead of the hardcoded arrays. `@chairman-gated` / `STATUS: STAGED` / no `@approved-by` — this SD re-verified the dry-run still passes against live data (`database/chairman-gated/20260722_..._dry_run.mjs`) but does NOT apply it; the apply ceremony remains a separate chairman GO decision. |

## In scope — investigated, KEEP AS-IS (not derived)

| # | Location | Value | Disposition | Notes |
|---|----------|-------|--------------|-------|
| 5 | `lib/eva/gate-bars.js` (`CHAIRMAN_GATE_STAGES`) | `[3,5,10,13,17,18,23,24,25]` (9 stages) | **KEEP AS-IS — do NOT derive** | This is a chairman RULING ("the 9 stages named by the sitting #1 ruling"), not a `gate_type` classification. Deriving it from the raw SSOT would silently ADD stages 16 and 19 — both `gate_type='promotion'` but never named in the ruling. The literal IS the source of truth here; there is nothing to converge it toward. |

## Out of scope — already correct (confirmed, reference pattern)

| # | Location | Notes |
|---|----------|-------|
| 6 | `lib/eva/stage-execution-worker.js` | Already reads `venture_stages` per-stage via `getStageGovernance` (or equivalent live read) — the reference pattern this SD's FR-1 fix mirrors. No change needed. |
| 7 | `public.fn_advance_venture_stage(uuid,integer,integer,jsonb,uuid)` (migration `20260716_high_consequence_stage_gates.sql`) | The EVA-daemon-path sibling of #4 above. Already reads `venture_stages` per-stage correctly; confirmed by direct read of the migration text. No change needed. |
| 8 | `lib/eva/gate-constants.js` (`MAX_STAGE=26`, `OPERATING_MODES`, `TASTE_GATE_STAGES=[10,13,16]`) | This file's own header records that a PRIOR SD (SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001, FR-2/FR-3) already removed its `KILL_GATE_STAGES`/`PROMOTION_GATE_STAGES` in favor of `stage-governance.js`. `MAX_STAGE`/`OPERATING_MODES` are unrelated concepts (pipeline length, operating-mode boundaries); `TASTE_GATE_STAGES` is a separate, deliberately-not-unified feature-flagged subsystem (unchanged by this SD's FR-1, per TR-6). |

## Out of scope — different defect class, own follow-up (NOT folded into this SD)

| # | Location | Value | Rationale |
|---|----------|-------|-----------|
| 9 | `lib/eva/experiments/gate-outcome-bridge.js` (`KILL_GATE_STAGES`) | `[3,5,13]` | Genuinely omits stage 23/24 by design (an experiments-tier accuracy-correlation set, not a governance gate list) — AND has a separate, differently-shaped bug: its boundary-key format (`'stage_N'`) mismatches the caller's `'N->N+1'` format, so in practice only stage 3 ever records an outcome. Fixing the format mismatch requires its own boundary-key-format convergence against the `gate_boundary_config` DB table — a bigger, differently-shaped defect deserving its own SD/QF, not a byproduct of this one. |
| 10 | `lib/eva/experiments/baseline-accuracy.js` (`KILL_GATE_STAGES`) | `[3,5,13]` | Historical accuracy-CORRELATION set (includes legacy S13 for backtesting), explicitly documented (see #11) as intentionally distinct from any governance gate list. |
| 11 | `lib/forecasting/gate-attach.js` (comment references `[3,5,13]` at `gate-attach.js:18`) | `[3,5,16]` (its own advisory-ATTACH set) | Already self-documents as "Deliberately DISTINCT from `KILL_GATE_STAGES=[3,5,13]` in `lib/eva/experiments/baseline-accuracy.js`... Kept separate on purpose — do not unify them." |
| 12 | `lib/eva/experiments/chairman-report.js` (`buildGateSurvivalSection`'s local `KILL_GATES`) | `[3,5,13]` | Local, function-scoped literal for a report section; part of the same experiments-tier accuracy-analysis cluster as #9/#10, not a live gate-enforcement path. |
| 13 | `lib/proving-companion/gate-discipline-checker.js` (`KILL_GATES`) | `[3,5,13]` | A standalone proving/audit script (not imported by any production gate-evaluation path) checking whether chairman decisions carry adequate journal notes at kill stages. Independent of the governance SSOT scope; touching it is a documentation-quality concern, not a gate-membership-correctness one. |
| 14 | `scripts/monitor-venture-run.cjs` (`KILL_GATES`, `PROMOTION_GATES`, `BLOCKING_GATES`) | `{23}` / `{17}` / `{3,5,13,16,17,23,24}` | A developer-facing CLI log/monitoring tool (console output labeling only, no enforcement). Its own header comment already flags the S23/S24 label note. Out of scope: cosmetic log labeling, not gate enforcement. |
| 15 | `tests/uat/ventures-workflow-uat.spec.mjs` (`KILL_GATES`, `PROMOTION_GATES`) | `[3,5,13]` / `[16,22]` | UAT screenshot/log labeling script (`gateLabel` display string only), values don't even match the live SSOT at all (own independent, historically-drifted display labels). Cosmetic, not enforcement — out of scope. |
| 16 | `chairman_dashboard_config.hard_gate_stages` (DB config column, formerly read by `lib/eva/stage-work-sync.js`) | — | **Already retired.** Confirmed deprecated 2026-05-12 per `database/migrations/20260512_can_auto_advance_rpc.sql` (lines 200-204) as part of SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001. No live reader remains. |

## Explicitly named per FR-4's acceptance criteria

- **`lib/eva/experiments/` `[3,5,13]` cluster** (representations #9, #10, #12 above): out of scope
  because each is an intentionally-different-semantics accuracy/reporting set, not a governance
  gate-membership list — unifying them with the kill/promotion SSOT would change their meaning,
  not fix a bug.
- **`gate-outcome-bridge.js`'s string-format mismatch** (representation #9): out of scope because
  it is a genuinely different, bigger defect (boundary-key-format convergence against
  `gate_boundary_config`) than stage-set drift — folding it in here would blur two unrelated fixes
  into one PR and under-scope the format-mismatch fix.

## Verification

This table was compiled from a direct repo-wide grep for `KILL_GATE(S)?`, `PROMOTION_GATE(S)?`,
`GATE_STAGES`, and `CHAIRMAN_GATE_STAGES` re-run during this SD's EXEC phase (2026-08-23), plus a
live read of every matching file's surrounding context and (where applicable) its live consumers —
not carried forward unverified from the LEAD-phase risk-agent estimate of "14+".
