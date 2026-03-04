# Brainstorm: EVA Stage Execution Worker

## Metadata
- **Date**: 2026-03-04
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (7 currently in system)
- **Brainstorm Session ID**: `697e02a4-dde8-4170-81e6-0cc641a18813`

### Downstream Documents (Traceability Chain)

| Document | Key | Path |
|----------|-----|------|
| **This Brainstorm** | Session `697e02a4` | `brainstorm/2026-03-04-eva-stage-execution-worker.md` |
| **Vision** | `VISION-EVA-PIPELINE-REDESIGN-L2-001` | `docs/plans/eva-pipeline-redesign-vision.md` |
| **Architecture Plan** | `ARCH-EVA-PIPELINE-REDESIGN-001` | `docs/plans/eva-pipeline-redesign-architecture.md` |
| **Orchestrator SD** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001` | Links vision_key + plan_key in metadata |
| **Child A** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A` | Identity Phase Resequence (Stages 10-12) |
| **Child B** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B` | Launch Phase Redesign (Stages 23-25) |
| **Child C** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C` | Build Loop Real Data Wiring (Stages 19-22) |
| **Child D** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-D` | Stage Execution Worker |
| **Child E** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E` | Capability Contribution Score |
| **Child F** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-F` | Financial Consistency Contract |
| **Child G** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-G` | Full Stage Documentation Rewrite (0-25) |
| **Child H** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-H` | Stage Renderer UI Updates (Tier 1 Gates) |
| **Child I** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I` | Operations Dashboard and Background Workers |
| **Child J** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-J` | Launch Workflow UI |
| **Child K** | `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-K` | Pipeline-to-GUI Wiring |

All downstream documents reference this brainstorm as the source of truth for decisions.

---

## Problem Statement

The EVA 25-stage venture evaluation pipeline currently requires Claude Code (CLI) to manually invoke each stage. Stage 0 can be triggered from the GUI via the `stage_zero_requests` table, and chairman gates (stages 3, 5, 10, 22, 25) have full GUI renderers with approve/reject/park actions. But stages 1-25 have no automated progression — a human must run E2E scripts or invoke stages one by one. This makes the pipeline unusable for a chairman operating exclusively through the GUI.

## Discovery Summary

### Current Architecture
- **Stage 0**: GUI-triggered via `stage_zero_requests` table (polling every 10s). `stage-zero-queue-processor.js` is a proven polling worker with atomic claims, stale recovery, dedup, timeout budget, graceful shutdown.
- **Stages 1-25**: Manual CLI invocation only. `executeStage()` in `stage-execution-engine.js` handles individual stage execution.
- **Chairman Gates**: Stages 3, 5, 10, 22, 25 have GUI renderers. RPCs: `approve_chairman_decision`, `reject_chairman_decision`, `park_venture_decision`. `waitForDecision()` with Realtime + polling fallback already implemented.
- **Concurrency Safety**: `acquireProcessingLock()` / `releaseProcessingLock()` in `orchestrator-state-machine.js`. Saga coordinator and idempotency checks in `eva-orchestrator.js`.
- **Event Bus**: `eva_orchestration_events` table with Realtime enabled. `persistArtifact()` already emits `stage_analysis_completed` events.

### Performance Baseline (from 3 E2E test runs)
- Per-stage execution: 15-30s (LLM call + DB persist)
- Full pipeline (stages 0-25): ~15 minutes
- Rate limit handling: Gemini adapter has built-in retry logic
- Zero failures across 3 consecutive full-pipeline runs

### Hard Constraints
- Must work with existing Supabase + Node.js stack
- Must pause at chairman gates and wait for GUI approval
- Must handle Gemini rate limits and LLM timeouts gracefully
- Must not crash the LEO stack if the worker has issues

## Analysis

### Arguments For
- **The hard parts are already built** — stage engine, gate approval RPCs, state machine locks, event bus, decision watcher with Realtime+polling
- **Transforms chairman experience** — from stage-by-stage CLI approver to portfolio CEO reviewing complete dossiers at gate checkpoints
- **15-minute pipeline** instead of days/weeks of intermittent CLI sessions
- **Unlocks portfolio-level intelligence** — cross-venture learning, constraint drift detection, SLA enforcement all become live operational signals
- **Direct template exists** — `stage-zero-queue-processor.js` is a proven, production-quality polling worker that can be adapted

### Arguments Against
- **Failure taxonomy is unwritten** — transient vs permanent vs silent LLM failures need classification before the worker can handle them correctly
- **3 ventures is a small sample** — production edge cases (concurrent ventures, rate limit storms, mid-stage crashes) are untested
- **Chairman gate expiry is undefined** — what happens to a venture sitting at a gate for 30 days with no approval?
- **Idempotency audit needed** — while primitives exist (saga coordinator, idempotency keys), they haven't been tested under worker-driven re-execution scenarios

## Architecture: Tradeoff Matrix

| Dimension | Weight | A: Polling | B: Event-Driven | C: Hybrid | D: Edge Fn | E: Integrated | F: Standalone |
|-----------|--------|-----------|-----------------|-----------|-----------|---------------|---------------|
| Complexity | 20% | 9 | 6 | 7 | 3 | 8 | 9 |
| Maintainability | 25% | 8 | 6 | 7 | 4 | 5 | 8 |
| Performance | 20% | 6 | 9 | 9 | 3 | 8 | 6 |
| Migration effort | 15% | 9 | 7 | 8 | 4 | 8 | 9 |
| Future flexibility | 20% | 6 | 8 | 9 | 5 | 4 | 7 |
| **Weighted Score** | | **7.5** | **7.2** | **8.0** | **3.8** | **6.3** | **7.7** |

**Recommendation: Option F (Standalone Worker) built on Option A (Polling), evolving to Option C (Hybrid)**

Critical weakness flag: Option D scores < 3 on Complexity and Performance (timeout limits, Deno runtime mismatch). Option E scores < 5 on Maintainability and Future Flexibility (coupled crash domain, can't scale independently).

## Team Perspectives

### Challenger
- **Blind Spots**: (1) No concurrency model for multi-venture fan-out — need max-concurrent-ventures limit and row-level locking. (2) No failure taxonomy — transient/slow/permanent/silent failures are undifferentiated. (3) Chairman gate state is a contention point — no gate expiry policy exists.
- **Assumptions at Risk**: (1) "Just needs orchestration" assumes idempotency that hasn't been verified. (2) Supabase Realtime is best-effort, not guaranteed delivery. (3) LEO stack integration appears simpler but creates entangled crash domains.
- **Worst Case**: Worker retries without backoff during rate limit window, holds advisory lock, GUI shows stale state, chairman manually triggers CLI path, stage executes twice, venture reaches stage 25 with bifurcated context history.

### Visionary
- **Opportunities**: (1) Chairman becomes portfolio CEO — reviewing complete dossiers at gates instead of unblocking individual stages. (2) Multi-venture concurrency unlocks the portfolio flywheel — optimizer, cross-venture learning, and constraint drift all become live. (3) Feedback loops that were impossible become automatic — assumption tracker, pattern matcher, drift detector all fire continuously.
- **Synergies**: Chairman dashboard (built but underutilized) becomes a live operational display. Saga coordinator + idempotency keys (already coded) provide crash-safe restarts. `lifecycle-sd-bridge.js` can auto-create LEO SDs when ventures pass stage 25 — closing the idea-to-engineering loop.
- **Upside Scenario**: Pipeline completes in 15 minutes of compute + chairman gate response time. At 50+ ventures, cross-venture learning becomes statistically meaningful. DFE thresholds self-calibrate against observed outcomes. The chairman operates with AI-augmented portfolio judgment, not rubber-stamping.

### Pragmatist
- **Feasibility**: 3/10 difficulty (highly feasible). The `stage-zero-queue-processor.js` is a direct template. State machine locks, event bus, and gate watcher are all implemented.
- **Resource Requirements**: 3-4 days, 1 developer, zero new infrastructure. Phase 1 (polling): 3 days. Phase 2 (Realtime layer): 1 day.
- **Constraints**: (1) Poll interval creates 30s latency floor per stage — acceptable for background processing. (2) Stale-lock threshold needs tuning: 5 minutes instead of 30 for stages that take 15-30s. (3) Max concurrent ventures should start at 1, scaling later.
- **Recommended Path**: Copy `stage-zero-queue-processor.js` as template. Replace `executeStageZero` with sequential `executeStage()` loop. Insert gate-pause logic via `waitForDecision()`. Wire `acquireProcessingLock()` / `releaseProcessingLock()`. Add to `leo-stack.sh`/`.ps1` as third managed process.

### Synthesis
- **Consensus Points**: Option F (Standalone Polling Worker) is correct. Edge Functions are wrong. Phased approach (polling then Realtime). Infrastructure largely exists.
- **Tension Points**: Idempotency — exists but unaudited. Silent failures — real risk, opportunity for continuous monitoring. Scale ambition vs conservative first step.
- **Composite Risk**: Low-Medium

## Resolved Questions (Chairman Decisions)

1. **Gate expiry policy**: Auto-park after 30 days. Venture moves to 'parked' status, freeing the pipeline. Chairman can resume anytime from GUI.
2. **Venture prioritization**: FIFO (first submitted, first processed). Simple, predictable, fair. Priority can be layered later if needed.
3. **Failure retry policy**: 3 retries with exponential backoff (30s, 60s, 120s). After 3 failures, mark venture as `error` status and surface in chairman dashboard.

## Critical Finding: Stages 17-25 Are Simulations, Not Real Execution

### The Problem

Reviewing the actual artifacts from our 3 E2E test runs reveals a **fundamental disconnect** in stages 17-25:

**Stage 18 (Sprint Planning)** generates plausible SD draft payloads:
- "AI Provider Integration Sandbox" (5 pts, critical)
- "Content Engine Business Logic Scaffold" (7 pts, high)
- "Internal Content Testing Interface" (8 pts, medium)

But **Stage 19 (Development Execution)** then has the LLM *imagine* the result of executing those tasks — with 0 tasks completed, 1 blocked, and a "blocked" sprint status. **No actual code was written.** The LLM is role-playing as a development team.

**Stage 20 (QA)** reports 0% pass rate and 0% coverage — because there is no actual code to test.

**Stage 21 (Build Review)** rejects the build — correctly, since nothing was built.

**Stage 22 (Go-Live)** cancels the release — correctly, since nothing passed QA.

**Stage 23 (Launch)** issues a kill decision — correctly, since nothing was released.

Yet **Stage 25 (Portfolio Review)** somehow recommends "continue" with 85% confidence and health score 7.8 — ignoring that the entire build phase was a simulation that failed at every step.

### The Logical Sequence Problem

The pipeline was designed with this progression:
```
Stages 1-16:  EVALUATE the venture (analysis, market, financial)
Stage 18:     PLAN the build (sprint planning, SD drafts)
Stages 19-21: TRACK the build (dev, QA, integration)
Stage 22:     RELEASE the build (go-live gate)
Stages 23-25: OPERATE the venture (launch, measure, review)
```

But stages 19-25 are **simulating future states** — the LLM imagines what development, QA, launch, and growth metrics would look like. This creates several problems:

1. **Stage 18 generates SD drafts that never become real SDs** — the EVA→LEO bridge at Stage 18 is dead code in the current pipeline
2. **Stages 19-21 are fiction** — the LLM role-plays as developers/QA team but no actual software is built
3. **Stage 22-23 decisions are based on simulated data** — cancelling a release that was never real
4. **Stage 24 AARRR metrics are fabricated** — no product exists to measure
5. **Stage 25 contradicts its own upstream stages** — recommends "continue" despite every prior stage failing

### Documentation Confirms: Original Design Was Option B

Reviewing `docs/eva/v1-build-scope-definition.md` and `docs/guides/workflow/25-stage-venture-lifecycle-overview.md` confirms the pipeline was **designed** for stages 17-22 to create real LEO SDs and wait for completion:

> "Stage transition from N to N+1 triggers SD creation for stage N+1. SD follows full LEO Protocol: LEAD → PLAN → EXEC → handoffs → completion. Stage cannot advance until its SD reaches `completed` status."

The SD generation rules define an explicit dependency chain:
```
SD-ENVCONFIG → SD-MVP → SD-INTEGRATION → SD-SECURITY → SD-QA → SD-DEPLOY
```

**The EVA→LEO bridge was designed but never wired up.** The analysis functions (`analyzeStage17()` through `analyzeStage22()`) perform LLM-only analysis instead of triggering real SD creation and waiting. This means:
- The ~15 minute full-pipeline run is a **bug**, not a feature — stages 17-22 should take weeks/months
- The build loop spec explicitly requires real artifacts: `system_prompt`, `cicd_config`, `security_audit`, `test_plan`, `uat_report`, `deployment_runbook`
- Phase 7: THE ORBIT (post-Stage 25) assumes a **live product** exists — impossible without the bridge

### The Core Question: What Should Stages 17-25 Actually Do?

Two fundamentally different architectures emerge:

**Option A: Keep stages 17-25 as pure analysis (current behavior, just better)**
- Stages 17-25 remain LLM-generated projections/simulations
- Rename them honestly: "Build Readiness Assessment", "Sprint Plan Projection", "QA Risk Assessment", etc.
- Stage 18 still generates SD draft payloads as a deliverable, but the chairman explicitly decides when to promote them to LEO
- The pipeline is an **evaluation tool**, not a build orchestrator
- Stage 25 = "Is this venture worth building?" not "How is the live venture performing?"

**Option B: Make stages 17-25 real by inserting a LEO bridge**
- Stage 16 (financial projections) is the natural stopping point for evaluation
- After Stage 16 chairman gate → auto-create SDs from Stage 18's sprint plan
- LEO executes the SDs (actual code, actual tests, actual deployment)
- Stages 19-25 resume AFTER LEO completion, now with real data: actual test coverage, real QA results, live metrics
- This turns the pipeline into a **closed-loop system** but requires the stage execution worker to pause for weeks/months while LEO builds

**Option C: Split the pipeline into evaluation + operation phases**
- **Phase A (Stages 0-16)**: Pure evaluation — runs in ~15 minutes, produces a complete venture dossier
- **Phase B (Stages 17-25)**: Operations — only runs AFTER the venture is actually built via LEO
- Phase A is what the stage execution worker automates
- Phase B is triggered post-LEO-completion, with real data feeding into stages 19-25
- This cleanly separates "should we build this?" from "how is the build going?"

### Evidence from 3 Test Runs

| Stage | What It Claims | What Actually Happened |
|-------|---------------|----------------------|
| 18 | Sprint plan with 3 SDs | SD payloads generated but never promoted to LEO |
| 19 | Dev tasks: 0 completed, 1 blocked | LLM imagined a blocked sprint — no code exists |
| 20 | QA: 0% pass rate, 0% coverage | No code to test — numbers are fiction |
| 21 | Build review: reject | Correctly rejected nothing |
| 22 | Release: cancel | Correctly cancelled nothing |
| 23 | Launch: kill decision | Correctly killed a non-existent launch |
| 24 | AARRR metrics tracked | Metrics for a product that doesn't exist |
| 25 | "Continue" with 85% confidence | Contradicts every upstream stage that failed |

## Deep Evaluation: Stages 0-16 (Venture Evaluation Pipeline)

Per-stage code and artifact review across 3 E2E test runs (NicheBrief AI, NicheSignal AI, CreatorFlow AI).

### Per-Stage Assessment

| Stage | Name | Quality | Recommendation |
|-------|------|---------|----------------|
| 0 | Synthesis (DFE) | **STRONG** | Keep as-is. 12-component parallel analysis, weighted composite scoring. |
| 1 | Hydration | ADEQUATE | Needs improvement — more deterministic extraction from Stage 0 synthesis. |
| 2 | Multi-Persona | **STRONG** | Keep as-is. 5-persona analysis well-structured. |
| 3 | Hybrid Scoring (Kill Gate) | ADEQUATE | Needs improvement — anchoring bias from Stage 0 DFE score influences kill threshold. |
| 4 | Competitive Landscape | **STRONG** | Keep as-is. Comprehensive moat and SWOT analysis. |
| 5 | Financial Model | **PROBLEMATIC** | Needs rethinking. ROI bands inversion bug at line 173. Inconsistent with Stage 16. |
| 6 | Risk Matrix | ADEQUATE | Needs improvement — generates risk identification but not specific mitigations. |
| 7 | Pricing Strategy | ADEQUATE | Needs improvement — should address kill signals from Stage 5 if present. |
| 8 | BMC Generation | **STRONG** | Keep as-is. Clean Business Model Canvas output. |
| 9 | Exit Strategy | ADEQUATE | Needs improvement — Reality Gate data flow incomplete. |
| 10 | Naming / Brand (Chairman Gate) | ADEQUATE | Acceptable quality. |
| 11 | GTM Strategy | ADEQUATE | Needs improvement — CAC reconciliation needed across stages. |
| 12 | Sales Logic | ADEQUATE | Needs improvement — funnel math needs validation against upstream financial data. |
| 13 | Product Roadmap | ADEQUATE | Needs improvement — generates past dates (2023-2024 instead of 2026). |
| 14 | Technical Architecture | **STRONG** | Should constrain recommendations to budget/runway from Stage 5. |
| 15 | Risk Register | ADEQUATE | Needs rethinking — redundant with Stage 6. Should merge or clearly differentiate. |
| 16 | Financial Projections | ADEQUATE | Needs rethinking — $150K capital vs Stage 5's $400K. Broken consistency chain. |

### Cross-Cutting Issues (Stages 0-16)

1. **Financial consistency is broken across stages**
   - Stage 5 says $400K capital needed; Stage 16 says $150K
   - CAC varies wildly: $2,500 in one stage, $363 in another
   - No financial data contract enforces consistency between stages 5, 7, 11, 12, 16
   - **Impact**: Chairman sees contradictory financial data at different gates

2. **Kill decisions are ignored by downstream stages**
   - Stages 3 and 5 can issue kill/reject decisions
   - But stages 6-16 continue executing as if the venture was approved
   - The stage execution engine doesn't check upstream gate decisions before proceeding
   - **Impact**: Wasted LLM tokens analyzing a venture that was already rejected

3. **Dates generated in the past**
   - Multiple stages (11, 13) generate dates in 2023-2024 instead of 2026
   - LLM uses training data dates rather than current date
   - **Fix**: Inject current date into all stage prompts

4. **Stage 5 code bug: ROI bands inversion** (`stage-05-financial-model.js` line 173)
   - Code: `optimistic: roi3y * 1.3`
   - When ROI is negative (e.g., -50%), this makes the "optimistic" case WORSE (-65%)
   - Should use `Math.abs()` or conditional logic for negative ROI scenarios

5. **Stage 6 and Stage 15 are redundant risk registers**
   - Stage 6 (Risk Matrix) and Stage 15 (Risk Register) both identify venture risks
   - Stage 15 doesn't reference or build on Stage 6's output
   - **Fix**: Stage 15 should explicitly consume Stage 6 and add new risks discovered in stages 7-14

6. **Four Buckets framework underutilized**
   - Stage 0 generates Four Buckets classification (desirability, feasibility, viability, adaptability)
   - Few downstream stages reference or validate against these buckets
   - **Impact**: Strategic framing from Stage 0 doesn't propagate

## Deep Evaluation: Stages 17-25 (Build & Operations Pipeline)

Per-stage code and artifact review, including analysis of existing infrastructure that was designed but not fully wired.

### Per-Stage Assessment

| Stage | Name | Gap Severity | Key Finding |
|-------|------|-------------|-------------|
| 17 | Build Readiness | MEDIUM | Assesses readiness but doesn't block pipeline if venture isn't ready. |
| 18 | Sprint Planning | **LOW** | `lifecycle-sd-bridge.js` EXISTS and creates real SDs. Closest to working. |
| 19 | Build Execution | HIGH | LLM imagines a blocked sprint. No real code exists. Consistently fabricated. |
| 20 | Quality Assurance | **CRITICAL** | Reports 0% pass rate and 0% coverage. Fabricated test results for nonexistent code. |
| 21 | Build Review | HIGH | Correctly rejects nothing — but the "nothing" is still fiction. |
| 22 | Release Readiness (Chairman Gate) | MEDIUM | `evaluatePromotionGate()` computes correctly but `blockProgression: true` is NOT enforced. |
| 23 | Launch Execution | HIGH | `evaluateKillGate()` computes kill decision but pipeline continues regardless. |
| 24 | Metrics & Learning | **CRITICAL** | Reports "100% criteria met, launch SUCCESS" despite ALL upstream stages failing. Most dangerous fabrication. |
| 25 | Venture Review (Chairman Gate) | **CRITICAL** | Recommends "continue" at 85% confidence, contradicting every upstream failure. |

### Existing Infrastructure That Was Designed But Not Wired

The deep evaluation revealed that significant infrastructure for real build tracking **already exists** in the codebase:

1. **`lifecycle-sd-bridge.js`** — Creates real LEO SDs from Stage 18's sprint items via `convertSprintToSDs()`
   - Called from `eva-orchestrator.js` line 572 after Stage 18 completes
   - Generates proper SD payloads with types, priorities, and dependency chains
   - **Status**: Code exists and runs, but pipeline doesn't wait for SDs to complete before moving to Stage 19

2. **`sd-completed.js`** — Event handler that tracks real SD completion
   - Writes real SD completion data into `venture_stage_work.advisory_data`
   - Designed to feed real metrics (test coverage, build status) back to stages 19-22
   - **Status**: Handler exists but analysis steps (stages 19-22) ignore `venture_stage_work` data entirely

3. **Gate decision functions** — Pure functions that compute correct decisions
   - `evaluatePromotionGate()` at Stage 22: Correctly evaluates build/QA/integration results
   - `evaluateKillGate()` at Stage 23: Correctly evaluates launch readiness
   - **Status**: Functions execute and return `blockProgression: true`, but the orchestrator doesn't honor the block

4. **`venture_stage_work` table** — Designed to store real build progress
   - Schema supports linking SDs to venture stages
   - `advisory_data` JSONB column can store real test results, coverage, build status
   - **Status**: Table exists, `sd-completed.js` writes to it, but no analysis step reads from it

### The Consistency Collapse: Stage 23→24 Boundary

The most dangerous finding is at the Stage 23→24 boundary:

- **Stage 23** correctly kills the launch (based on all upstream failures)
- **Stage 24** receives only success criteria definitions, NOT the kill decision
- Stage 24's LLM then fabricates "100% criteria met, launch SUCCESS"
- **Stage 25** inherits Stage 24's fabricated success and recommends "continue"

This happens because Stage 24's prompt template receives the venture's success criteria (what to measure) but not the Stage 23 outcome (launch was killed). The LLM fills in the gap with an optimistic fabrication.

### Summary: What Exists vs What's Missing

| Component | Exists? | Works? | What's Missing |
|-----------|---------|--------|----------------|
| SD creation from sprint plan | YES (`lifecycle-sd-bridge.js`) | Partially | Pipeline doesn't wait for SDs to complete |
| SD completion tracking | YES (`sd-completed.js`) | YES | Analysis steps don't read the data |
| Gate decision computation | YES (pure functions) | YES | Gate decisions aren't enforced (pipeline continues) |
| Real metrics storage | YES (`venture_stage_work`) | YES | No analysis step consumes the real data |
| Prompt templates for 17-25 | YES | NO | Templates ask LLM to imagine instead of using real data |
| Stage ordering enforcement | YES (state machine) | NO | Doesn't check if previous gate blocked progression |

**Core problem in one sentence**: The pipeline has the infrastructure to create real SDs and track real work, but the analysis steps bypass all of it and ask an LLM to imagine what would have happened.

## Chairman Decisions — Pipeline Architecture

### Decision: Four Operating Modes (Modified Option C)

The pipeline operates in **four distinct modes**. Hard separation at Stage 17/18 boundary.

```
Mode 1: EVALUATION (Stages 0-17)   — Self-contained chairman evaluation tool
Mode 2: BUILD (Stages 18-22)       — Real SD execution, chairman-triggered
Mode 3: LAUNCH (Stages 23-25)      — Marketing prep, readiness gate, go-live
Mode 4: OPERATIONS (Post-pipeline) — Continuous services, no stage numbers
```

**Key principle**: Stages 0-17 are a self-contained evaluation tool. The chairman decides when/whether to promote a venture to BUILD. SD creation at Stage 18 is a **deliberate chairman action**, not an automatic transition.

### Decision: Build Loop (Stages 18-22) Uses Real Data

Stages 19-22 observe **real SD execution data** instead of LLM simulation:
- Stage 18 creates orchestrator + child SDs via `lifecycle-sd-bridge.js`
- Stages 19-21 read from `venture_stage_work` table (real build progress, test coverage, QA results)
- Stage 22 is the chairman release gate — based on actual build artifacts
- **Worker advancement**: Chairman-triggered (Option C). Automate later once patterns are proven.

### Decision: 5 Chairman Touch Points

| Gate | Stage | Purpose | Type |
|------|-------|---------|------|
| 1 | Stage 3 | Kill Gate — "Is this worth pursuing?" | Auto with DFE escalation |
| 2 | Stage 5 | Kill Gate — "Are the financials viable?" | Auto with DFE escalation |
| 3 | Stage 17/18 | Promotion Gate — "Promote to BUILD?" | **Deliberate chairman action** |
| 4 | Stage 22 | Release Gate — "Release the build?" | Chairman decision |
| 5 | Stage 24 | Launch Gate — "Approve launch?" | Chairman decision |

### Decision: Full Automation Goal

> "My goal is full automation with minimal touch points for the chairman, where we need human in the loop."

The worker auto-advances between all non-gate stages. The chairman only intervenes at the 5 gates above. Everything else is autonomous.

---

## Identity Phase Resequence (Stages 10-12)

### Problem Discovered

The current pipeline has a **dependency chain gap** in the Identity Phase:

1. **No customer persona** — Only a single `targetMarket` string in Stage 1. No detailed customer personas, demographics, pain points, or behavioral patterns.
2. **Brand genome before customer** — Stage 10 defines brand personality (archetype, values, tone, audience, differentiators) without first knowing who the customer is.
3. **Mission/vision optional** — `narrativeExtension` (vision, mission, brandVoice) is optional in Stage 10, but these should be foundational.
4. **No visual branding** — No stage handles logo, colors, typography, or design system.
5. **GTM disconnected from identity** — Stage 11 (GTM) doesn't reference the customer personas that should drive channel strategy.

### Correct Dependency Chain

```
Customer Persona → Mission/Vision → Brand Genome → Naming → Visual Branding → GTM → Sales
```

Each element **requires** the previous one to be meaningful. You can't define brand personality without knowing the customer. You can't create a visual identity without the brand genome.

### Resequenced Stages

| Stage | New Name | Content | Chairman Gate? |
|-------|----------|---------|----------------|
| **10** | Customer & Brand Foundation | Detailed customer personas, mission statement, vision statement, brand genome (informed by personas) | No |
| **11** | Naming & Visual Identity | Name candidates (ranked), visual branding (logo direction, color palette, typography, design system), chairman approval gate | **Yes** |
| **12** | Go-to-Market & Sales | GTM strategy (tiers, channels, campaigns) + sales model (funnel, journey, deal stages), reality gate | No (auto reality gate) |

**What moved:**
- Customer personas: **NEW** (didn't exist) → Stage 10
- Mission/Vision: Stage 10 optional → Stage 10 **required**
- Brand Genome: Stage 10 (stays, but now informed by customer personas)
- Naming: Stage 10 → Stage 11
- Visual Branding: **NEW** (didn't exist) → Stage 11
- GTM Strategy: Stage 11 → Stage 12
- Sales Logic: Stage 12 (stays, combined with GTM)

---

## Launch Phase Redesign (Stages 23-25)

### Problem

Original stages 23-25 were:
- **23**: Launch Execution (go/no-go kill gate, publish pipeline)
- **24**: Metrics & Learning (AARRR framework, growth experiments)
- **25**: Venture Review (drift detection, health scoring, chairman governance gate)

Stages 24-25 content (AARRR metrics, drift detection, portfolio review) assumes a **live product** — these belong in continuous operations, not a one-time stage.

### Redesigned Stages

| Stage | New Name | Content | Gate |
|-------|----------|---------|------|
| **23** | Marketing Preparation | Create marketing material SDs (like Stage 18 pattern), wait for completion | Auto (materials complete) |
| **24** | Launch Readiness | Go/No-Go checklist, final chairman approval to launch | **Chairman approval** |
| **25** | Launch Execution | Go-live, distribution, activate channels, hand off to operations | Terminal (pipeline ends) |

**What moved:**
- AARRR metrics → Continuous operational service
- Venture review/drift detection → Continuous operational service
- Health scoring → Continuous operational service
- Growth experiments → Continuous operational service
- Enhancement cycle → Universal Inbox → SD creation loop

### Pipeline Ends at Stage 25

The venture pipeline is an **evaluation and build tool**. Once a venture launches (Stage 25), it hands off to continuous operations:
- **Financial monitoring** — Stripe integration, unit economics tracking
- **Customer service** — One shared, venture-aware CS agent across all ventures
- **Customer feedback** — In-app widget + CS agent classifier + multi-source → Universal Inbox
- **Metrics & learning** — AARRR framework as continuous dashboard, not a one-time stage
- **Enhancement cycles** — Feedback → Inbox → SD creation → LEO protocol

---

## Documentation Decision

**Full rewrite of ALL stage documents (0-25)** — not incremental patches. The current docs describe the original design; the brainstorm decisions change the architecture significantly enough that partial updates would create contradictions.

---

## Marketing & Distribution

### Decision: Build First, Market After

The application is built on its own (Stages 18-22). Marketing material is created **after** the build is complete, as a separate stage (Stage 23). This prevents marketing commitments before the product is proven.

### Decision: Material vs Distribution

| Phase | Stage | What Happens |
|-------|-------|-------------|
| Material Creation | Stage 23 | Create marketing SDs (landing pages, copy, assets, video) — like Stage 18 pattern |
| Distribution | Stage 25 | Activate channels, publish content, execute launch plan |
| Readiness Gate | Stage 24 | Chairman reviews materials + product readiness before go-live |

---

## Post-Pipeline Operations

### Continuous Services (No Stage Numbers)

These replace the old Stages 24-25 content and operate continuously after launch:

| Service | Source | Behavior |
|---------|--------|----------|
| **Financial Performance** | Stripe API, payment events | Real-time revenue, CAC/LTV, unit economics. No stage needed — just a live dashboard. |
| **Customer Service Agent** | Universal Inbox, in-app widget | One shared agent, venture-context-aware. Routes issues to correct venture. |
| **Customer Feedback** | In-app widget, CS agent, email, social | All channels → Universal Inbox → auto-classify → route to SD or operations |
| **Metrics & Analytics** | Product analytics, AARRR framework | Continuous dashboards, not one-time stage analysis |
| **Enhancement Cycles** | Feedback + metrics → pattern detection | Auto-create SDs when patterns emerge (feature requests, bugs, improvements) |
| **Health Monitoring** | All services above | Drift detection, health scoring, alerting — continuous, not periodic |

---

## Resolved Open Questions

All 5 original open questions are now resolved:

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Which architecture (A/B/C)? | **Modified Option C**: Four operating modes with hard separation at 17/18 |
| 2 | Where is the Phase A/B boundary? | **Stage 17/18 boundary** — deliberate chairman promotion action |
| 3 | Rewrite stages 17-25? | **Yes**: 18-22 use real data. 23-25 redesigned as Marketing/Readiness/Launch |
| 4 | Auto-trigger SD creation? | **Chairman-triggered at Stage 17/18 boundary** (automate later) |
| 5 | What does Stage 25 mean? | **Launch Execution** — go-live + handoff to operations. Pipeline ends here. |

---

## Comprehensive Gap Analysis — Detailed Resolutions

### Methodology

Cross-referenced three sources:
1. **EHG Strategic Doctrine** — Vision ("One human orchestrating AI agents"), capability doctrine ("every venture increases global capability set"), 5-layer moat (Trust, Governance, Orchestration, Data, Capability), Q1 2026 OKRs
2. **Pipeline Architecture** — All 25 stages as redesigned in this brainstorm
3. **GUI Inventory** — 97 pages, 200+ components, 11 route modules in the EHG React app

---

### Gap 1: Capability Lattice Not Represented in Pipeline

**Severity**: HIGH | **Effort**: Low | **EHG Doctrine Alignment**: Critical

**The Problem**: EHG's core strategic doctrine states: "Every venture must increase the global capability set. Capabilities are first-class assets, independent of ventures." The venture admission question is: "Does this strengthen the EHG nervous system?"

Yet NO stage in the pipeline evaluates whether a venture produces reusable capabilities. The Four Buckets framework (desirability, feasibility, viability, adaptability) from Stage 0 assesses the venture itself, not its capability contribution to the EHG ecosystem.

**Resolution**: Enrich **Stage 0 synthesis** with a new component: **Capability Contribution Assessment**

This becomes synthesis component 13 (alongside the existing 12 components like market-sizing, competitive-landscape, tech-trajectory, etc.), adding a new dimension to the DFE weighted composite:

```
Capability Contribution Assessment (weight: 0.10 in DFE composite)
├── New Capability Node Score (0-5): Does this create a genuinely new capability?
├── Reuse Potential Score (0-5): Likely reused by 2+ other ventures?
├── Graph Centrality Gain (0-5): Increases importance of existing core capabilities?
├── Maturity Lift (0-5): Hardens reliability/speed/quality of existing capability?
└── Extraction Clarity (0-5): Can be abstracted cleanly (API, service, playbook)?
```

This directly mirrors the Plane 1 (Capability Graph Impact) from the `/brainstorm` Four-Plane Evaluation Matrix, but automated at Stage 0 rather than manual in brainstorming.

**Stage 3 Kill Gate Enhancement**: The kill gate at Stage 3 already evaluates viability. Add a **hard rule**: If Capability Contribution Score < 10/25, the venture must justify itself as a time-boxed exception or face automatic kill. This enforces the doctrine's admission question programmatically.

**Downstream Propagation**: The capability scores propagate through the pipeline:
- Stage 14 (Technical Architecture) consumes capability scores to recommend architecture that maximizes reuse
- Stage 17 (Build Readiness) validates that the proposed build plan includes capability extraction
- Stage 25 (Launch Execution) includes capability handoff as part of operations transfer

**GUI Integration**:
- `VentureEvaluationMatrix/` — Add capability contribution as a scatter plot axis (currently shows health bars only)
- `Stage0Renderer` — Display capability scores alongside DFE composite
- `KillGateRenderer` (Stage 3) — Show capability hard-rule check result
- New: Capability Registry page in Chairman V3 — aggregate view across all ventures showing which capabilities each venture contributes, reuse graph, maturity levels

**Files to create/modify:**
- `lib/eva/stage-zero/synthesis/capability-contribution.js` — NEW: Component 13
- `lib/eva/stage-zero/synthesis/weighted-composite.js` — Add 0.10 weight for capability
- `lib/eva/stage-templates/stage-03.js` — Add capability hard-rule to kill gate
- `lib/eva/stage-templates/stage-14.js` — Consume capability scores for architecture recs
- `ehg/src/components/chairman-v3/gates/Stage0Renderer.tsx` — Display capability scores
- `ehg/src/components/chairman-v3/gates/KillGateRenderer.tsx` — Show capability check
- `ehg/src/pages/CapabilityRegistryPage.tsx` — NEW: Cross-venture capability view

---

### Gap 2: Stage Renderers Cover Only 4 of 25 Stages

**Severity**: HIGH | **Effort**: Medium-High | **Affects**: Chairman decision quality at every gate

**The Problem**: Only stages 0, 10, 22, 25 have dedicated renderers in `GateRendererRouter.tsx`. Stages 3 and 5 share a generic `KillGateRenderer`. All other stages (21 of 25+) fall through to `GenericGateRenderer`, which shows raw context without stage-specific formatting.

When the chairman reaches a gate decision, they see unstructured data instead of the curated, stage-appropriate presentation that aids decision-making.

**Resolution**: Implement stage renderers in priority tiers based on which stages have chairman gates and which produce the most decision-critical data.

**Tier 1 — Chairman Gate Stages (must have dedicated renderers):**

| Stage | Renderer | Key Display Elements |
|-------|----------|---------------------|
| **3** | `Stage3KillGateRenderer` | Kill/Continue recommendation, DFE composite score, capability contribution check, Four Buckets breakdown, risk flags, venture comparison to portfolio |
| **5** | `Stage5KillGateRenderer` | Financial viability verdict, ROI bands (bull/base/bear), unit economics summary, capital requirement, comparison to Stage 3 score trajectory |
| **10** | `Stage10Renderer` (redesign) | Customer persona cards (demographics, pain points, behaviors), mission statement, vision statement, brand genome radar chart, ICP scoring |
| **11** | `Stage11Renderer` (NEW) | Name candidates ranked with rationale, color palette swatches, typography samples, logo direction mood board, design system preview, chairman approve/reject per candidate |
| **17/18** | `Stage17PromotionRenderer` (NEW) | Build readiness checklist, estimated SD count, timeline, infrastructure requirements, "Promote to BUILD?" action with full context |
| **22** | `Stage22Renderer` (redesign) | Build completion status (real SD progress), test coverage %, QA results, security audit summary, release/hold/cancel actions |
| **24** | `Stage24Renderer` (NEW) | Launch readiness checklist (product ready, marketing materials complete, distribution channels configured), go/no-go verdict, chairman approve/reject |

**Tier 2 — High-Value Information Stages (enhance GenericGateRenderer):**

| Stage | Enhancement |
|-------|-------------|
| **1** | Idea brief card with key fields highlighted |
| **4** | Competitive landscape visualization (moat radar, SWOT grid) |
| **8** | Business Model Canvas visual layout |
| **12** | GTM channel heatmap, sales funnel diagram |
| **14** | Architecture diagram, tech stack visual, cost estimate |
| **16** | Financial projection charts (revenue, costs, runway) |

**Tier 3 — Standard Stages (GenericGateRenderer is acceptable):**
Stages 2, 6, 7, 9, 13, 15, 19, 20, 21, 23, 25 — these don't have chairman gates and the generic renderer provides adequate context.

**Implementation Approach**:
- All renderers share a `StageRendererShell` wrapper for consistent layout (header, score badge, actions, context panel)
- Each renderer receives `stageData`, `ventureContext`, and `upstreamDecisions` props
- Renderers are lazy-loaded to keep bundle size manageable
- `GateRendererRouter.tsx` updated with new stage→renderer mapping

**Files to create/modify:**
- `ehg/src/components/chairman-v3/gates/Stage3KillGateRenderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/Stage5KillGateRenderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/Stage10Renderer.tsx` — REDESIGN
- `ehg/src/components/chairman-v3/gates/Stage11Renderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/Stage17PromotionRenderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/Stage22Renderer.tsx` — REDESIGN
- `ehg/src/components/chairman-v3/gates/Stage24Renderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/GateRendererRouter.tsx` — UPDATE mapping

---

### Gap 3: Customer Intelligence Exists But Disconnected from Pipeline

**Severity**: MEDIUM | **Effort**: Low | **GUI Components**: Already built

**The Problem**: `CustomerIntelligencePage.tsx` has 4 fully implemented tabs:
1. `CustomerPersonasManager.tsx` — Persona creation & management
2. `ICPScoringDashboard.tsx` — ICP scoring & ranking
3. `CustomerJourneyVisualizer.tsx` — Customer journey mapping
4. `WillingnessToPayAnalysis.tsx` — Pricing/WTP analysis

No pipeline stage feeds these. Stage 1 has only a single `targetMarket` string.

**Resolution**: Wire the redesigned **Stage 10** (Customer & Brand Foundation) output directly to the Customer Intelligence components.

**Stage 10 Output Schema (customer section):**

```json
{
  "customer_personas": [
    {
      "name": "string (persona name, e.g., 'Budget-Conscious Freelancer')",
      "demographics": {
        "age_range": "25-34",
        "income_bracket": "string",
        "location_type": "urban|suburban|rural",
        "education": "string",
        "occupation": "string"
      },
      "psychographics": {
        "values": ["string"],
        "pain_points": ["string"],
        "goals": ["string"],
        "frustrations": ["string"],
        "motivations": ["string"]
      },
      "behaviors": {
        "digital_proficiency": "low|medium|high",
        "purchase_channels": ["string"],
        "decision_factors": ["string"],
        "content_consumption": ["string"]
      },
      "icp_score": 0-100,
      "revenue_potential": "low|medium|high|very_high",
      "acquisition_difficulty": "easy|moderate|hard"
    }
  ],
  "customer_journey": {
    "awareness": { "channels": ["string"], "content_types": ["string"], "key_messages": ["string"] },
    "consideration": { "evaluation_criteria": ["string"], "competitors_compared": ["string"], "objections": ["string"] },
    "decision": { "triggers": ["string"], "deal_breakers": ["string"], "social_proof_needed": "string" },
    "onboarding": { "first_value_moment": "string", "steps": ["string"], "time_to_value": "string" },
    "retention": { "engagement_drivers": ["string"], "churn_risks": ["string"], "expansion_opportunities": ["string"] }
  },
  "willingness_to_pay": {
    "price_sensitivity": "low|medium|high",
    "anchor_price": "number",
    "acceptable_range": { "min": "number", "max": "number" },
    "value_perception_drivers": ["string"]
  }
}
```

**Data Flow**: Stage 10 output → `venture_artifacts` table → Customer Intelligence page queries artifacts for venture → populates all 4 tabs.

**No new GUI components needed** — the existing `CustomerPersonasManager`, `ICPScoringDashboard`, `CustomerJourneyVisualizer`, and `WillingnessToPayAnalysis` components just need a data source. Add a Supabase query in each component to fetch from `venture_artifacts WHERE stage_number = 10`.

**Files to modify:**
- `lib/eva/stage-templates/stage-10.js` — REDESIGN: Add customer persona output schema
- `lib/eva/stage-templates/analysis-steps/stage-10-*.js` — REDESIGN: Generate customer personas
- `ehg/src/pages/CustomerIntelligencePage.tsx` — ADD: Query venture_artifacts for Stage 10 data
- `ehg/src/components/customer-intelligence/CustomerPersonasManager.tsx` — ADD: Accept pipeline data as prop/initial data

---

### Gap 4: Visual Branding Has Brand Genome Wizard But No Pipeline Source

**Severity**: MEDIUM | **Effort**: Medium | **GUI Components**: Already built

**The Problem**: The Brand Genome Wizard (`BrandGenomeWizard.tsx`) has 5 implemented steps:
1. `BrandClaimsStep.tsx` — Positioning & claims
2. `ICPStep.tsx` — Ideal Customer Profile
3. `PositioningValuesStep.tsx` — Core values
4. `VoiceToneStep.tsx` — Brand voice & tone
5. `VisualIdentityStep.tsx` — Logo, colors, typography

Plus `BrandVariantForm.tsx` with chairman approval workflow. But NO pipeline stage generates visual identity data (logo direction, color palette, typography, design system).

**Resolution**: The redesigned **Stage 11** (Naming & Visual Identity) generates visual branding data compatible with the existing Wizard components.

**Stage 11 Output Schema (visual branding section):**

```json
{
  "naming": {
    "candidates": [
      {
        "name": "string",
        "tagline": "string",
        "domain_availability": "available|taken|premium",
        "trademark_risk": "low|medium|high",
        "cultural_considerations": "string",
        "rationale": "string",
        "score": 0-100
      }
    ],
    "recommended": "string (top candidate name)",
    "naming_strategy": "descriptive|invented|metaphorical|acronym|founder"
  },
  "visual_identity": {
    "color_palette": {
      "primary": { "hex": "#string", "name": "string", "emotion": "string" },
      "secondary": { "hex": "#string", "name": "string", "emotion": "string" },
      "accent": { "hex": "#string", "name": "string", "emotion": "string" },
      "neutral": { "hex": "#string", "name": "string" },
      "rationale": "string (why these colors for this brand genome)"
    },
    "typography": {
      "heading_font": { "family": "string", "weight": "string", "style": "string" },
      "body_font": { "family": "string", "weight": "string", "style": "string" },
      "rationale": "string"
    },
    "logo_direction": {
      "style": "wordmark|lettermark|icon|combination|emblem",
      "mood": "string (e.g., 'minimal, geometric, trustworthy')",
      "constraints": ["string (e.g., 'must work at 16px favicon size')"],
      "inspiration_references": ["string (e.g., 'Stripe-style clean wordmark')"]
    },
    "design_system": {
      "border_radius": "sharp|rounded|pill",
      "spacing_scale": "compact|comfortable|spacious",
      "shadow_style": "flat|subtle|elevated",
      "animation_preference": "none|minimal|expressive"
    }
  },
  "brand_variants": [
    {
      "variant_name": "string (e.g., 'Professional', 'Playful', 'Bold')",
      "color_override": {},
      "typography_override": {},
      "rationale": "string"
    }
  ]
}
```

**Data Flow**: Stage 11 output → `venture_artifacts` → Brand Genome Wizard pre-populates from pipeline data → Chairman reviews via `Stage11Renderer` and `BrandVariantForm` approval workflow.

**The wizard becomes a review/edit tool** — the pipeline generates the first draft, the chairman refines it.

**Files to create/modify:**
- `lib/eva/stage-templates/stage-11.js` — NEW: Naming & Visual Identity template
- `lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js` — NEW: LLM generates visual branding
- `ehg/src/components/chairman-v3/gates/Stage11Renderer.tsx` — NEW: Color swatches, typography preview, name candidates
- `ehg/src/components/brand-genome/BrandGenomeWizard.tsx` — MODIFY: Accept pipeline data as initial values
- `ehg/src/components/brand-genome/steps/VisualIdentityStep.tsx` — MODIFY: Pre-populate from Stage 11

---

### Gap 5: GTM UI Exists But Needs Pipeline Integration

**Severity**: MEDIUM | **Effort**: Low | **GUI Components**: Already built

**The Problem**: Comprehensive GTM UI already exists:
- `GTMDashboardPage.tsx` — Strategy & planning
- `GTMExecutionPage.tsx` — Execution tracking
- `GTMTimingDashboard` — Timing optimization
- `CampaignOrchestration.tsx` — Campaign planning
- `MarketReadinessAssessment.tsx` — Market fit assessment

But the current Stage 11 (GTM) output doesn't feed these components.

**Resolution**: The redesigned **Stage 12** (Go-to-Market & Sales) output schema maps directly to the existing GTM dashboard data expectations.

**Stage 12 Output Schema (GTM section):**

```json
{
  "gtm_strategy": {
    "tiers": [
      {
        "tier_name": "string (e.g., 'Tier 1: Direct Sales')",
        "channels": ["string"],
        "budget_allocation_pct": 0-100,
        "expected_cac": "number",
        "expected_conversion_rate": 0-1,
        "timeline_weeks": "number"
      }
    ],
    "campaigns": [
      {
        "campaign_name": "string",
        "channel": "string",
        "objective": "awareness|consideration|conversion|retention",
        "budget": "number",
        "duration_weeks": "number",
        "kpis": ["string"]
      }
    ],
    "timing": {
      "recommended_launch_window": "string",
      "pre_launch_weeks": "number",
      "soft_launch_recommended": true,
      "rationale": "string"
    },
    "market_readiness": {
      "score": 0-100,
      "blockers": ["string"],
      "accelerators": ["string"]
    }
  },
  "sales_model": {
    "type": "self_serve|inside_sales|field_sales|partner|hybrid",
    "funnel_stages": [
      { "stage": "string", "conversion_rate": 0-1, "avg_time_days": "number", "key_metrics": ["string"] }
    ],
    "customer_journey_steps": [
      { "step": "string", "touchpoints": ["string"], "automation_potential": "low|medium|high" }
    ],
    "deal_stages": [
      { "stage": "string", "probability": 0-1, "avg_value": "number" }
    ]
  }
}
```

**Data Flow**: Stage 12 output → `venture_artifacts` → GTM Dashboard queries artifacts → populates strategy, campaigns, timing, and execution views.

**Integration Points:**
- `GTMStrategyEngine.tsx` — Consumes `gtm_strategy.tiers` and `gtm_strategy.campaigns`
- `CampaignOrchestration.tsx` — Consumes `gtm_strategy.campaigns` for sequencing
- `MarketReadinessAssessment.tsx` — Consumes `gtm_strategy.market_readiness`
- `GTMTimingDashboard.tsx` — Consumes `gtm_strategy.timing`

**Reality Gate**: Stage 12's `evaluateRealityGate()` verifies that Stages 10, 11, and 12 are all internally consistent before allowing progression to THE BLUEPRINT phase. This existing function stays — just updated to check the new Stage 10 (customer personas) and Stage 11 (naming/visual) output shapes.

**Files to modify:**
- `lib/eva/stage-templates/stage-12.js` — REDESIGN: Combined GTM + Sales with new schema
- `lib/eva/stage-templates/analysis-steps/stage-12-*.js` — REDESIGN: Generate GTM + Sales
- `ehg/src/pages/GTMDashboardPage.tsx` — ADD: Query venture_artifacts for Stage 12 data
- `ehg/src/components/gtm/GTMStrategyEngine.tsx` — ADD: Accept pipeline data

---

### Gap 6: No Operations Dashboard for Post-Launch Services

**Severity**: HIGH | **Effort**: High | **GUI Components**: Must be built

**The Problem**: After Stage 25 (Launch Execution), ventures hand off to continuous operations. But there is no chairman-facing dashboard for live ventures. The existing operations components (`SystemHealthQuadrant`, etc.) are generic system monitoring, not venture-operations monitoring.

The chairman needs to see, per venture:
- Revenue metrics (from Stripe)
- Customer service ticket volume and resolution
- Customer feedback pipeline (new items, classified, actioned)
- Health score (computed from all signals)
- Enhancement queue (pending SDs from feedback patterns)

**Resolution**: New **"Live Ventures" section** in Chairman V3, accessible from the sidebar.

**Route**: `/chairman/operations` → `VentureOperationsPage.tsx`

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│ LIVE VENTURES (3 active)                                │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ Venture  │ Revenue  │ CS Load  │ Feedback │ Health      │
├──────────┼──────────┼──────────┼──────────┼─────────────┤
│ Truth    │ $12.4K   │ 3 open   │ 8 new    │ ██████░░ 78 │
│ Engine   │ ↑ 12%    │ avg 2h   │ 2 urgent │             │
├──────────┼──────────┼──────────┼──────────┼─────────────┤
│ Niche    │ $3.2K    │ 1 open   │ 3 new    │ ████████ 92 │
│ Brief    │ ↑ 45%    │ avg 30m  │ 0 urgent │             │
├──────────┼──────────┼──────────┼──────────┼─────────────┤
│ Creator  │ $0.8K    │ 7 open   │ 12 new   │ ████░░░░ 45 │
│ Flow     │ ↓ 5%     │ avg 8h   │ 5 urgent │ ⚠ ATTENTION │
└──────────┴──────────┴──────────┴──────────┴─────────────┘
```

**Click into venture → Venture Operations Detail:**

```
┌─────────────────────────────────────────────┐
│ CreatorFlow AI — Operations                 │
├──────────────┬──────────────────────────────┤
│ Revenue Tab  │ MRR, ARR, CAC/LTV, churn     │
│ CS Tab       │ Ticket list, agent perf, SLA  │
│ Feedback Tab │ Inbox items, patterns, SDs    │
│ Metrics Tab  │ AARRR funnel, cohorts, NPS    │
│ Health Tab   │ Score breakdown, drift alerts │
└──────────────┴──────────────────────────────┘
```

**Data Sources:**
- Revenue: `venture_financial_metrics` table (populated by Stripe webhook integration)
- CS: `customer_service_tickets` table (populated by CS agent)
- Feedback: Existing `feedback_items` table in Universal Inbox
- Metrics: `venture_operational_metrics` table (populated by analytics service)
- Health: Computed aggregate from all above signals

**Continuous Services Architecture:**

Each service runs as a background worker (like the stage execution worker pattern):

| Service | Worker | Schedule | Data Table |
|---------|--------|----------|-----------|
| Financial Sync | `workers/financial-sync.js` | Every 1h | `venture_financial_metrics` |
| CS Agent | `workers/cs-agent.js` | Real-time (webhook) | `customer_service_tickets` |
| Feedback Classifier | `workers/feedback-classifier.js` | Real-time (inbox trigger) | `feedback_items` (existing) |
| Metrics Collector | `workers/metrics-collector.js` | Every 6h | `venture_operational_metrics` |
| Health Scorer | `workers/health-scorer.js` | Every 1h | `venture_health_scores` |
| Enhancement Detector | `workers/enhancement-detector.js` | Daily | Creates SDs from patterns |

**Files to create:**
- `ehg/src/pages/chairman/VentureOperationsPage.tsx` — NEW: Operations dashboard
- `ehg/src/components/operations/VentureOperationsDetail.tsx` — NEW: Per-venture detail
- `ehg/src/components/operations/RevenueTab.tsx` — NEW
- `ehg/src/components/operations/CustomerServiceTab.tsx` — NEW
- `ehg/src/components/operations/FeedbackTab.tsx` — NEW (wraps existing inbox components)
- `ehg/src/components/operations/MetricsTab.tsx` — NEW (AARRR funnel)
- `ehg/src/components/operations/HealthTab.tsx` — NEW
- `ehg/src/routes/chairmanRoutesV3.tsx` — ADD: `/chairman/operations` route
- `ehg/src/components/chairman-v3/chairman-nav-config.ts` — ADD: Operations nav item
- Database: 4 new tables (financial_metrics, cs_tickets, operational_metrics, health_scores)
- Workers: 6 new background workers

**Note**: This is the largest gap and likely warrants its own orchestrator SD with multiple children.

---

### Gap 7: No Launch Workflow UI

**Severity**: HIGH | **Effort**: Medium | **GUI Components**: Must be built

**The Problem**: Stages 23-25 are entirely new (Marketing Preparation, Launch Readiness, Launch Execution). No UI components exist for:
- Marketing material SD tracking (Stage 23)
- Launch readiness checklist with go/no-go (Stage 24)
- Go-live execution progress (Stage 25)

**Resolution**: Three new stage renderers plus a **Launch Progress page**.

**Stage 23 Renderer** (`Stage23MarketingRenderer`):
```
┌─────────────────────────────────────────────┐
│ MARKETING PREPARATION — NicheBrief AI       │
├─────────────────────────────────────────────┤
│ Material SDs:                               │
│ ✅ SD-MKT-001: Landing Page Copy    [Done]  │
│ ✅ SD-MKT-002: Product Screenshots  [Done]  │
│ 🔄 SD-MKT-003: Demo Video          [60%]   │
│ ⬜ SD-MKT-004: Social Media Assets  [Queue] │
│                                             │
│ Progress: ████████░░░░ 60% (2/4 complete)   │
│ Estimated completion: 3 days                │
│                                             │
│ [No chairman action — auto-advances when    │
│  all material SDs complete]                 │
└─────────────────────────────────────────────┘
```

**Stage 24 Renderer** (`Stage24LaunchReadinessRenderer`):
```
┌─────────────────────────────────────────────┐
│ LAUNCH READINESS — Go/No-Go                 │
├─────────────────────────────────────────────┤
│ Checklist:                                  │
│ ✅ Product build complete (Stage 22 passed) │
│ ✅ Marketing materials ready (Stage 23)     │
│ ✅ Distribution channels configured         │
│ ⚠️ Payment integration tested (1 warning)   │
│ ✅ Legal/compliance reviewed                │
│ ✅ Support documentation ready              │
│                                             │
│ Readiness Score: 92/100                     │
│ Recommendation: GO                          │
│                                             │
│ Chairman Decision:                          │
│ [🚀 APPROVE LAUNCH] [⏸️ HOLD] [❌ CANCEL]   │
└─────────────────────────────────────────────┘
```

**Stage 25 Renderer** (`Stage25LaunchExecutionRenderer`):
```
┌─────────────────────────────────────────────┐
│ LAUNCH EXECUTION — NicheBrief AI            │
├─────────────────────────────────────────────┤
│ Go-Live Steps:                              │
│ ✅ DNS configured                           │
│ ✅ Production deployment verified           │
│ ✅ Payment gateway live                     │
│ 🔄 Marketing channels activating...        │
│ ⬜ Social media campaign scheduled          │
│ ⬜ Email announcement queued                │
│                                             │
│ Status: LAUNCHING                           │
│ Handoff to Operations: Pending              │
│                                             │
│ [No chairman action — auto-executes and     │
│  hands off to operations when complete]     │
└─────────────────────────────────────────────┘
```

**Launch Progress Page** (`/chairman/ventures/:id/launch`):
- Accessible from VentureDetailPage when venture is in stages 23-25
- Shows all three stages in a unified timeline view
- Real-time progress updates via Supabase Realtime

**Files to create:**
- `ehg/src/components/chairman-v3/gates/Stage23MarketingRenderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/Stage24LaunchReadinessRenderer.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/Stage25LaunchExecutionRenderer.tsx` — NEW
- `ehg/src/components/launch/LaunchProgressTimeline.tsx` — NEW
- `ehg/src/components/chairman-v3/gates/GateRendererRouter.tsx` — UPDATE: Add stage 23-25 mapping

---

### Gap 8: Content Forge Underutilized

**Severity**: LOW | **Effort**: Low | **GUI Components**: Already built

**The Problem**: `ContentForgePage.tsx` is an AI-powered content generation workspace that exists but is disconnected from the venture pipeline. Stage 23 (Marketing Preparation) creates marketing material SDs — Content Forge should be the execution environment for those SDs.

**Resolution**: Wire Content Forge as the **default execution tool** for Stage 23 marketing material SDs.

**How it works:**
1. Stage 23 creates marketing material SDs via `lifecycle-sd-bridge.js` (same pattern as Stage 18)
2. Each marketing SD has `sd_type: 'content'` and `execution_tool: 'content_forge'`
3. When a content SD enters EXEC phase, the stage execution worker routes it to Content Forge
4. Content Forge generates the asset (landing page copy, social media posts, video scripts)
5. Generated assets are stored in `venture_artifacts` with `stage_number: 23`
6. Stage 23 renderer shows completion status of all material SDs

**Integration Point**: Add a `fromSD` query parameter to Content Forge that pre-loads the SD context:
```
/content-forge?fromSD=SD-MKT-001&ventureId=abc123
```

**Files to modify:**
- `ehg/src/pages/ContentForgePage.tsx` — ADD: Parse `fromSD` query param, load SD context
- `lib/eva/lifecycle-sd-bridge.js` — ADD: Marketing SD creation logic for Stage 23
- `lib/eva/stage-templates/stage-23.js` — NEW: Marketing Preparation template with SD creation

---

### Gap 9: Financial Consistency Not Enforced

**Severity**: MEDIUM | **Effort**: Medium | **Affects**: Chairman trust in evaluation data

**The Problem**: Financial data contradicts across stages:
- Stage 5 says $400K capital needed; Stage 16 says $150K
- CAC varies wildly: $2,500 in one stage, $363 in another
- No cross-stage financial contract enforces consistency

This undermines chairman decision quality — contradictory financial data at different gates erodes trust.

**Resolution**: Create a **Financial Data Contract** — a shared schema and validation layer that enforces consistency.

**Architecture:**

```
┌─────────────────────────────────────────────────┐
│ Financial Data Contract                         │
│ lib/eva/contracts/financial-contract.js          │
├─────────────────────────────────────────────────┤
│ Canonical Fields:                               │
│   capital_required    — Set at Stage 5          │
│   cac_estimate        — Set at Stage 5          │
│   ltv_estimate        — Set at Stage 5          │
│   unit_economics      — Set at Stage 5          │
│   pricing_model       — Set at Stage 7          │
│   price_points        — Set at Stage 7          │
│   revenue_projection  — Set at Stage 16         │
├─────────────────────────────────────────────────┤
│ Rules:                                          │
│ 1. Once set, a field can only be REFINED (±20%) │
│    not contradicted (>50% deviation = error)    │
│ 2. Each stage that uses financials MUST consume │
│    from the contract, not re-derive             │
│ 3. If a stage needs to revise (pivot), it must  │
│    explicitly flag the revision with rationale  │
├─────────────────────────────────────────────────┤
│ Validation:                                     │
│ validateFinancialConsistency(stageN, contract)  │
│ → { consistent: bool, deviations: [], warnings }│
└─────────────────────────────────────────────────┘
```

**How stages interact with the contract:**

| Stage | Role | Contract Action |
|-------|------|-----------------|
| 5 | Financial Model | **SETS** canonical capital, CAC, LTV, unit economics |
| 7 | Pricing Strategy | **SETS** pricing model, price points. Must be consistent with Stage 5 CAC. |
| 11→12 | GTM & Sales | **CONSUMES** CAC from contract. Can refine (±20%) with rationale. |
| 16 | Financial Projections | **CONSUMES** all financial fields. Revenue projection uses contract prices. |

**Validation Hook**: Before each financial-consuming stage's `analysisStep` runs, the financial contract validator checks consistency. If a deviation >50% is detected, the stage gets a warning injected into its prompt: "FINANCIAL CONSISTENCY WARNING: Stage 5 estimated CAC at $X but this stage is projecting $Y. Reconcile or explain."

**Files to create/modify:**
- `lib/eva/contracts/financial-contract.js` — NEW: Contract definition and validation
- `lib/eva/stage-execution-engine.js` — ADD: Pre-analysis financial consistency check
- `lib/eva/stage-templates/stage-05.js` — MODIFY: Write to financial contract
- `lib/eva/stage-templates/stage-07.js` — MODIFY: Write pricing, consume CAC
- `lib/eva/stage-templates/stage-12.js` — MODIFY: Consume from contract
- `lib/eva/stage-templates/stage-16.js` — MODIFY: Consume from contract, flag deviations
- `lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js` — FIX: ROI bands inversion bug (line 173)

---

### Gap 10: Board Governance UI Minimal

**Severity**: LOW | **Effort**: Medium | **Deferred**: Not critical for pipeline redesign

**The Problem**: Board pages exist (Dashboard, Members, Meetings, Investments) but are mostly stubs with only 1 real component (`RAIDLogBoardView`). EHG's "Design for Exit" doctrine requires clean audit trails for potential acquirers.

**Resolution**: **Defer** to post-launch phase. Board governance becomes relevant when ventures approach exit readiness (capability saturation criteria from the doctrine).

**When to address:**
- When a venture reaches the exit saturation criteria (3+ of: capability harvest complete, generalization plateau, declining ecosystem lift, governance-to-lift imbalance)
- When EHG has 3+ live ventures and needs portfolio-level governance reporting

**Minimum viable implementation (when triggered):**
- Auto-generate board reports from venture operational data
- Decision audit trail from chairman gate history
- Financial summary from Stripe integration
- RAID log populated from risk stages (6, 15) and operational health monitoring

**No action needed now.** This is documented for future reference.

---

## Complete Stage Map (Post-Brainstorm)

### Phase 1: THE TRUTH (Stages 0-5) — "Is this worth pursuing?"

| Stage | Name | Key Change | Gate |
|-------|------|-----------|------|
| 0 | Synthesis (DFE) | **ADD**: Capability Contribution Score (component 13) | DFE auto-escalation |
| 1 | Idea Capture / Hydration | No change | — |
| 2 | Multi-Persona Analysis | No change | — |
| 3 | Hybrid Scoring | **ADD**: Capability hard-rule (<10/25 = auto-kill) | **Kill Gate** |
| 4 | Competitive Landscape | No change | — |
| 5 | Financial Model | **FIX**: ROI bands inversion. **ADD**: Write to financial contract. | **Kill Gate** |

### Phase 2: THE ENGINE (Stages 6-9) — "How will this make money?"

| Stage | Name | Key Change | Gate |
|-------|------|-----------|------|
| 6 | Risk Matrix | No change (Stage 15 merges into this) | — |
| 7 | Pricing Strategy | **ADD**: Consume CAC from financial contract | — |
| 8 | BMC Generation | No change | — |
| 9 | Exit Strategy | No change | — |

### Phase 3: THE IDENTITY (Stages 10-12) — "Who is the customer and how do we reach them?"

| Stage | Name | Key Change | Gate |
|-------|------|-----------|------|
| **10** | **Customer & Brand Foundation** | **REDESIGN**: Customer personas, mission/vision (required), brand genome (informed by personas) | — |
| **11** | **Naming & Visual Identity** | **REDESIGN**: Name candidates, color palette, typography, logo direction, design system | **Chairman Gate** |
| **12** | **Go-to-Market & Sales** | **REDESIGN**: GTM strategy + sales model combined. Reality gate. Financial contract consumption. | Reality Gate (auto) |

### Phase 4: THE BLUEPRINT (Stages 13-17) — "What exactly are we building?"

| Stage | Name | Key Change | Gate |
|-------|------|-----------|------|
| 13 | Product Roadmap | **FIX**: Date injection (generate 2026+, not 2023) | — |
| 14 | Technical Architecture | **ADD**: Consume capability scores for architecture recs | — |
| 15 | Risk Register | **MERGE**: Consolidate with Stage 6 (consume Stage 6, add new risks from 7-14) | — |
| 16 | Financial Projections | **ADD**: Consume from financial contract, flag deviations | Promotion Gate (auto) |
| 17 | Build Readiness | **ADD**: Capability extraction plan validation | **Promotion Gate** → Chairman action to promote to BUILD |

### Phase 5: THE BUILD LOOP (Stages 18-22) — "Build, test, and release the product"

| Stage | Name | Key Change | Gate |
|-------|------|-----------|------|
| 18 | Sprint Planning | **WIRE**: `lifecycle-sd-bridge.js` creates real SDs | — |
| 19 | Build Execution | **REDESIGN**: Read real SD progress from `venture_stage_work` (not LLM simulation) | — |
| 20 | Quality Assurance | **REDESIGN**: Read real test coverage and QA results | — |
| 21 | Build Review | **REDESIGN**: Evaluate real build artifacts | — |
| 22 | Release Readiness | **ENFORCE**: `blockProgression: true` actually blocks. Real data from stages 19-21. | **Chairman Gate** |

### Phase 6: LAUNCH (Stages 23-25) — "Ship it, market it, go live"

| Stage | Name | Key Change | Gate |
|-------|------|-----------|------|
| **23** | **Marketing Preparation** | **NEW**: Create marketing material SDs (like Stage 18). Content Forge integration. | Auto (materials complete) |
| **24** | **Launch Readiness** | **NEW**: Go/No-Go checklist. Product + marketing + distribution all verified. | **Chairman Gate** |
| **25** | **Launch Execution** | **REDESIGN**: Go-live, distribution activation, handoff to operations. Pipeline ends. | Terminal |

### Post-Pipeline: OPERATIONS (Continuous)

| Service | Description | Trigger |
|---------|-------------|---------|
| Financial Sync | Stripe integration, revenue/CAC/LTV tracking | Hourly |
| Customer Service Agent | Shared, venture-aware CS agent | Real-time |
| Feedback Classifier | Multi-source → Universal Inbox → auto-classify | Real-time |
| Metrics Collector | AARRR framework, cohort analysis, NPS | Every 6h |
| Health Scorer | Aggregate health score from all signals | Hourly |
| Enhancement Detector | Feedback patterns → auto-create SDs | Daily |

---

## Immediate Code Fixes (No Architecture Change Required)

These can be shipped now without waiting for the full redesign:

| # | Fix | File | Severity |
|---|-----|------|----------|
| 1 | ROI bands inversion bug | `stage-05-financial-model.js` line 173 | HIGH |
| 2 | Inject current date into all stage prompts | All `analysis-steps/*.js` files | MEDIUM |
| 3 | Add upstream kill-decision check | `stage-execution-engine.js` | HIGH |
| 4 | Enforce `blockProgression: true` | `eva-orchestrator.js` | HIGH |
| 5 | Fix Stage 24 prompt to include Stage 23 outcome | `stage-24-metrics-learning.js` | MEDIUM |

---

## Suggested Next Steps

1. **Create orchestrator SD** for the full pipeline redesign — children for each major workstream:
   - **Child A**: Identity Phase resequence (Stages 10-12) — new templates, schemas, analysis steps
   - **Child B**: Launch Phase redesign (Stages 23-25) — new templates, Content Forge wiring
   - **Child C**: Build Loop real data wiring (Stages 19-22) — connect `venture_stage_work` to analysis steps
   - **Child D**: Stage execution worker — auto-advance with chairman gates, polling-based
   - **Child E**: Capability Contribution Score — Stage 0 component 13, Stage 3 hard-rule
   - **Child F**: Financial consistency contract — shared validation, cross-stage enforcement
   - **Child G**: Full stage documentation rewrite (0-25)
   - **Child H**: Stage renderer UI updates (Tier 1 gates: 3, 5, 10, 11, 17, 22, 24)
   - **Child I**: Operations dashboard — Live Ventures page, 6 background workers
   - **Child J**: Launch workflow UI — Stage 23/24/25 renderers, Launch Progress page
   - **Child K**: Pipeline-to-GUI wiring — Customer Intelligence, Brand Genome, GTM dashboards
2. **Fix immediate code bugs** first (Stage 5 ROI, date injection, gate enforcement, kill-decision propagation)
3. **Chairman UX review** — evaluate end-to-end chairman experience after architecture is finalized
