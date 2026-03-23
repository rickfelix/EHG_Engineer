# EHG Venture Lifecycle Pipeline — Ground-Truth Triangulation Prompt

> **Use this prompt in both AntiGravity (Gemini) and OpenAI for independent assessment.**
> **Date**: 2026-03-19
> **Prepared by**: Claude Code (with full codebase access)

---

## System Prompt (paste as system/instruction)

You are a senior systems architect and venture pipeline analyst. You are reviewing a 25-stage AI-driven venture evaluation pipeline. Perform an independent critical assessment. Be specific about issues and actionable in recommendations. Do not trust documentation claims — the evidence below comes from actual code and production database queries.

---

## User Prompt (paste as user message)

# EHG Venture Lifecycle Pipeline — Architecture Assessment

## What This System Does

The EHG system runs AI-simulated ventures through a 25-stage lifecycle pipeline. An autonomous Stage Execution Worker polls for ventures needing advancement, executes each stage via an LLM-powered `processStage()` function, and handles chairman approval gates, autonomy levels, reality gates, and decision filters. There is no real product being built — the pipeline evaluates and stress-tests venture IDEAS through simulation.

A single human (the "Chairman") oversees the pipeline and approves/rejects/kills ventures at gate stages.

---

## The 25 Stages (from actual code: lib/eva/stage-templates/stage-NN.js)

### PHASE 1: THE TRUTH (Stages 1-5) — EVALUATION Mode
| Stage | Slug | What It Does | Artifacts Produced | Gate |
|-------|------|-------------|-------------------|------|
| 1 | draft-idea | Idea Capture | idea_brief (description, problem, value prop, target market) | None |
| 2 | idea-validation | Idea Analysis | critique_report (7 sub-scores via Mixture of Agents) | None |
| 3 | validation | Viability Kill Gate | validation_report + devils_advocate_review | **KILL GATE + CHAIRMAN BLOCK** — score ≥70 PASS, 50-70 REVISE→S2, <50 KILL |
| 4 | competitive-intel | Competitive Landscape | competitive_analysis (SWOT per competitor) | None |
| 5 | profitability | Financial Kill Gate | financial_model + devils_advocate_review | **KILL GATE + CHAIRMAN BLOCK + Reality Gate 5→6** |

### PHASE 2: THE ENGINE (Stages 6-9) — STRATEGY Mode
| Stage | Slug | What It Does | Artifacts Produced | Gate |
|-------|------|-------------|-------------------|------|
| 6 | risk-matrix | Risk Assessment | risk_matrix (≥10 risks, aggregate score) | None |
| 7 | pricing | Revenue Architecture | pricing_model (model, tiers, landscape) | **REVIEW MODE** (pauses for chairman review before advancing) |
| 8 | bmc | Business Model Canvas | business_model_canvas (all 9 BMC blocks) | **REVIEW MODE** |
| 9 | exit-strategy | Exit Strategy | exit_strategy (thesis, ≥3 acquirers, valuation) | **REVIEW MODE + Reality Gate 9→10** |

### PHASE 3: THE IDENTITY (Stages 10-12) — STRATEGY Mode (cont.)
| Stage | Slug | What It Does | Artifacts Produced | Gate |
|-------|------|-------------|-------------------|------|
| 10 | customer-brand-foundation | Customer & Brand | cultural_design_config, strategic_narrative, marketing_manifest, brand_guidelines | **CHAIRMAN BLOCK** (≥3 personas, brand genome required) |
| 11 | naming-visual-identity | Naming & Visual Identity | brand_name, gtm_plan, marketing_manifest | **REVIEW MODE** |
| 12 | gtm-sales-strategy | GTM & Sales | sales_playbook (3 market tiers, 8 channels, funnel, journey) | Dual gate: local completeness + Reality Gate 12→13 |

### PHASE 4: THE BLUEPRINT (Stages 13-16) — PLANNING Mode
| Stage | Slug | What It Does | Artifacts Produced | Gate |
|-------|------|-------------|-------------------|------|
| 13 | product-roadmap | Product Roadmap | tech_stack_decision + devils_advocate_review | **KILL GATE + CHAIRMAN BLOCK** (≥3 milestones, timeline ≥3mo) |
| 14 | technical-architecture | Technical Architecture | erd_diagram, data_model (5 architecture layers) | None |
| 15 | risk-register | Resource Planning | user_story_pack (risks with severity/priority/mitigation) | None |
| 16 | financial-projections | Financial Projections | schema_spec, api_contract + devils_advocate_review | **PROMOTION GATE + CHAIRMAN BLOCK + Reality Gate 16→17** |

### PHASE 5: THE BUILD LOOP (Stages 17-21) — BUILD Mode
| Stage | Slug | What It Does | Artifacts Produced | Gate |
|-------|------|-------------|-------------------|------|
| 17 | pre-build-checklist | Pre-Build Checklist | system_prompt, cicd_config + devils_advocate_review | **CHAIRMAN BLOCK** (go/conditional_go decision) |
| 18 | sprint-planning | Sprint Planning | stage_output, lifecycle_sd_bridge (SD bridge payloads) | None |
| 19 | build-execution | Build Execution | stage_output (sprint completion) | None |
| 20 | quality-assurance | Quality Assurance | security_audit (coverage metrics) | None |
| 21 | integration-testing | Build Review | uat_report, test_plan (approve/conditional) | None |

### PHASE 6: LAUNCH & LEARN (Stages 22-25) — LAUNCH Mode
| Stage | Slug | What It Does | Artifacts Produced | Gate |
|-------|------|-------------|-------------------|------|
| 22 | release-readiness | Release Readiness | deployment_runbook + devils_advocate_review | **PROMOTION GATE + CHAIRMAN BLOCK + Reality Gate 22→23** |
| 23 | marketing-preparation | Marketing Preparation | launch_checklist + devils_advocate_review | **KILL GATE + CHAIRMAN BLOCK** |
| 24 | launch-readiness | Launch Readiness | retention_playbook, churn_triggers, health_scoring_system, analytics_dashboard | **CHAIRMAN BLOCK** (go/no-go) |
| 25 | launch-execution | Launch Execution | assumptions_vs_reality_report, optimization_roadmap | Terminal stage. Sets pipeline_mode='operations'. |

---

## Gate Architecture (from actual code constants)

### Chairman Blocking Gates (9 of 25 stages): `[3, 5, 10, 13, 16, 17, 22, 23, 24]`
Pipeline halts and waits for chairman to approve, reject, or kill.

### Review Mode Stages (4 of 25): `[7, 8, 9, 11]`
Pipeline executes the stage, then pauses for chairman review before advancing. Not a kill gate — chairman confirms quality.

### Kill Gates (4 stages): `[3, 5, 13, 23]`
Chairman can terminate the venture entirely.

### Promotion Gates (5 stages): `[10, 16, 17, 22, 24]`
Cross-stage validation — checks that prerequisites from prior stages are met.

### Reality Gates (5 phase boundaries):
| Boundary | Required Artifacts (with min quality score) |
|----------|---------------------------------------------|
| 5→6 (EVALUATION→STRATEGY) | problem_statement (≥0.6), target_market_analysis (≥0.5), value_proposition (≥0.6) |
| 9→10 (STRATEGY→IDENTITY) | risk_assessment (≥0.5), revenue_model (≥0.5), business_model_canvas (≥0.6) |
| 12→13 (IDENTITY→BLUEPRINT) | business_model_canvas (≥0.7), technical_architecture (≥0.6), project_plan (≥0.5) |
| 16→17 (BLUEPRINT→BUILD) | mvp_build (≥0.7, **URL reachable**), test_coverage_report (≥0.6), deployment_runbook (≥0.5) |
| 22→23 (BUILD→LAUNCH) | launch_metrics (≥0.6), user_feedback_summary (≥0.5), production_app (≥0.7, **URL reachable**) |

### Operating Mode Boundaries (worker pauses at transitions):
```
EVALUATION: Stages 1-5
STRATEGY:   Stages 6-12
PLANNING:   Stages 13-16
BUILD:      Stages 17-21
LAUNCH:     Stages 22-25
```

---

## Autonomy Model (from lib/eva/autonomy-model.js)

| Level | stage_gate | reality_gate | devils_advocate | Description |
|-------|-----------|-------------|-----------------|-------------|
| L0 (Manual) | manual | manual | manual | All gates require chairman |
| L1 (Guided) | auto_approve | manual | manual | Stage gates auto, reality manual |
| L2 (Supervised) | auto_approve | auto_approve | auto_approve | All auto, chairman notified |
| L3 (Autonomous) | auto_approve | auto_approve | skip | All auto, exceptions only |
| L4 (Full) | auto_approve | auto_approve | skip | All auto, no notifications |

---

## Decision Filter Engine (from lib/eva/decision-filter-engine.js)

Evaluated after each stage execution. Checks (in order):
1. cost_threshold — spend exceeds limit
2. budget_exceeded — token budget at/over limit
3. new_tech_vendor — unapproved technology/vendor detected
4. strategic_pivot — pivot keywords detected
5. low_score — quality below threshold (stage-specific overrides for S3, S5)
6. novel_pattern — new patterns vs. prior stages
7. constraint_drift — parameter changes
8. vision_score_signal — vision alignment low

**Output**: `AUTO_PROCEED`, `PRESENT_TO_CHAIRMAN`, or `STOP`

Chairman can override per-stage via `chairman_dashboard_config.stage_overrides`.

---

## Worker Pipeline Flow (from lib/eva/stage-execution-worker.js)

```
1. _tick() polls ventures table every 30s
2. _pollForWork() → SELECT ventures WHERE status='active' AND orchestrator_state='idle' AND current_lifecycle_stage < 25
3. _processVenture(ventureId):
   a. acquireProcessingLock() — atomic CAS: idle → processing
   b. Fetch current_lifecycle_stage from DB
   c. WHILE currentStage <= 25 AND running:
      - Check abort signal
      - Check operating mode boundary → break if crossed
      - Check governance override (chairman per-stage override) → break if manual
      - _executeWithRetry(ventureId, stage, lockId):
        * Create stage_executions record
        * Call processStage() (the LLM-powered orchestrator)
        * If COMPLETED or BLOCKED → return (no retry)
        * If failed/threw → retry up to maxRetries (default 2) with backoff
      - _syncStageWork() → write results to venture_stage_work for UI
      - Check if already-approved decision exists (re-entry protection)
      - If REVIEW_MODE stage → create decision, block for review
      - If CHAIRMAN_GATE stage → _handleChairmanGate():
        * Check autonomy level (L2+ auto-approves)
        * Create or reuse pending decision
        * If already approved → continue
        * If killed → kill venture
        * Otherwise → block
      - Check result status (FAILED → break, BLOCKED → break)
      - Check filter decision (STOP → break, REQUIRE_REVIEW → break)
      - If stage >= 25 → markCompleted(), return
      - Advance to next stage (from result.nextStageId or DB re-read)
   d. Release lock with target state (idle/blocked/failed)
```

---

## Production Data (from actual database queries, NOT documentation)

### Venture: MarketInsight AI (created 2026-03-19)

**Execution Results**: All 25 stages executed, ALL succeeded (zero errors).

**Execution Attempt Counts** (CRITICAL — shows re-run problem):
```
Stage  1:  3 attempts
Stage  2:  5 attempts  ⚠️
Stage  3:  3 attempts
Stage  4:  2 attempts
Stage  5: 11 attempts  ⚠️⚠️
Stage  6:  3 attempts
Stage  7: 19 attempts  ⚠️⚠️⚠️
Stage  8:  2 attempts
Stage  9:  3 attempts
Stage 10:  1 attempt
Stage 11:  3 attempts
Stage 12:  1 attempt
Stages 13-19: 1 attempt each ✅
Stage 20:  2 attempts
Stages 21-23: 1 attempt each ✅
Stage 24:  2 attempts
Stage 25:  2 attempts
```

**Stage 5 Timing** (11 executions): Each takes 20-53 seconds, spaced ~30s apart. This is the **poll interval** — the worker re-processes Stage 5 every tick because the venture stays at Stage 5 (chairman gate blocks advancement, but worker doesn't see it as blocked on the NEXT tick).

**Stage 7 Timing** (19 executions): First takes 25s, then **18 executions at 1-2 second intervals**. This is a **tight loop** — the worker is executing processStage 18 times in 36 seconds. Stage 7 is a REVIEW_MODE stage. The LLM returns instantly (cached/idempotent?) and the review-mode blocking logic may not be preventing re-entry.

**Artifact Integrity**:
```
Stages 1-9:  Full dual-write ✅ (both content and artifact_data populated)
Stage 10:    brand_guidelines — BOTH content AND artifact_data are NULL ⚠️
Stage 11:    brand_name — BOTH content AND artifact_data are NULL ⚠️
Stages 12-19: Full dual-write ✅
Stage 20:    security_audit — content=NULL (data present)
Stage 21:    uat_report, test_plan — content=NULL (data present)
Stage 22:    deployment_runbook — content=NULL; devils_advocate_review — data=NULL
Stage 23:    launch_checklist — content=NULL; devils_advocate_review — data=NULL
Stage 24:    All 4 artifacts — content=NULL (data present)
Stage 25:    Both artifacts — content=NULL (data present)
```

**Chairman Decisions**:
```
Stage  3: pending/advisory (never resolved?)
Stage  5: pending/advisory (never resolved?)
Stage  7: approved
Stage  8: approved
Stage  9: approved
Stage 10: approved (proceed)
Stage 11: approved
Stage 16: pending/advisory (never resolved?)
Stage 22: approved (proceed)
Stage 24: approved (proceed)
```

---

## Your Assessment Should Cover:

### 1. Stage Progression Logic
Is the 25-stage progression well-designed for AI-simulated venture evaluation? Are there stages that should be combined, split, or reordered? Note: these are SIMULATED ventures — there is no real product being built.

### 2. Gate Density and Placement
13 of 25 stages have some form of blocking (9 chairman + 4 review). For a single-chairman system, is this appropriate? Are gates placed at the right stages?

### 3. Re-run Root Cause Analysis
Stage 5 re-ran 11 times (every 30s poll cycle while blocked at chairman gate). Stage 7 re-ran 19 times (18 times in 36 seconds in a tight loop). Given the worker code flow above:
- What specific code path allows re-execution of a blocked stage?
- Why does Stage 7 (REVIEW_MODE) execute in a tight loop while Stage 5 (CHAIRMAN_GATE) executes at poll intervals?
- What fix would prevent both patterns?

### 4. Artifact Persistence Gaps
Stages 10-11 have artifacts with BOTH fields NULL (empty placeholder rows). Stages 20-25 have content=NULL. What does this indicate about the persistence architecture?

### 5. Chairman Decision Anomalies
Stages 3, 5, and 16 show "pending/advisory" decisions that were never resolved, yet the venture advanced past them. How is this possible? Is this a feature or a bug?

### 6. Autonomy Model Assessment
Is L0-L4 well-calibrated? Should kill gates ALWAYS require manual review regardless of autonomy level? Should autonomy be per-gate-type rather than per-venture?

### 7. Reality Gate Impossibility
Reality gates at 16→17 and 22→23 require URL-reachable artifacts (mvp_build, production_app). These are AI-simulated ventures — no real URL exists. How should this be handled?

### 8. Operating Mode Boundaries
The worker pauses at mode transitions (EVALUATION→STRATEGY at 5→6, etc.). Is this necessary friction or valuable checkpoint?

### 9. Post-Lifecycle
After Stage 25, options are: continue, pivot (reset to S15), expand (create SD), sunset (30-day wind-down), exit (immediate archive). Is this sufficient?

### 10. Top 3 Issues + Overall Grade (1-10)
What are the three most critical issues, and what's your overall assessment?

---

*Evidence gathered from actual codebase and production database by Claude Code with full repository access.*
