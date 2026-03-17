# Venture Workflow Validation Report
**Date**: 2026-03-17
**Scope**: End-to-end validation of the 25-stage venture lifecycle system
**Branch**: fix/venture-workflow-eleven-fixes

---

## Executive Summary

The venture workflow system manages ventures through 25 stages organized in 6 phases, with 7 gate stages (4 kill gates + 3 promotion gates), a polling-based Stage Execution Worker, 4 Supabase Edge Functions for scoring/evaluation/exit, and a rich cross-stage data contract system. The architecture is **fundamentally sound** with good separation of concerns, idempotent operations, and concurrent-safe locking.

**Critical findings**: 3 issues requiring attention, 5 moderate concerns, 4 informational observations.

---

## 1. Venture Stage Inventory

### 1.1 Phase Structure (6 Phases, 25 Stages)

| Phase | Name | Stages | Purpose |
|-------|------|--------|---------|
| 1 | THE TRUTH | 1-5 | Validate idea viability |
| 2 | THE ENGINE | 6-9 | Business model development |
| 3 | THE IDENTITY | 10-12 | Brand, marketing, sales framework |
| 4 | THE BLUEPRINT | 13-16 | Product roadmap, architecture, financials |
| 5 | THE BUILD LOOP | 17-22 | Sprint-based build execution |
| 6 | LAUNCH & LEARN | 23-25 | Marketing, readiness, go-live |

### 1.2 Complete Stage Catalog

| # | Slug | Title | Work Type | Gate? | Entry Conditions | Exit Conditions |
|---|------|-------|-----------|-------|------------------|-----------------|
| 1 | draft-idea | Idea Capture | artifact_only | No | Stage 0 synthesis or manual input | description(50+), problemStatement(20+), valueProp(20+), targetMarket(10+), archetype |
| 2 | multi-persona | Multi-Persona Scoring | automated_check | No | Stage 1 artifact | compositeScore (0-100) |
| 3 | validation | Kill Gate | decision_gate | **KILL** | Stages 1+2 artifacts | overallScore >= 70 to PASS, 50-70 REVISE, <50 KILL. All 7 metrics >= 50 |
| 4 | competitive-intel | Competitive Intelligence | artifact_only | No | Stages 1+3 artifacts | competitors array (min 1) |
| 5 | profitability | Kill Gate (Financial) | decision_gate | **KILL** | Stages 1+3+4 artifacts | roi3y >= 25%, breakEven <= 24mo, ltvCac >= 2, payback <= 18mo |
| 6 | risk-matrix | Risk Matrix | artifact_only | No | Stages 1+3+4+5 artifacts | risks array (min 1), aggregate_risk_score |
| 7 | pricing-strategy | Pricing Strategy | artifact_only | No | Stages 1+4+5+6 artifacts | pricing_model, tiers (min 1) |
| 8 | bmc | Business Model Canvas | artifact_only | No | Stages 1+4+5+6+7 artifacts | customerSegments, valuePropositions, revenueStreams |
| 9 | exit-strategy | Exit Strategy | artifact_only | No | Stages 1+5+6+7+8 artifacts | exit_thesis(20+), exit_paths(min 1), reality_gate |
| 10 | customer-brand | Customer & Brand Foundation | artifact_only | **BLOCKING** (worker) | Stages 1+3+5+8 artifacts | customerPersonas(min 3), brandGenome, candidates(min 5) |
| 11 | visual-identity | Visual Identity | artifact_only | No | Stages 1+5+10 artifacts | candidates(min 5), visualIdentity, scoringCriteria |
| 12 | gtm-sales | GTM & Sales Framework | artifact_only | No | Stages 1+5+7+10+11 artifacts | marketTiers(min 3), channels(min 8), salesModel, reality_gate |
| 13 | product-roadmap | Product Roadmap | decision_gate | **KILL** | Stages 1+5+8+9 artifacts | >= 3 milestones, timeline >= 3mo, at least 1 priority='now' |
| 14 | technical-arch | Technical Architecture | artifact_only | No | Stages 1+13 artifacts | All 5 layers (presentation, api, business_logic, data, infrastructure) |
| 15 | risk-register | Risk Register | artifact_only | No | Stages 1+6+13+14 artifacts | risks (min 1) with severity, priority, mitigation |
| 16 | financial-proj | Financial Projections | decision_gate | **PROMOTION** | Stages 1+13+14+15 artifacts | Positive runway, defined projections; promotion gate evaluates stages 13-16 |
| 17 | pre-build | Pre-Build Checklist | decision_gate | **PROMOTION** (advance_venture_stage) / **BLOCKING** (worker) | Stages 13+14+15+16 artifacts | buildReadiness.decision in {go, conditional_go}; 5 checklist categories |
| 18 | sprint-planning | Sprint Planning | artifact_only | No | Stages 13+14+17 artifacts | sprint items (min 1), total_story_points |
| 19 | build-execution | Build Execution | artifact_only | No | Stages 17+18 artifacts | tasks (min 1), completion_pct, sprintCompletion |
| 20 | qa-testing | Quality Assurance | artifact_only | No | Stages 18+19 artifacts | test_suites (min 1), overall_pass_rate, quality_gate_passed |
| 21 | build-review | Build Review | artifact_only | No | Stages 19+20 artifacts | integrations (min 1), pass_rate, all_passing |
| 22 | release-readiness | Release Readiness | decision_gate | **PROMOTION** / **BLOCKING** (worker) | Stages 17-21 artifacts | releaseDecision = 'release'; promotion_gate evaluates stages 17-22 |
| 23 | marketing-prep | Marketing Preparation | decision_gate | **KILL** (advance_venture_stage) / **BLOCKING** (worker) | Stage 22 artifacts | marketing_items (min 3), sd_bridge_payloads |
| 24 | launch-readiness | Launch Readiness | artifact_only | **BLOCKING** (worker) | Stages 22+23 artifacts | go_no_go_decision, readiness_score, chairman gate |
| 25 | launch-execution | Launch Execution | artifact_only | No | Stage 24 artifacts | distribution_channels (min 1), operations_handoff, pipeline_terminus=true |

### 1.3 Gate Stage Classification

**Kill Gates** (venture may be terminated): Stages 3, 5, 13, 23
- Managed by `advance_venture_stage()` RPC: requires `chairman_decisions` row with `status='approved'` and `decision IN ('pass','go','proceed','approve','conditional_pass','conditional_go','continue','release')`
- Kill gate stages in `KILL_GATE_STAGES` (stage-gates.js): {3, 5, 13, 23}

**Promotion Gates** (advancement approval): Stages 16, 17, 22
- Managed by `advance_venture_stage()` RPC similarly
- Promotion gate stages in `PROMOTION_GATE_STAGES` (stage-gates.js): {16, 17, 22}

**Worker Blocking Gates** (Stage Execution Worker pauses): Stages 3, 5, 10, 22, 23, 24
- Defined in `CHAIRMAN_GATES.BLOCKING` in `stage-execution-worker.js`

**Review Mode Stages** (worker pauses for chairman review): Stages 7, 8, 9, 11
- Defined in `REVIEW_MODE_STAGES` in `stage-execution-worker.js`

### 1.4 Tier System

**Workflow Tier** (`ventures.tier` integer):
- Tier 0: 3 stages max (quick validation)
- Tier 1: 10 stages max
- Tier 2: 15 stages max
- Tier 3+ / null: all 25 stages

**Note**: After the fix in `20260307_bootstrap_all_25_stages.sql`, all 25 `venture_stage_work` rows are always created regardless of tier. Tier now controls UI visibility only, not database row existence.

**Business Maturity Tier** (`venture_tiers.tier_level` text):
- seed -> growth -> scale -> exit
- Entirely separate from workflow tier
- Evaluated by `tier-evaluation` edge function based on telemetry metrics

---

## 2. Stage Transition Logic

### 2.1 State Machine

The venture workflow has two complementary state management systems:

**A. Database RPC Functions** (`bootstrap_venture_workflow`, `advance_venture_stage`):
- `advance_venture_stage(venture_id, from_stage, to_stage, type)` is the authoritative stage transition function
- Validates current stage matches `p_from_stage`
- Enforces chairman gate approval for gate stages
- Atomically: marks current stage completed, advances `ventures.current_lifecycle_stage`, marks next stage in_progress
- Emits `STAGE_COMPLETE` and `STAGE_ENTRY` events
- Creates pending `chairman_decisions` row when entering a gate stage
- Uses idempotency keys to prevent duplicate transitions

**B. Stage Execution Worker** (`stage-execution-worker.js`):
- Polls `ventures` table for `status='active' AND orchestrator_state='idle' AND current_lifecycle_stage < 25`
- Acquires processing lock via `orchestrator-state-machine.js`
- Advances sequentially within the current operating mode
- Calls `processStage()` from `eva-orchestrator.js` for each stage
- Syncs results to `venture_stage_work` for frontend display
- Handles chairman gates by creating/waiting for decisions
- Pauses at operating mode boundaries

### 2.2 Operating Mode Boundaries

| Mode | Stages | Boundary Effect |
|------|--------|-----------------|
| EVALUATION | 1-5 | Worker pauses at stage 6 |
| STRATEGY | 6-12 | Worker pauses at stage 13 |
| PLANNING | 13-16 | Worker pauses at stage 17 |
| BUILD | 17-21 | Worker pauses at stage 22 |
| LAUNCH | 22-25 | Pipeline terminus at stage 25 |

The worker processes all stages within the current mode in one polling cycle, then releases the lock and pauses. The next poll cycle picks up the venture at the new mode boundary.

### 2.3 Orchestrator States

States: `idle`, `processing`, `blocked`, `failed`, `completed`, `killed_at_reality_gate`

Valid transitions:
- idle -> processing
- processing -> idle, blocked, failed, completed, killed_at_reality_gate
- blocked -> idle, processing
- failed -> idle, processing
- completed -> (terminal)
- killed_at_reality_gate -> (terminal)

### 2.4 Complete State Machine Map

```
Stage 0 (synthesis) --[bootstrap]--> Stage 1

Stage 1 --> Stage 2 --> Stage 3 (KILL GATE)
  Stage 3: PASS --> Stage 4, REVISE --> Stage 2, KILL --> terminated

Stage 4 --> Stage 5 (KILL GATE)
  Stage 5: PASS --> Stage 6, CONDITIONAL_PASS --> chairman review, KILL --> terminated

[MODE BOUNDARY: EVALUATION -> STRATEGY]

Stage 6 --> Stage 7 (review mode) --> Stage 8 (review mode) --> Stage 9 (review mode, reality gate)
  Stage 9 reality gate: validates stages 6+7+8 completeness

Stage 10 (BLOCKING gate) --> Stage 11 (review mode) --> Stage 12 (reality gate)

[MODE BOUNDARY: STRATEGY -> PLANNING]

Stage 13 (KILL GATE) --> Stage 14 --> Stage 15 --> Stage 16 (PROMOTION GATE)
  Stage 16 promotion gate: validates stages 13-16

[MODE BOUNDARY: PLANNING -> BUILD]

Stage 17 (PROMOTION GATE / BLOCKING) --> Stage 18 --> Stage 19 --> Stage 20 --> Stage 21

[MODE BOUNDARY: BUILD -> LAUNCH]

Stage 22 (PROMOTION GATE / BLOCKING) --> Stage 23 (KILL / BLOCKING) --> Stage 24 (BLOCKING) --> Stage 25

Stage 25 (Pipeline Terminus): sets pipeline_mode='operations'
```

### 2.5 Backward Transitions (Regression)

**Stage 3 REVISE decision**: Can route back to Stage 2 for re-scoring.

**No other backward transitions are formally supported** in the `advance_venture_stage()` RPC. The function only validates `p_to_stage` is between 1 and 25 and does not enforce forward-only progression. In theory, calling `advance_venture_stage(id, 10, 5, 'regression')` would succeed if stage 10 is current and has an approved chairman decision (if applicable). However:
- The Stage Execution Worker always advances forward
- The API PATCH endpoint bypasses `advance_venture_stage()` entirely (see issue CRITICAL-1 below)
- There is no UI-initiated regression path

---

## 3. Gate Decision Functions

### 3.1 compute-health-score (Edge Function)

**Purpose**: Aggregates 4 dimensions into a composite health score for a venture.

**Dimensions**:
1. `task_completion_rate` (30%): ratio of completed to total `service_tasks`
2. `confidence_accuracy` (25%): inverse of average calibration delta from `confidence_calibration_log`
3. `telemetry_freshness` (20%): time since last `service_telemetry` entry
4. `exit_readiness` (25%): from `venture_separability_scores.overall_score`

**Classification**: >= 0.7 = healthy, >= 0.4 = warning, < 0.4 = critical

**Side effects**: Updates `ventures.health_score` and `ventures.health_status`. Emits `venture_health_change` event on status transitions.

**Default behavior**: All dimensions default to 0.5 when data is missing, so a venture with no telemetry data starts at a 0.5 composite score ("warning").

### 3.2 tier-evaluation (Edge Function)

**Purpose**: Evaluates whether a venture qualifies for a higher business maturity tier.

**Tier progression**: seed -> growth -> scale -> exit

**Criteria per tier**:
| Tier | Min Tasks | Min Avg Confidence | Min Services Bound | Min Telemetry Reports |
|------|-----------|--------------------|--------------------|----------------------|
| seed | 0 | 0 | 0 | 0 |
| growth | 5 | 0.6 | 2 | 3 |
| scale | 20 | 0.75 | 4 | 10 |
| exit | 50 | 0.85 | 5 | 25 |

**Key rule**: Cannot skip tiers. Must meet ALL thresholds to advance to next tier.

**Side effect**: Inserts a `venture_tiers` record with `is_current=true` (trigger marks prior records as historical).

### 3.3 execute-exit (Edge Function)

**Purpose**: Orchestrates a 4-round, 30-day separation process.

**Rounds**:
1. `dependency_freeze` - Inventory all dependencies
2. `data_export` - Export venture data
3. `cutover_validation` - DNS/integration cutover
4. `certification` - Final certification

**Pre-conditions**: `venture_separability_scores.overall_score >= 60`

**Gate enforcement**: Chairman approval required between each round (`chairman_approval` parameter).

**Abort policy**: Can abort during rounds 1-2 only. Rounds 3-4 are irreversible.

**Completion**: Generates an `exit_certification` artifact in `venture_data_room_artifacts` and sets status to `completed`.

### 3.4 calibrate-confidence (Edge Function)

**Purpose**: Compares predicted confidence scores against actual PR outcomes to recalibrate per-service confidence thresholds.

**Algorithm**: Exponential Moving Average (EMA) with alpha=0.1

**Parameters**:
- `MIN_SAMPLES = 10`: Skips groups with fewer than 10 telemetry records
- `MAX_DELTA_PCT = 20`: Clamps threshold adjustment to +/-20%
- `DRIFT_THRESHOLD_PCT = 15`: Emits `confidence_drift_alert` event when exceeded

**Outcome scoring**: merged=1.0, revised=0.5, rejected=0.0

### 3.5 Gate Consistency Analysis

The gate decisions are consistent with stage requirements:
- Kill gates (3, 5, 13, 23) evaluate whether the venture should continue to exist
- Promotion gates (16, 17, 22) evaluate whether a complete phase's output justifies advancement
- The `advance_venture_stage()` function correctly requires an approved chairman decision at all 7 gate stages
- The worker's `CHAIRMAN_GATES.BLOCKING` set (3, 5, 10, 22, 23, 24) adds 10 and 24 as blocking stages beyond the DB gates, which is correct since these are chairman review points

---

## 4. Venture Data Model

### 4.1 Core Tables

| Table | Purpose | FK to ventures |
|-------|---------|---------------|
| `ventures` | Primary venture record | (self) |
| `eva_ventures` | EVA subsystem mirror | CASCADE via trigger sync |
| `venture_stage_work` | Per-stage status/progress | CASCADE |
| `venture_artifacts` | Versioned stage outputs | CASCADE |
| `venture_stage_transitions` | Transition audit log | (via bootstrap/advance functions) |
| `stage_events` | STAGE_ENTRY/STAGE_COMPLETE events | CASCADE |
| `chairman_decisions` | Gate approval/rejection records | RESTRICT |
| `venture_financial_contract` | Canonical financial metrics | CASCADE |
| `venture_capabilities` | Reusable capability registry | SET NULL |
| `venture_tiers` | Business maturity classification | CASCADE |
| `venture_exit_readiness` | Separation readiness tracking | CASCADE |
| `venture_dependencies` | Inter-venture dependencies | SET NULL |
| `venture_service_bindings` | Service connections | CASCADE |
| `venture_briefs` | Venture summaries | CASCADE |
| `venture_templates` | Template derivation tracking | SET NULL |

### 4.2 FK Policies (Corrected in 20260306_align_venture_fk_policies.sql)

- **RESTRICT**: `chairman_decisions`, `chairman_directives`, `governance_decisions`, `compliance_gate_events`, `risk_escalation_log`, `risk_gate_passage_log` -- governance tables block venture deletion
- **SET NULL**: `sd_proposals`, `venture_dependencies`, `venture_capabilities`, `venture_templates`, `agent_registry` -- cross-reference tables preserve records
- **CASCADE**: All child data tables (artifacts, stage_work, events, EVA tables, missions, etc.)

### 4.3 Data Integrity Assessment

**Strong points**:
- Comprehensive FK policies audited and corrected in a dedicated migration
- `venture_stage_work` has a unique constraint on `(venture_id, lifecycle_stage)` preventing duplicate stage rows
- `venture_stage_transitions` uses idempotency keys via `uuid_generate_v5` to prevent duplicate transitions
- Row-level security (RLS) enabled on all venture-adjacent tables

**Integrity risks**:
- `stage_events` had a missing FK constraint (fixed in 20260306 migration)
- `financial_models` had a duplicate FK (cleaned in same migration)
- `ventures.tier` (integer, workflow cap) vs `venture_tiers.tier_level` (text, business maturity) are semantically different but similarly named -- potential confusion

### 4.4 Data Flow Through Stages

```
Venture Creation -> bootstrap_venture_workflow()
  -> Creates 25 venture_stage_work rows
  -> Stage 1 = 'in_progress', stages 2-25 = 'not_started'
  -> STAGE_ENTRY event for stage 1
  -> Bootstrap transition recorded (from_stage=0)

Stage Execution (per stage):
  1. Worker polls for idle active ventures
  2. Acquires orchestrator lock
  3. processStage() loads template, fetches upstream artifacts
  4. Template's analysisStep() generates output
  5. Output validated against template schema + cross-stage contracts
  6. Artifact persisted to venture_artifacts (is_current=true, previous versions marked false)
  7. venture_stage_work updated with advisory_data and stage_status
  8. advance_venture_stage() transitions the venture
  9. Lock released
```

---

## 5. EVA Integration Points

### 5.1 Dual-Table Architecture

The system maintains two tables: `ventures` (primary, UI-facing) and `eva_ventures` (EVA subsystem).

**Sync triggers**:
- `trg_ventures_insert_sync_eva`: On INSERT to ventures, creates/upserts eva_ventures row
- `trg_ventures_update_sync_eva`: On UPDATE to ventures, syncs `current_lifecycle_stage`, `status`, and `name`

**Status mapping** (fixed in 20260315 migration):
- active -> active
- paused -> paused
- cancelled -> killed
- completed -> graduated
- archived -> paused

### 5.2 EVA Pipeline Integration

The `eva-orchestrator.js` is the core pipeline engine that:
1. Loads venture context via `VentureContextManager`
2. Loads chairman preferences via `ChairmanPreferenceStore`
3. Resolves current stage via `VentureStateMachine`
4. Loads stage template from `StageRegistry`
5. Fetches upstream artifacts based on `CROSS_STAGE_DEPS` map
6. Validates pre-stage contracts
7. Executes the template's `analysisStep()`
8. Validates post-stage contracts
9. Runs through the Decision Filter Engine
10. Evaluates reality gates at phase boundaries
11. Persists artifacts and advances stage

### 5.3 EVA Event Bus Integration

Events emitted during lifecycle:
- `stage_analysis_completed` (after artifact persistence)
- `chairman_gate_waiting` (when blocking at a gate)
- `venture_killed` (on kill)
- `venture_health_change` (on health status transition)
- `stale_lock_released` (stale lock cleanup)
- `confidence_drift_alert` (calibration drift)
- `exit_started`, `exit_completed`, `exit_aborted`

### 5.4 Synchronization Issues

**MODERATE-1**: The `ventures` table worker polling query checks `orchestrator_state='idle'` on the `ventures` table directly (migration `20260307_add_orchestrator_columns_to_ventures.sql` added these columns). The original worker was designed for `eva_ventures`. Both tables now have orchestrator columns, but the worker uses `ventures` directly. The `eva_ventures` orchestrator columns are synced on INSERT but NOT on orchestrator_state changes. This means `eva_ventures.orchestrator_state` may be stale.

---

## 6. Edge Cases & Error States

### 6.1 Venture Abandoned Mid-Stage

**Behavior**: The orchestrator lock has a 5-minute stale lock threshold (`DEFAULT_STALE_LOCK_THRESHOLD_MS = 300000`). If a worker crashes or times out:
1. Next tick calls `_releaseStaleLocks()`
2. Ventures locked > 5 minutes are reset to `orchestrator_state='idle'`
3. Next poll cycle picks them up and retries from the current stage

**Finding**: This is well-designed. The stage execution is idempotent (ON CONFLICT DO NOTHING for transitions, is_current versioning for artifacts).

### 6.2 Backward Regression

**Not formally supported** but not formally prevented in the database functions. The `advance_venture_stage()` function allows `p_to_stage` to be any value 1-25. Stage 3's REVISE decision is the only designed backward path.

**MODERATE-2**: There is no guard in `advance_venture_stage()` against arbitrary backward transitions. A caller could move a venture from stage 20 back to stage 3 if they pass the right parameters. The worker always advances forward, but the API or direct DB calls could regress a venture.

### 6.3 Prerequisites Not Met

**Pre-stage contract validation**: The `validatePreStage()` function checks consumed upstream data exists. In BLOCKING mode, missing required upstream data blocks execution with a `contractViolation` result.

**Gate enforcement**: `advance_venture_stage()` requires an approved chairman decision to pass gate stages. Without it, the function returns `{success: false, error: 'gate_blocked'}`.

### 6.4 Timeout Mechanisms

- **Orchestrator lock**: 5-minute stale lock threshold
- **Chairman gate timeout**: Default 0 (infinite) -- worker marks venture as `blocked` immediately without waiting
- **Stage execution retry**: 2 retries with exponential backoff (5s, 10s)
- **Worker stall detection**: 5-minute threshold, health endpoint returns `degraded` status

### 6.5 Concurrent Modifications

**Well-handled**:
- `bootstrap_venture_workflow()` uses `SELECT ... FOR UPDATE` row locking
- `advance_venture_stage()` uses `SELECT ... FOR UPDATE` row locking
- Orchestrator state machine uses atomic transitions (update WHERE state='idle')
- `venture_stage_work` has unique constraint preventing duplicate stage rows
- Transition idempotency keys prevent duplicate transitions

### 6.6 Venture Kill Flow

The worker can kill a venture at a gate stage. The kill flow:
1. Sets `ventures.status = 'killed'`
2. Sets `orchestrator_state = 'killed_at_reality_gate'`
3. Clears lock fields
4. Emits `venture_killed` event
5. `killed_at_reality_gate` is a terminal state with no outbound transitions

---

## 7. API Completeness

### 7.1 Venture API Endpoints (server/routes/ventures.js)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List all ventures |
| GET | `/:id` | Get single venture |
| GET | `/:id/artifacts` | Get artifacts (or stage work fallback) |
| PATCH | `/:id/stage` | Update venture stage |
| POST | `/:id/artifacts` | Create/update artifact |
| POST | `/` | Create new venture |
| POST | `/competitor-analysis` | Analyze competitor URL |

### 7.2 Missing API Operations

**CRITICAL-1: PATCH /:id/stage bypasses all gate enforcement**

The `PATCH /:id/stage` endpoint directly updates `ventures.current_lifecycle_stage` without:
- Checking gate approval (no chairman decision validation)
- Checking current stage (no from_stage validation)
- Creating stage events (no STAGE_COMPLETE/STAGE_ENTRY)
- Updating `venture_stage_work` status
- Creating transition records

This endpoint can move a venture to any stage 1-25 with no validation, completely bypassing the `advance_venture_stage()` RPC function's safety checks. It should either be removed, restricted to admin-only, or refactored to call `advance_venture_stage()`.

**Missing endpoints**:
- No DELETE venture endpoint (deletion may be intentionally prevented by RESTRICT FKs on governance tables)
- No PATCH for venture metadata updates (name, description, etc.)
- No endpoint to bootstrap workflow (must call RPC directly)
- No endpoint to trigger stage execution (worker-only)
- No endpoint to list/manage chairman decisions for a venture
- No endpoint for venture kill/pause/resume operations

### 7.3 Edge Function API

| Function | Trigger Method | Auth Required |
|----------|---------------|---------------|
| compute-health-score | POST (venture_id) | Yes |
| tier-evaluation | POST (venture_id) | Yes |
| execute-exit | POST (venture_id, action) | Yes |
| calibrate-confidence | POST (venture_id?, service_key?) | Yes |

### 7.4 RPC Functions

| Function | Purpose |
|----------|---------|
| `bootstrap_venture_workflow(UUID)` | Scaffold all stage work rows |
| `advance_venture_stage(UUID, INT, INT, TEXT)` | Gate-enforced stage advancement |
| `get_gate_decision_status(UUID, INT)` | Query gate decision status (SECURITY DEFINER) |
| `validate_financial_consistency(UUID, INT, JSONB)` | Check proposed financials against contract |

---

## 8. Financial & Exit Integration

### 8.1 Financial Contract (venture_financial_contract)

**Set by**: Stage 5 (Financial Kill Gate)

**Validated by downstream stages**: 8, 15, 19, 20 (per migration comment)

**Deviation thresholds**:
- **Block**: > 50% deviation from contract values
- **Warning**: > 20% deviation
- **OK**: <= 20% deviation

**Fields tracked**: `capital_required`, `cac_estimate`, `ltv_estimate`, `unit_economics`, `pricing_model`, `price_points`, `revenue_projection`

### 8.2 Exit Process

The exit workflow is independent of stage progression:

1. **Pre-condition**: `venture_separability_scores.overall_score >= 60`
2. **4-round process**: dependency_freeze -> data_export -> cutover_validation -> certification
3. **Chairman approval**: Required between each round
4. **Abort**: Only possible in rounds 1-2 (rounds 3-4 irreversible)
5. **Completion**: Generates certification artifact, updates `venture_exit_readiness.status = 'completed'`

**MODERATE-3**: The exit process writes to `venture_data_room_artifacts` for the certification, but this table is not referenced in any FK migration. It may not have proper FK constraints to the ventures table.

### 8.3 Financial Consistency Flow

```
Stage 5 (Kill Gate) -> Sets venture_financial_contract baseline
  |
  v
Stage 8 (BMC) -> May call validate_financial_consistency()
Stage 15 (Risk Register) -> May call validate_financial_consistency()
Stage 19 (Build Execution) -> May call validate_financial_consistency()
Stage 20 (QA) -> May call validate_financial_consistency()
```

The validation function returns deviations per field with severity ratings. However, the call to `validate_financial_consistency()` from the stage templates is not enforced -- it depends on each stage's `analysisStep()` implementation calling it.

---

## 9. Cross-Stage Data Contract Map

### 9.1 Dependency Graph

The `CROSS_STAGE_DEPS` map in `stage-contracts.js` defines which upstream stage artifacts are required for each stage's execution:

```
Stage 1: [0]
Stage 2: [1]
Stage 3: [1, 2]
Stage 4: [1, 3]
Stage 5: [1, 3, 4]
Stage 6: [1, 3, 4, 5]
Stage 7: [1, 4, 5, 6]
Stage 8: [1, 4, 5, 6, 7]
Stage 9: [1, 5, 6, 7, 8]
Stage 10: [1, 3, 5, 8]
Stage 11: [1, 5, 10]
Stage 12: [1, 5, 7, 10, 11]
Stage 13: [1, 5, 8, 9]
Stage 14: [1, 13]
Stage 15: [1, 6, 13, 14]
Stage 16: [1, 13, 14, 15]
Stage 17: [13, 14, 15, 16]
Stage 18: [13, 14, 17]
Stage 19: [17, 18]
Stage 20: [18, 19]
Stage 21: [19, 20]
Stage 22: [17, 18, 19, 20, 21]
Stage 23: [1, 22]
Stage 24: [22, 23]
Stage 25: [24]
```

### 9.2 Circular Dependencies

**None found**. The dependency graph is a DAG (Directed Acyclic Graph). Each stage only depends on earlier stages (lower numbers) or a subset thereof. The `getUpstreamStages()` function includes cycle protection via a visited set.

### 9.3 Dead-End States

**No permanent dead-ends in the stage graph itself**. All stages have a successor except stage 25 (pipeline terminus).

**However, dead-end conditions exist**:
1. Kill gate KILL decision at stages 3, 5, 13, 23 -> venture terminates
2. Chairman rejection at any blocking gate -> venture stays blocked until manual intervention
3. `orchestrator_state = 'killed_at_reality_gate'` -> terminal, no recovery path
4. `orchestrator_state = 'completed'` -> terminal (but this is the success path)

**MODERATE-4**: There is no automated mechanism to revive a venture from `killed_at_reality_gate` or `completed` states. These are true terminal states. If a venture was incorrectly killed, manual database intervention is required.

---

## 10. Identified Issues

### CRITICAL

**CRITICAL-1: PATCH /:id/stage endpoint bypasses all gate enforcement**
- **File**: `server/routes/ventures.js` (lines 113-136)
- **Impact**: Any authenticated user can advance a venture past kill gates, promotion gates, and mode boundaries without chairman approval
- **Recommendation**: Remove or replace with a call to `advance_venture_stage()` RPC. At minimum, add admin-only authorization.

**CRITICAL-2: advance_venture_stage() idempotency key does not support repeated transitions between same stages**
- **File**: `supabase/migrations/20260307_bootstrap_venture_workflow.sql` (lines 292-295)
- **Impact**: The idempotency key is computed as `uuid_generate_v5(null_uuid, venture_id + ':' + from_stage + ':' + to_stage)`. If a venture goes through the REVISE loop (stage 3 -> stage 2 -> stage 3), the second 2->3 transition has the same idempotency key as the first, and `ON CONFLICT DO NOTHING` silently drops it. The transition is still recorded in `stage_events` (which uses `gen_random_uuid()`), but the `venture_stage_transitions` record is lost.
- **Recommendation**: Include a sequence number or timestamp in the idempotency key computation.

**CRITICAL-3: Gate stage mismatch between bootstrap and advance functions**
- `bootstrap_venture_workflow()` gate stages: `[3, 5, 13, 16, 17, 22, 23]`
- `advance_venture_stage()` all gates: `[3, 5, 13, 16, 17, 22, 23]`
- Worker BLOCKING gates: `[3, 5, 10, 22, 23, 24]`
- Stage-gates.js KILL_GATE_STAGES: `[3, 5, 13, 23]`
- Stage-gates.js PROMOTION_GATE_STAGES: `[16, 17, 22]`

The worker BLOCKING set includes stages 10 and 24 which are NOT in the `advance_venture_stage()` gate array. This means:
- Stage 10: Worker blocks for chairman review, but `advance_venture_stage()` does NOT require an approved decision to advance past stage 10. The `chairman_decisions` row created by the worker is a "review" type, not a gate type.
- Stage 24: Same pattern -- worker blocks, but the RPC function doesn't enforce a gate.

**Impact**: The worker creates appropriate pauses at these stages, but if `advance_venture_stage()` is called directly (or via the unsafe PATCH endpoint), stages 10 and 24 have no gate enforcement. This is by design (they're review stages, not kill/promotion gates) but creates an inconsistency in the mental model.

### MODERATE

**MODERATE-1**: `eva_ventures.orchestrator_state` is not synced from `ventures` table. The sync triggers only sync `current_lifecycle_stage`, `status`, and `name`. The orchestrator state columns were added to `ventures` directly to avoid this dependency, but `eva_ventures` still has stale orchestrator data.

**MODERATE-2**: No guard against arbitrary backward stage transitions in `advance_venture_stage()`. The function validates `p_to_stage` range (1-25) but not forward-only progression.

**MODERATE-3**: `venture_data_room_artifacts` table (used by exit certification) is not referenced in any FK alignment migration. May lack proper CASCADE/RESTRICT policies.

**MODERATE-4**: No automated recovery path for incorrectly killed or completed ventures. Both `killed_at_reality_gate` and `completed` are terminal states with no outbound transitions.

**MODERATE-5**: The `bootstrap_venture_workflow()` function was originally tier-limited (tier 0 = 3 stages, tier 1 = 10, etc.) but was later changed to always create 25 rows. However, the original migration (`20260307_bootstrap_venture_workflow.sql`) is still present alongside the fix (`20260307_bootstrap_all_25_stages.sql`). If migrations are run in order, the fix overrides the original. But the original function remains confusing to readers of the migration history.

### INFORMATIONAL

**INFO-1**: The system has extensive test coverage:
- Unit tests for VentureStateMachine, stage templates, cross-venture learning
- Integration tests for venture artifact pipeline
- UAT tests for venture lifecycle, workflow, and e2e scenarios
- State machine JIT truth check tests

**INFO-2**: All 25 stage templates are implemented with consistent structure:
- Each has `id`, `slug`, `title`, `version`, `schema`, `defaultData`, `validate()`, `computeDerived()`, and `analysisStep()`
- Templates are registered in both the file-based StageRegistry and auto-registered in the index.js barrel export
- DB-based configuration augments file-based templates via 5-minute TTL cache

**INFO-3**: The financial consistency contract (`validate_financial_consistency()`) is backward-compatible -- returns `consistent=true` when no contract exists (pre-Stage 5 ventures).

**INFO-4**: The worker health server (default port 3001) provides a `/health` endpoint with stall detection, uptime, and active venture counts. Uses HTTP 503 for degraded status.

---

## 11. Recommendations

### Priority 1 (Immediate)
1. **Fix CRITICAL-1**: Remove or secure the PATCH `/:id/stage` endpoint. Replace with a new endpoint that calls `advance_venture_stage()` RPC.
2. **Fix CRITICAL-2**: Add a sequence number or revision counter to the idempotency key in `advance_venture_stage()` to support REVISE loops.

### Priority 2 (Soon)
3. Add forward-only constraint to `advance_venture_stage()` or document the backward transition behavior explicitly.
4. Audit `venture_data_room_artifacts` FK policies.
5. Consider adding a `revive_venture()` RPC for recovering incorrectly killed ventures (transition from terminal states back to blocked/idle).

### Priority 3 (Maintenance)
6. Consolidate the original and fixed `bootstrap_venture_workflow()` migration into a single canonical version.
7. Remove or clearly deprecate `eva_ventures` orchestrator columns that are no longer synced.
8. Consider adding venture-level API endpoints for kill, pause, resume, and bootstrap operations.

---

## 12. Architecture Diagram

```
                    +-----------------+
                    | Chairman (User) |
                    +--------+--------+
                             |
                   Gate decisions, reviews
                             |
                    +--------v--------+
                    | chairman_       |
                    | decisions       |
                    +--------+--------+
                             |
  +----------------+---------+---------+----------------+
  |                |                   |                |
  v                v                   v                v
+-------+  +-------------+  +------------------+  +---------+
| API   |  | Stage Exec  |  | EVA Orchestrator |  | Edge    |
| Routes|  | Worker      |  | (processStage)   |  | Fns     |
+---+---+  +------+------+  +--------+---------+  +----+----+
    |             |                   |                  |
    |  poll/lock  |    analysisStep   |                  |
    |             |                   |                  |
    v             v                   v                  v
+---+-------------+-------------------+------------------+---+
|                       Supabase Database                    |
|                                                            |
|  ventures              venture_stage_work                  |
|  venture_artifacts     venture_stage_transitions           |
|  stage_events          chairman_decisions                  |
|  venture_financial_contract    venture_tiers               |
|  venture_exit_readiness        venture_capabilities        |
|  ehg_services          service_tasks                       |
|  service_telemetry     venture_service_bindings            |
|  confidence_calibration_log    eva_event_bus               |
+------------------------------------------------------------+
```

---

## 13. Files Examined

### Migrations (8 files)
- `supabase/migrations/20260222_venture_capabilities.sql`
- `supabase/migrations/20260304_venture_financial_contract.sql`
- `supabase/migrations/20260306_align_venture_fk_policies.sql`
- `supabase/migrations/20260307_bootstrap_venture_workflow.sql`
- `supabase/migrations/20260307_add_orchestrator_columns_to_ventures.sql`
- `supabase/migrations/20260307_bootstrap_all_25_stages.sql`
- `supabase/migrations/20260307_activate_stage_execution_worker.sql`
- `supabase/migrations/20260307_get_gate_decision_status.sql`
- `supabase/migrations/20260309_venture_factory_foundation.sql`
- `supabase/migrations/20260309_venture_tiers_and_exit_readiness.sql`
- `supabase/migrations/20260309_venture_factory_service_expansion.sql`
- `database/migrations/20260315_fix_eva_ventures_status_sync.sql`

### Edge Functions (4 files)
- `supabase/functions/compute-health-score/index.ts`
- `supabase/functions/tier-evaluation/index.ts`
- `supabase/functions/execute-exit/index.ts`
- `supabase/functions/calibrate-confidence/index.ts`

### Core Engine (6 files)
- `lib/eva/stage-execution-engine.js`
- `lib/eva/stage-execution-worker.js`
- `lib/eva/stage-registry.js`
- `lib/eva/stage-dependency-resolver.js`
- `lib/eva/eva-orchestrator.js`
- `lib/eva/orchestrator-state-machine.js`

### Stage Templates (25 + index)
- `lib/eva/stage-templates/index.js`
- `lib/eva/stage-templates/stage-01.js` through `stage-25.js`

### Contracts & Gates
- `lib/eva/contracts/stage-contracts.js`
- `lib/agents/modules/venture-state-machine/stage-gates.js`
- `lib/agents/venture-state-machine.js`

### API & Integration
- `server/routes/ventures.js`
- `lib/eva/venture-context-manager.js`
- `lib/eva/venture-monitor.js`

### Tests
- `tests/unit/eva/venture-state-machine.test.js`
- `tests/unit/agents/venture-state-machine-jit-check.test.js`
- `tests/uat/e2e-ventureLifecycle.spec.js`

---

*Report generated: 2026-03-17 | Total files analyzed: 55+*
