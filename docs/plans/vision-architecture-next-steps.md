# EVA Venture Lifecycle: Vision & Architecture Next Steps

> **Created**: 2026-02-11
> **Context**: Brainstorming session following completion of the 25-stage CLI vs GUI gap analysis (PR #1117)
> **Status**: Steps 1-4 complete, Step 6 partially complete (OpenClaw research done, marketing make-vs-buy pending), Step 7 analysis complete (implementation pending), Step 8 functional spec complete (visual/UX pending), Step 5 not started

---

## Sequenced Plan

| Step | What | Deliverable | Status |
|:----:|------|-------------|:------:|
| **1** | **Rewrite vision** | Definitive vision doc. Inputs: Gemini diagrams, gap analysis, all decisions from this brainstorm | **COMPLETE** (v4.7, 34+8 decisions, PRs #1122-#1125, #1132) |
| **2** | **Define architecture** | Architecture doc: shared services model, EVA orchestration, layered scheduling, recurring ops loop | **COMPLETE** (v1.5, 16 sections, PRs #1128-#1132) |
| **3** | **Evaluate stages against vision + architecture** | Per-stage alignment analysis. Also identifies which stages need deep research (point #10) | **COMPLETE** (25-stage triangulation, 5,335 lines, PR #1117. Findings in architecture v1.4 Section 8) |
| **4** | **Distill corrective measures + enhancements per phase** | Priority list per phase from audit material | **COMPLETE** (embedded in architecture v1.4 Section 8 target schemas + v1.5 Section 13 Phase A-E sequence) |
| **5** | **Data mining: Todoist + YouTube** | Process existing ideas from integrations, categorize into stages | Not started |
| **6** | **Deep research on specific topics** | Triangulated research on make-vs-buy marketing (#9) and any other topics surfaced in Step 3 | **PARTIAL** (OpenClaw platform research done → 8 decisions in v4.7/v1.5. Marketing make-vs-buy still pending) |
| **7** | **Triangulate enhanced stage designs** | Multi-AI triangulation on updated stages (same method as gap analysis) | **ANALYSIS COMPLETE** (75 response files, consensus in architecture v1.4 Section 8. Stage template implementation is Phase A item #3) |
| **8** | **Dashboard redesign spec** | Add portfolio health + decisions queue + activity feed to existing lightweight dashboard | **FUNCTIONAL SPEC COMPLETE** (vision v4.7 + architecture v1.5 Phase C. Visual/UX wireframes pending) |

**Steps 1 and 2 run in parallel** -- vision defines "what," architecture defines "how," and they shape each other.

---

## All Decisions Captured

### From Original Brainstorming Points (1-6)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Architecture at scale | Shared services model. All agents are stateless services loading venture context from DB. No dedicated agents per venture. EVA as hub. LEO as shared engineering service. |
| 2 | GUI removal | Remove heavy stage input forms from EHG app. Keep + enhance lightweight chairman dashboard. CLI is authoritative for all venture progression. |
| 3 | Audit processing | Process the 25-stage gap analysis → corrective measures + priority enhancements per phase (Step 4). Number of enhancements per phase determined by the analysis, not fixed. |
| 4 | Todoist + YouTube | Mine for stage-relevant ideas. Integrations already exist in the EHG codebase. Deliberate step when ready (Step 5). |
| 5 | Vision rewrite | Rewrite using Gemini diagrams + gap analysis + today's inputs. Gemini diagrams are ONE input (not THE vision). |
| 6 | Gemini vision diagrams | Located at `C:\Users\rickf\OneDrive\Desktop\` (7 Gemini-generated images). Show 5-phase model: IDEATION, VALIDATION, DEVELOPMENT, SCALING, EXIT. |

### From Additional Brainstorming Points (7-12)

| # | Topic | Decision |
|---|-------|----------|
| 7 | Ongoing maintenance | Stages 24-25 become a recurring operations loop. Each cycle is versioned. Can trigger new SDs via LEO (declining metrics → enhancement SDs, competitor moves → analysis, etc.). |
| 8 | CRON / scheduling | Layered model: EVA as master scheduler + services self-schedule routine tasks + venture config determines cadence based on stage/risk. All levels coexist. |
| 9 | Marketing make vs buy | Requires deep research + triangulation. Context-rich prompt to be crafted later (Step 6). Not decided yet. |
| 10 | Research rubric | Don't pre-define which stages need deep research. Let the stage analysis (Step 3) reveal this naturally. |
| 11 | Dashboard | Keep all existing dashboard features. Add: portfolio health overview, decisions queue (what needs chairman attention), activity feed (what happened since last visit). |
| 12 | Data mining | Same as #4. Process Todoist tasks + YouTube playlists into categories mapped to 25 stages. |

---

## Architecture Decisions

### Organizational Model

```
CHAIRMAN (Human - You)
  Portfolio strategy, gate decisions, escalations

EVA (Orchestration Hub)
  ┌──────────┬──────────┬──────────────────────┐
  │ Events   │ Rounds   │ Priority Queue       │
  │ (urgent) │ (routine)│ (planned work)       │
  └──────────┴──────────┴──────────────────────┘

SHARED SERVICES (stateless, context-loaded)
  ┌─────────┬───────────┬─────────┬───────────┐
  │ CEO     │ Marketing │ Finance │ LEO       │
  │ Service │ Service   │ Service │ (Eng Svc) │
  └─────────┴───────────┴─────────┴───────────┘
  Each service loads venture context on demand

VENTURE DATA (source of identity)
  ┌──────────┬──────────┬──────────┬──────────┐
  │Venture A │Venture B │Venture C │  ... N   │
  │stage, metrics, decisions, history          │
  └──────────┴──────────┴──────────┴──────────┘
```

### Key Principles

1. **No dedicated agents per venture**. All agents are shared services. Venture identity lives in the database, not in agent instances.
2. **CEO is a shared service too**. One CEO service operates on any venture by loading its context. Same pattern as LEO operating on whichever SD it's pointed at.
3. **Engineering execution = LEO's domain**. The venture lifecycle defines business milestones ("build the MVP"). LEO creates SDs, sprints, QA, tests, and releases to accomplish it. Lifecycle stages don't micromanage the build.
4. **GTM deserves dedicated stage(s)**. How you reach and convert customers is a first-class business activity.
5. **Sales logic folds into GTM** (pre-build). Growth Optimization (post-launch) handles data-driven sales refinement.
6. **Exit-aware design, deferred execution**. Data model supports exit stages. Full exit phase built when needed, without re-architecting.
7. **Investment decision = automated portfolio optimization gate**. EVA decides based on capacity + value case ranking. No human bottleneck.
8. **Brand/Identity is broader than naming**. Includes app styling, customer segment definition, customer profiles.
9. **Lifecycle = 25 stages linear (1→23) + recurring ops loop (24→25)**. Live ventures cycle through metrics + review on a cadence.
10. **Layered scheduling**. EVA master scheduler + service self-scheduling + venture-level config. Events for urgent, rounds for routine, queue for planned.

---

## Vision Divergence Analysis (Gemini vs Current CLI)

Only stages 1-3 align between the Gemini vision diagrams and the current CLI. Stages 4-25 are completely different.

### Five Major Philosophical Differences

1. **Exit as destination vs exit as early analysis**: Gemini has full Phase 5 (5 stages) for exit execution. CLI has exit strategy as single early stage (9).
2. **Engineering-centric vs business-centric later stages**: CLI devotes 6 stages to engineering (17-22). Gemini devotes those positions to business operations.
3. **Identity/brand timing**: CLI has dedicated IDENTITY phase (10-12). Gemini has no naming/brand/sales stages.
4. **Investment decision as formal gate**: Gemini has explicit GO/NO-GO at Stage 10. CLI has no equivalent.
5. **Validation gates at phase boundaries**: Gemini has 4 formal validation gates (85%+ each). CLI has kill gates mid-flow.

### Resolution Direction

- Engineering stages move to LEO (not venture lifecycle)
- GTM gets dedicated stage(s)
- Exit phase designed but deferred
- Investment decision becomes automated portfolio optimization
- Brand/identity stages retained (broader than Gemini's omission)
- Phase structure to be determined in vision rewrite (Step 1)

---

## Deliverable Outlines

### Step 1: Vision Document Outline

```
EVA Venture Lifecycle: Definitive Vision
=========================================

1. Purpose & Scope
   - What this document is (and isn't)
   - Relationship to gap analysis, architecture doc, and Gemini diagrams

2. Core Philosophy
   - Capital-efficient venture creation via AI orchestration
   - Chairman governance model (human-in-the-loop at decision gates)
   - CLI as authoritative interface; lightweight dashboard for monitoring

3. Phase Structure
   - Phase definitions (THE TRUTH, THE ENGINE, THE IDENTITY, THE BLUEPRINT, THE BUILD LOOP, LAUNCH & LEARN)
   - Phase boundaries and gate types (kill gates, promotion gates, decision gates)
   - Stage-to-phase mapping (may differ from current 25-stage assignment)

4. Stage Inventory
   - Complete list of stages with one-line purpose
   - Which stages are linear (1→23) vs recurring (24→25 ops loop)
   - Cross-stage data contracts (what each stage produces for downstream)

5. Venture Lifecycle Flow
   - End-to-end flow diagram: idea → validation → identity → blueprint → build → launch → operate
   - Decision points and their outcomes
   - How ventures enter, progress, and exit the lifecycle

6. Key Differentiators from Gemini Vision
   - Engineering execution delegated to LEO (not lifecycle stages)
   - GTM as first-class stage(s)
   - Brand/Identity retained and broadened
   - Exit designed-for but deferred
   - Investment as automated portfolio optimization

7. Venture Decision Taxonomy
   - Gate decisions: pass/kill, go/no-go, release/hold/cancel
   - Venture decisions: continue/pivot/expand/sunset/exit
   - Chairman decisions: GO/NO_GO/PAUSE/PIVOT

8. Success Metrics
   - How venture health is measured (5 dimensions: product/market/technical/financial/team)
   - How the lifecycle itself improves over iterations
```

### Step 2: Architecture Document Outline

```
EVA Platform Architecture: Shared Services Model
==================================================

1. System Overview
   - Entity hierarchy: Portfolio → Companies → Ventures
   - Chairman → EVA → Shared Services → Venture Data
   - Diagram of the full organizational model

2. Shared Services Model
   - Principle: all agents are stateless services, venture identity lives in DB
   - CEO Service: loads venture context, coordinates other services
   - LEO Service: engineering execution (SDs, sprints, QA, releases)
   - Marketing Service, Finance Service, etc.
   - How services load venture context on demand

3. EVA Orchestration Hub
   - Three trigger types: Events (urgent), Rounds (routine), Priority Queue (planned)
   - Master scheduling layer
   - Task contracts and dead letter queue
   - Multi-venture coordination

4. Layered Scheduling
   - EVA master scheduler (portfolio-level priorities)
   - Service self-scheduling (routine tasks within each service)
   - Venture config layer (cadence based on stage/risk)
   - How all three layers coexist

5. Venture Data Model
   - Core tables: ventures, stages, decisions, metrics, history
   - Stage artifact storage (JSON per stage)
   - Cross-stage data contracts (how stages reference each other)
   - Versioned recurring ops loop (Stages 24-25 cycles)

6. Investment & Portfolio Optimization
   - Automated investment decision gate
   - Capacity + value case ranking
   - Portfolio health aggregation

7. LEO Protocol Integration
   - How venture lifecycle stages trigger LEO SDs
   - SD Bridge (Stage 18 sprint items → SD payloads)
   - How LEO reports back to venture stages

8. Security & Governance
   - Chairman RLS policies (fn_is_chairman())
   - Agent authorization model
   - Token budget management per venture/phase

9. What Already Exists vs What Needs Building
   - Existing DB tables and their status (configured but inert)
   - Implementation roadmap tied to vision steps
```

---

## Gap Analysis Cross-Reference Index

Per-stage consensus decisions extracted from the 25-stage triangulated analysis. For each stage: the top P0 changes and the key architectural pattern established.

### Phase 1: THE TRUTH (Stages 1-5)

| Stage | Name | P0 Consensus | Key Pattern |
|:-----:|------|-------------|-------------|
| **1** | Idea Capture | Add `problemStatement` (required). Wire Stage 0 synthesis output into Stage 1. Keep `valueProp`. | Stage 0→1 data pipeline closes the synthesis gap |
| **2** | Idea Analysis | Add active `analysisStep` (the #1 gap). Adopt 0-100 integer scale. Align categories to Stage 3's 6 kill gate metrics. | Every stage gets an analysisStep (pattern established here) |
| **3** | Kill Gate | Add metric generation `analysisStep`. Hybrid scoring (50% deterministic + 50% AI). Stage 2→3 formal artifact contract. Raise kill threshold from 40. | Deterministic baseline + AI augmentation scoring model |
| **4** | Competitive Landscape | Add competitor discovery `analysisStep`. Add pricing model per competitor (essential for Stage 5). Eliminate feature comparison matrix. | Cross-stage consumption: Stage 3→4 competitor handoff |
| **5** | Kill Gate (Financial) | Add financial model generation `analysisStep`. Stage 4 consumption mandatory. Unit economics required (CAC, LTV, LTV:CAC, payback). ROI 25% with bands. | Kill gate evaluates generated data, not user-entered data |

### Phase 2: THE ENGINE (Stages 6-9)

| Stage | Name | P0 Consensus | Key Pattern |
|:-----:|------|-------------|-------------|
| **6** | Risk Assessment | Add risk generation `analysisStep`. Stage 5 financial seeding mandatory. 2-factor scoring (probability x consequence). Add `source` field per risk. | Auto-seeding from prior stages (financial triggers → risks) |
| **7** | Revenue Architecture | Add pricing strategy `analysisStep` consuming Stages 4-6. Add `pricingModel` enum (6 values). Consume Stage 4 competitive pricing, don't re-analyze. | Each stage consumes, not duplicates, prior stage data |
| **8** | Business Model Canvas | Add 9-block BMC generation `analysisStep` from Stages 1-7. Preserve structured items (text + priority + evidence). Evidence field required on all items. | Synthesis stage: first stage consuming all prior stages |
| **9** | Exit Strategy | Add `analysisStep` consuming Stages 1-8. Exit type enum (acquisition/ipo/merger/mbo/liquidation). Lightweight valuation (revenue multiple range, no DCF). | Exit-aware design with deferred execution |

### Phase 3: THE IDENTITY (Stages 10-12)

| Stage | Name | P0 Consensus | Key Pattern |
|:-----:|------|-------------|-------------|
| **10** | Naming/Brand | Add brand genome + name generation `analysisStep`. Narrative extension (vision/mission/brand_voice). Decision status: approved/revise/working_title. | Brand is broader than naming (includes styling, segments, profiles) |
| **11** | GTM Strategy | Add tier/channel/timeline generation `analysisStep`. Keep exactly 8 channels ($0 budget = backlog). Add persona + pain_points to tiers. | Forced breadth: 8 channels is the EVA method |
| **12** | Sales Identity | Add sales logic generation `analysisStep`. Wire sales_model to Stage 7 pricing + Stage 11 channels. Add conversion_rate_estimate to funnel stages. | Sales model is the most impactful identity decision |

### Phase 4: THE BLUEPRINT (Stages 13-16)

| Stage | Name | P0 Consensus | Key Pattern |
|:-----:|------|-------------|-------------|
| **13** | Product Roadmap | Add roadmap generation `analysisStep` consuming Stages 1-12. Wire sales_model → feature generation. Add priority (now/next/later) to milestones. | Sales model drives product priorities |
| **14** | Technical Architecture | Add architecture generation `analysisStep`. Map Stage 13 deliverable types → architecture layers. Add security section, Schema-Lite data entities. | Structured minimalism: enough to inform Stages 15-16, not premature implementation |
| **15** | Resource Planning | Add agent allocation `analysisStep` from Stages 12-14. Map AI agent capabilities to build phases. Add service/tool requirements and compute budget per phase. | AI-only operation: agents and compute, not human hiring |
| **16** | Financial Projections | Add financial model `analysisStep` consuming 7 prior stages. Replace flat projections with "Startup Standard" P&L. Phase-variable costs from Stage 15. Promotion gate checks viability, not just presence. | The synthesis stage of THE BLUEPRINT: all prior stages feed financial truth |

### Phase 5: THE BUILD LOOP (Stages 17-22)

| Stage | Name | P0 Consensus | Key Pattern |
|:-----:|------|-------------|-------------|
| **17** | Pre-Build Checklist | Add checklist generation `analysisStep` from Blueprint stages. Add priority + source_stage_ref. build_readiness decision (go/conditional_go/no_go). | Final quality gate before execution begins |
| **18** | Sprint Planning | Add `analysisStep` generating items from Stage 13 "now" deliverables. Stage 17 readiness gate. Enrich SD Bridge with architecture + assignee. | SD Bridge: lifecycle → LEO Protocol execution |
| **19** | Build Execution | Add `analysisStep` initializing tasks 1:1 from Stage 18 items. sprint_completion decision (complete/partial/blocked). Issue severity/status enums. | Lightweight aggregation, not execution engine |
| **20** | Quality Assurance | Add `analysisStep` scoping QA from Stage 18/19. Replace boolean gate with quality_decision (pass/conditional_pass/fail). Test type + traceability. | Decision-based gates replace boolean gates |
| **21** | Build Review | **Reconceive** from "Integration Testing" to "Build Review". Add `analysisStep` consuming Stages 14/19/20. review_decision (approve/conditional/reject). | Stage 20 = "Did we test it?" Stage 21 = "Is it ready?" |
| **22** | Release Readiness | **Fix promotion gate stale contracts** (critical bug). Add `analysisStep` synthesizing entire BUILD LOOP. release_decision (release/hold/cancel). Sprint retrospective. | Business review (human judgment) separate from technical gate |

### Phase 6: LAUNCH & LEARN (Stages 23-25)

| Stage | Name | P0 Consensus | Key Pattern |
|:-----:|------|-------------|-------------|
| **23** | Launch Execution | Add `analysisStep` synthesizing Stage 22 into launch brief. Kill gate validates upstream (promotion_gate + release_decision). Add success_criteria as contract with Stage 24. | Learning loop contract: define targets at launch, measure at Stage 24 |
| **24** | Metrics & Learning | Add `analysisStep` producing launch scorecard. success_criteria_evaluation maps Stage 23 criteria to AARRR metrics. Learning categories as enum. | Closes the learning loop: targets → measurement → verdict |
| **25** | Venture Review | Add venture_decision (continue/pivot/expand/sunset/exit) -- THE capstone output. Add `analysisStep` synthesizing full journey. Financial comparison, venture health score. | The pipeline finally produces a definitive outcome |

### Universal Patterns Across All 25 Stages

1. **Every stage gets an analysisStep** (Stages 2-25): LLM-driven synthesis consuming prior stage data. Transforms CLI from passive data collection into active analytical engine.
2. **Decision-based gates replace boolean gates**: quality_decision, review_decision, sprint_completion, release_decision, venture_decision.
3. **Enum standardization**: Free-text fields systematically replaced with enums where aggregation matters. Free text preserved where narrative matters.
4. **Cross-stage contracts**: Each stage explicitly defines what it produces for downstream consumption.
5. **CLI superiority preserved**: Pure function gates, deterministic derivation, lean schema, text-based workflow compatibility.

---

## Reference Files

- **Gap analysis**: `docs/plans/cli-vs-gui-stage-analysis.md` (5,335 lines, 25 stages complete)
- **Prompts**: `docs/plans/prompts/stage-XX-triangulation.md` (25 files)
- **Responses**: `docs/plans/responses/stage-XX-{claude,openai,antigravity}.md` (75 files)
- **Gemini vision diagrams**: `C:\Users\rickf\OneDrive\Desktop\` (7 numbered PNG files)
- **EHG app architecture**: Companies, ventures, portfolios, agents tables in Supabase
- **AI CEO config**: `ehg/src/hooks/useAICEOAgent.ts`, `ehg/supabase/functions/ai-ceo-agent/index.ts`
- **EVA orchestration**: `ehg/supabase/migrations/20251215000000_eva_orchestration_layer.sql`

---

## Existing EHG App Architecture (from codebase analysis)

### Entity Hierarchy
```
Portfolio → Companies → Ventures (with AI Agent assignments)
```

### What Already Exists in Database
- `ventures.ceo_agent_id` -- each venture CAN have an AI CEO agent assigned
- `agents` table with types: ceo, executive, specialist, advisor
- AI CEO config: decisionFramework, multiAgentProtocols, performanceMetrics
- Portfolio coordination: synergy_analysis, portfolio_resource_allocation, venture_interactions
- Token budget management per venture and per phase
- Chairman unified decisions (GO/NO_GO/PAUSE/PIVOT)
- EVA orchestration layer: task contracts, event bus, dead letter queue, state tracking
- fn_is_chairman() security helper for RLS policies

### What's NOT Built Yet
- AI CEO agents don't autonomously run ventures (configured but inert)
- EVA doesn't manage multiple ventures concurrently
- LEO protocol not connected to per-venture execution
- No "OpenClaw" integration (term not in codebase)
- Shared services model not implemented
- Layered scheduling not implemented
