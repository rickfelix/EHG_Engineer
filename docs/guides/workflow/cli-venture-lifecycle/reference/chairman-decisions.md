
## Table of Contents

- [Decision Index](#decision-index)
- [D01: Decision Filter Engine Design](#d01-decision-filter-engine-design)
  - [What Was Decided](#what-was-decided)
  - [Why This Was Chosen](#why-this-was-chosen)
  - [6 Trigger Types and Rationale](#6-trigger-types-and-rationale)
  - [Fixed Evaluation Order Rationale](#fixed-evaluation-order-rationale)
  - [Implementation Constraint](#implementation-constraint)
  - [Files Affected](#files-affected)
- [D02: Reality Gate Placement](#d02-reality-gate-placement)
  - [What Was Decided](#what-was-decided)
  - [Why 5 Specific Boundaries Were Chosen](#why-5-specific-boundaries-were-chosen)
  - [Fail-Closed Design Rationale](#fail-closed-design-rationale)
  - [Quality Score Thresholds Per Artifact Type](#quality-score-thresholds-per-artifact-type)
  - [Not Configurable By Design](#not-configurable-by-design)
  - [Files Affected](#files-affected)
- [D03: Chairman Preference Scoping](#d03-chairman-preference-scoping)
  - [What Was Decided](#what-was-decided)
  - [Why Scoped Resolution Was Chosen](#why-scoped-resolution-was-chosen)
  - [Supported Value Types](#supported-value-types)
  - [Database Schema](#database-schema)
  - [Files Affected](#files-affected)
- [D04: Kill Gate Thresholds](#d04-kill-gate-thresholds)
  - [Why Specific Threshold Values Were Chosen](#why-specific-threshold-values-were-chosen)
  - [How Thresholds Can Be Customized Per Venture](#how-thresholds-can-be-customized-per-venture)
  - [Kill vs Revise vs Proceed Decision Framework](#kill-vs-revise-vs-proceed-decision-framework)
  - [Files Affected](#files-affected)
- [D05: Devil's Advocate Model Isolation](#d05-devils-advocate-model-isolation)
  - [Why GPT-4o (Different Model Than Primary)](#why-gpt-4o-different-model-than-primary)
  - [Advisory (Non-Blocking) Design Decision](#advisory-non-blocking-design-decision)
  - [Where Devil's Advocate Is Invoked](#where-devils-advocate-is-invoked)
  - [Fallback Behavior When API Unavailable](#fallback-behavior-when-api-unavailable)
  - [LLM Client Factory Integration](#llm-client-factory-integration)
  - [Files Affected](#files-affected)
- [D06: Lifecycle-to-SD Bridge Design](#d06-lifecycle-to-sd-bridge-design)
  - [Stage 18 as Bridge Point Rationale](#stage-18-as-bridge-point-rationale)
  - [Orchestrator + Children SD Structure](#orchestrator-children-sd-structure)
  - [Idempotency Requirements](#idempotency-requirements)
  - [Full LEO SD Workflow Requirement](#full-leo-sd-workflow-requirement)
  - [Files Affected](#files-affected)
- [Decision Traceability](#decision-traceability)
- [Decision Relationship Diagram](#decision-relationship-diagram)

---
Category: Reference
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, reference, chairman-decisions]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001]
---

# Chairman Decisions Reference

This document records the 6 Chairman Decisions (D01-D06) that establish the architectural and design principles for the CLI Venture Lifecycle system. These decisions are binding constraints that implementations must follow.

Chairman Decisions are distinct from runtime Chairman reviews (where the Chairman evaluates venture stage outputs). These are design-time decisions made during the planning phase that govern how the system itself is built.

## Decision Index

| Decision | Title | Category | Impact |
|----------|-------|----------|--------|
| D01 | Filter Engine Design | Architecture | How auto-proceed works |
| D02 | Reality Gate Placement | Architecture | Where boundaries are enforced |
| D03 | Chairman Preference Scoping | Data Model | How preferences resolve |
| D04 | Kill Gate Thresholds | Configuration | When ventures are killed |
| D05 | Devil's Advocate Model Isolation | Integration | Which AI model challenges |
| D06 | Lifecycle-to-SD Bridge | Architecture | How lifecycle becomes code |

---

## D01: Decision Filter Engine Design

**Decision**: The filter engine is a deterministic threshold comparator, not a predictive AI model.

### What Was Decided

The Decision Filter Engine evaluates stage outputs against fixed thresholds using simple comparisons (greater than, less than, contains). It does NOT use machine learning, embeddings, or probabilistic models to predict outcomes.

### Why This Was Chosen

```
Option A: Prediction Engine (ML-based)
  + Could learn from outcomes over time
  + More sophisticated risk detection
  - Opaque decisions ("black box")
  - Requires training data (cold start problem)
  - Model drift could change behavior silently
  - Chairman cannot audit or understand decisions

Option B: Filter Engine (Deterministic)     <-- CHOSEN
  + Transparent: same inputs = same outputs
  + Auditable: Chairman can inspect every threshold
  + No training data needed
  + No drift risk
  + Chairman can customize thresholds
  - Less sophisticated pattern detection
  - May miss subtle risk signals
```

The Chairman chose transparency and auditability over sophistication. Every auto-proceed decision can be explained by pointing to specific thresholds.

### 6 Trigger Types and Rationale

| # | Trigger | Why Included |
|---|---------|--------------|
| 1 | cost_threshold | Most common Chairman concern -- budget control |
| 2 | new_tech_vendor | Technology risk -- unknown dependencies |
| 3 | strategic_pivot | Direction change -- mission alignment |
| 4 | low_score | Confidence check -- data quality indicator |
| 5 | novel_pattern | Precedent check -- unknown territory |
| 6 | constraint_drift | Consistency check -- assumption validity |

These 6 triggers cover the Chairman's primary concerns: money, technology, direction, confidence, precedent, and consistency.

### Fixed Evaluation Order Rationale

Triggers are evaluated in order 1-6 for determinism. If the order were randomized or parallel, the same inputs could theoretically produce different audit trails. Fixed order ensures reproducibility.

The specific order was chosen by priority:
1. Cost (most concrete, fastest to evaluate)
2. Technology (concrete, fast lookup)
3. Strategic pivot (requires baseline comparison)
4. Score (simple numeric check)
5. Novel pattern (requires cross-venture query)
6. Constraint drift (most complex evaluation)

### Implementation Constraint

All implementations of the filter engine MUST be deterministic. Given identical inputs (stage output, chairman preferences, venture context), the engine MUST produce identical outputs. No randomness, no time-dependent behavior, no external service calls that could vary.

### Files Affected

- Primary: `lib/eva/decision-filter-engine.js`
- Preferences: `lib/eva/chairman-preference-store.js`
- Cross-venture: `lib/eva/cross-venture-learning.js`
- Drift detector: `lib/eva/constraint-drift-detector.js`

---

## D02: Reality Gate Placement

**Decision**: Reality Gates are always-on phase boundary enforcers placed at 5 specific boundaries. They cannot be disabled.

### What Was Decided

Reality Gates check for artifact existence and quality at phase transition points. They are "fail-closed" -- if a required artifact is missing or below quality threshold, the transition is blocked. The Chairman cannot disable Reality Gates.

### Why 5 Specific Boundaries Were Chosen

The 25-stage lifecycle is divided into 6 phases. Reality Gates are placed at 5 of the 6 phase boundaries (the entry into Phase 1 has no prior artifacts to check):

```
Phase 1: THE TRUTH (1-5)
                            <-- Reality Gate 1 (5->6)
Phase 2: THE ENGINE (6-9)
                            <-- Reality Gate 2 (9->10)
Phase 3: THE IDENTITY (10-12)
                            <-- Reality Gate 3 (12->13)
Phase 4: THE BLUEPRINT (13-16)
                            <-- Reality Gate 4 (16->17)
Phase 5: THE BUILD LOOP (17-22)
     [Within: 20->21]      <-- Reality Gate 5 (20->21)
Phase 6: LAUNCH & LEARN (23-25)
```

Each boundary represents a point where all prior phase work must be complete before advancing. The 5th gate (20->21) is within THE BUILD LOOP because security and performance must be verified before QA begins.

### Fail-Closed Design Rationale

```
Option A: Fail-open (warn but allow)
  + Doesn't block progress
  - Allows advancement with incomplete work
  - Technical debt compounds
  - Later stages fail with missing inputs

Option B: Fail-closed (block until resolved)     <-- CHOSEN
  + Guarantees completeness at each boundary
  + Catches missing work early
  + Later stages have guaranteed inputs
  - Can slow progress if artifacts are delayed
```

The Chairman chose fail-closed because the cost of advancing with incomplete work is higher than the cost of waiting for completion. Every stage depends on prior artifacts; missing inputs cascade into lower quality downstream.

### Quality Score Thresholds Per Artifact Type

Higher-risk artifact types have higher quality thresholds:

```
Threshold Tiers:

  0.8  ----  security_audit
             (Highest: security failures are catastrophic)

  0.7  ----  financial_model, data_model, schema_definition,
             performance_benchmark
             (High: structural errors compound downstream)

  0.6  ----  problem_statement, market_analysis, risk_matrix,
             business_model_canvas, user_stories
             (Standard: analysis quality is important but
              recoverable if slightly weak)

  0.5  ----  brand_genome
             (Lower: brand decisions are more subjective,
              harder to score objectively)
```

### Not Configurable By Design

Reality Gates are intentionally not customizable by the Chairman. This ensures a baseline quality standard that cannot be bypassed, even under pressure to move fast. If the Chairman could disable Reality Gates, the incentive would be to skip them when behind schedule -- exactly when they are most needed.

### Files Affected

- Primary: `lib/eva/reality-gates.js`
- Artifact queries: `venture_artifacts` table
- URL checks: HTTP client within reality-gates.js

---

## D03: Chairman Preference Scoping

**Decision**: Chairman preferences resolve with venture-specific scope first, falling back to global preferences, then hardcoded defaults.

### What Was Decided

A three-tier preference resolution hierarchy:

```
Tier 1: Venture-specific preference
   chairman_preferences WHERE chairman_id = X AND venture_id = Y AND key = K
         |
    Found? --> Use it
    Not found? --> Fall through
         |
Tier 2: Global preference
   chairman_preferences WHERE chairman_id = X AND venture_id IS NULL AND key = K
         |
    Found? --> Use it
    Not found? --> Fall through
         |
Tier 3: Hardcoded default
   DEFAULTS constant in decision-filter-engine.js
         |
    Always available --> Use it
```

### Why Scoped Resolution Was Chosen

```
Option A: Global only
  + Simple
  - All ventures use same thresholds
  - Cannot customize for high-risk or low-risk ventures

Option B: Venture-specific only
  + Maximum control
  - Must set preferences for every venture
  - No sensible defaults

Option C: Scoped resolution (global + venture)     <-- CHOSEN
  + Sensible defaults work for most ventures
  + Chairman can override for specific ventures
  + New ventures inherit global preferences
  + Explicit venture preferences take priority
```

This follows the principle of "convention over configuration" -- defaults work for the common case, overrides handle exceptions.

### Supported Value Types

| Value Type | Example | Use Case |
|------------|---------|----------|
| number | `10000` | Cost thresholds, score minimums |
| string | `'HIGH'` | Severity levels, enum values |
| boolean | `true` | Feature flags, toggles |
| array | `['React', 'Node.js']` | Approved technology lists |
| object | `{ min: 0.4, max: 0.8 }` | Range constraints |

### Database Schema

The `chairman_preferences` table:

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| chairman_id | TEXT | Which Chairman set this |
| venture_id | UUID (nullable) | NULL = global, set = venture-specific |
| preference_key | TEXT | Dot-notation key (e.g., `filter.cost_max_usd`) |
| preference_value | JSONB | Value of any supported type |
| value_type | TEXT | Hint for deserialization |
| created_at | TIMESTAMPTZ | When set |
| updated_at | TIMESTAMPTZ | When last modified |

**Unique constraint**: `(chairman_id, venture_id, preference_key)` -- one value per scope per key.

### Files Affected

- Preference store: `lib/eva/chairman-preference-store.js`
- Table: `chairman_preferences`
- Consumer: `lib/eva/decision-filter-engine.js`

---

## D04: Kill Gate Thresholds

**Decision**: Specific threshold values were chosen for each Kill Gate based on industry benchmarks and the Chairman's risk tolerance.

### Why Specific Threshold Values Were Chosen

**Stage 3 (Validation Score >= 6)**:
- Scale: 1-10 composite from 6 sub-metrics
- Threshold 6: slightly above median (5) -- requires a positive signal, not just neutral
- Too low (e.g., 4): Would pass ventures with weak market signals
- Too high (e.g., 8): Would kill ventures that could succeed with iteration
- 6 represents "more positive evidence than negative"

**Stage 5 (Profitability)**:
- Gross Margin >= 40%: Industry standard for SaaS/software ventures. Below 40% leaves insufficient margin for R&D and growth.
- Breakeven <= 18 months: Maximum runway the Chairman is comfortable funding before profitability.
- CAC:LTV >= 1:3: Standard unit economics benchmark. Below 3x means customer acquisition costs too much relative to lifetime value.
- ROI >= 15%: Minimum return that justifies the risk over safer investments.

**Stage 13 (Viability Score >= 3.0 / 60%)**:
- 8 criteria, each 1-5
- 60% threshold: mid-range -- the tech must be "adequate" across all dimensions
- Too low: Would approve technically risky stacks
- Too high: Would reject stacks that are adequate but not excellent

**Stage 23 (Multi-dimensional)**:
- No single numeric threshold -- all readiness categories must pass
- This is intentionally stricter: production launch is the highest-stakes gate

### How Thresholds Can Be Customized Per Venture

All Kill Gate thresholds (except Stage 23 category structure) are customizable via Chairman preferences:

```
Example: High-risk, high-reward venture needs different thresholds

Chairman sets venture-specific preferences:
  gate.kill3.validation_score_min = 5    (lower -- willing to take market risk)
  gate.kill5.gross_margin_min = 0.30     (lower -- accepting thin margins early)
  gate.kill5.breakeven_months_max = 24   (higher -- more patience for profitability)
  gate.kill5.roi_threshold_min = 0.25    (higher -- needs bigger return to justify risk)
```

### Kill vs Revise vs Proceed Decision Framework

The Chairman's three options at each Kill Gate:

```
                    KILL
                     |
                     v
              Venture terminated.
              Status = 'killed'.
              Artifacts preserved
              for learning.

                    REVISE
                     |
                     v
              Roll back to specific
              stage. Address issues.
              Re-attempt the gate.

                    PROCEED
                     |
                     v
              Continue despite
              threshold concerns.
              Chairman takes
              explicit risk.
              Rationale recorded.
```

Proceeding despite threshold failures is allowed but recorded. The Chairman is accepting explicit risk, and the rationale is stored in `chairman_decisions` for accountability.

### Files Affected

- Gate logic: `lib/agents/modules/venture-state-machine/stage-gates.js`
- Default thresholds: `lib/eva/decision-filter-engine.js` (DEFAULTS constant)
- Preference overrides: `lib/eva/chairman-preference-store.js`
- Decision recording: `chairman_decisions` table

---

## D05: Devil's Advocate Model Isolation

**Decision**: The Devil's Advocate uses GPT-4o (a different model than the primary analysis model) and is advisory, not blocking.

### Why GPT-4o (Different Model Than Primary)

```
Option A: Same model (Claude) as Devil's Advocate
  - Shared training biases
  - Same blind spots
  - May agree with its own analysis
  - Limited adversarial value

Option B: Different model (GPT-4o)     <-- CHOSEN
  + Different training data
  + Different reasoning patterns
  + Genuinely independent perspective
  + More likely to identify blind spots
  - Requires OpenAI API access
  - Additional cost per review
  - Cross-model latency
```

The Chairman chose model isolation because the primary value of a Devil's Advocate is independence. Using the same model to challenge itself produces weaker adversarial arguments.

### Advisory (Non-Blocking) Design Decision

```
Option A: Blocking Devil's Advocate
  - Must pass Devil's Advocate to proceed
  - Could create deadlocks (primary says yes, DA says no)
  - Who breaks the tie?
  - Slows all gate evaluations

Option B: Advisory Devil's Advocate     <-- CHOSEN
  + Chairman sees both perspectives
  + Chairman makes final decision
  + No deadlock risk
  + Devil's Advocate feedback is additional context
  - Chairman might ignore Devil's Advocate
```

The Devil's Advocate output is presented alongside the primary analysis. The Chairman sees:

```
+---------------------------+---------------------------+
| PRIMARY ANALYSIS          | DEVIL'S ADVOCATE          |
| (Claude/primary model)    | (GPT-4o)                  |
|                           |                           |
| Score: 7/10               | Counter-arguments:        |
| Recommendation: PROCEED   | 1. Market size overstated |
| Key strengths:            | 2. Competition underest.  |
| - Strong market fit       | 3. Team gap in ML skills  |
| - Clear revenue model     |                           |
| - Differentiated product  | Advisory: PROCEED WITH    |
|                           | CAUTION                   |
+---------------------------+---------------------------+
                     |
                     v
              Chairman Decision
              (kill / revise / proceed)
```

### Where Devil's Advocate Is Invoked

| Gate Type | Stages | Devil's Advocate |
|-----------|--------|:----------------:|
| Kill Gate | 3, 5, 13, 23 | Yes |
| Promotion Gate | 16 | Yes |
| Promotion Gate | 17 | No |
| Promotion Gate | 22 | Yes |

Gate 17 (Environment Ready) does not include Devil's Advocate because environment setup is operational/factual, not strategic. There is nothing subjective to challenge.

### Fallback Behavior When API Unavailable

If the GPT-4o API is unavailable (network error, rate limit, outage):

```
GPT-4o API call fails
         |
    Retry (up to 3 times, exponential backoff)
         |
    Still fails?
         |
         v
    Continue WITHOUT Devil's Advocate
    Chairman is informed that DA review was unavailable
    Decision metadata records: devils_advocate_available = false
```

The system does NOT block on Devil's Advocate unavailability. The Chairman can still make a decision based on the primary analysis alone. This is explicitly a design choice -- the Devil's Advocate adds value but is not required for the system to function.

### LLM Client Factory Integration

The Devil's Advocate routes through the LLM Client Factory for GPT-4o access:

```
Devil's Advocate Module
         |
         v
lib/llm/client-factory.js
         |
    getLLMClient({ purpose: 'devils-advocate' })
         |
         v
OpenAI Adapter (GPT-4o)
    via provider-adapters.js
```

The LLM Client Factory handles:
- Model selection (GPT-4o for Devil's Advocate)
- API key management
- Retry logic
- Token usage tracking

### Files Affected

- Devil's Advocate module: `lib/eva/devils-advocate.js`
- LLM routing: `lib/llm/client-factory.js`
- Model routing config: `config/phase-model-routing.json`
- Provider adapters: `lib/sub-agents/vetting/provider-adapters.js`

---

## D06: Lifecycle-to-SD Bridge Design

**Decision**: Stage 18 is the bridge point where venture lifecycle sprint plans become real LEO Strategic Directives. Each sprint item goes through full LEAD -> PLAN -> EXEC.

### Stage 18 as Bridge Point Rationale

```
Why Stage 18 specifically?

Stages 1-17: Planning and design
  - No code is written
  - Artifacts are analysis documents
  - No need for LEO SD tracking

Stage 18: MVP Development Loop     <-- BRIDGE POINT
  - Sprint plans define features to BUILD
  - Each feature needs:
    - PRD (PLAN phase)
    - Implementation (EXEC phase)
    - Testing (EXEC phase)
    - Review (LEAD phase)
  - This IS the LEO workflow

Stages 19-25: Continued development and launch
  - Also may create SDs (19, 20, 21, 22, 25)
  - But Stage 18 is the primary bridge
```

Stage 18 was chosen because it is the first stage where actual code needs to be written. All prior stages produce planning artifacts; Stage 18 produces actionable implementation tasks.

### Orchestrator + Children SD Structure

```
Stage 18 Sprint Plan
         |
         v
   +-----+------+
   | Orchestrator |
   | SD           |
   | (Sprint)     |
   +-----+------+
         |
    +----+----+----+----+
    |    |    |    |    |
    v    v    v    v    v
  Child  Child  Child  Child  Child
  SD 1   SD 2   SD 3   SD 4   SD 5
  (Auth) (UI)  (API)  (DB)   (Test)
```

**Why orchestrator + children pattern**:
- Matches existing LEO Protocol patterns for multi-item work
- Each child goes through independent LEAD -> PLAN -> EXEC
- Children can be worked in parallel where dependencies allow
- Sprint-level tracking via orchestrator completion
- Individual feature tracking via child SDs

**SD creation flow**:

```
1. Stage 18 template produces sprint plan with feature list
2. Lifecycle-to-SD Bridge receives the sprint plan
3. Bridge creates orchestrator SD for the sprint
4. Bridge iterates over features, creating child SDs
5. Each child SD is created via leo-create-sd.js
6. SDs receive venture namespace prefix
7. Standard LEO workflow begins for each child
```

### Idempotency Requirements

The bridge MUST be idempotent -- running it twice with the same sprint plan must NOT create duplicate SDs.

**How idempotency is enforced**:

```
Before creating any SD:
    1. Query strategic_directives_v2 for existing SD with same:
       - sd_key (includes venture prefix + suffix)
       - parent_sd_id
    2. If found:
       - Skip creation
       - Log: "SD already exists: SD-ACME-FEAT-SPRINT-001"
    3. If not found:
       - Create via leo-create-sd.js
       - Log: "Created SD: SD-ACME-FEAT-SPRINT-001"
```

**Why idempotency matters**:
- Eva may re-process Stage 18 after a crash or context compaction
- The Chairman may ask Eva to re-run Stage 18 with updated sprint plan
- Multiple sessions may attempt to process the same stage
- Without idempotency, duplicate SDs would pollute the queue

### Full LEO SD Workflow Requirement

Chairman Decision D06 explicitly requires that EVERY sprint item goes through the full LEAD -> PLAN -> EXEC workflow. No shortcuts.

```
Option A: Create SDs in EXEC phase directly (skip LEAD + PLAN)
  + Faster
  - No PRD created
  - No design review
  - No approval gate
  - Skips sub-agent checks

Option B: Full LEAD -> PLAN -> EXEC for everything     <-- CHOSEN
  + PRD created for each feature
  + Design review via DESIGN sub-agent
  + LEAD approval before implementation
  + Full sub-agent coverage (QA, Security, etc.)
  - Slower per feature
  - More overhead
```

The Chairman chose the full workflow because the overhead is small compared to the cost of implementing the wrong thing. Every sprint item benefits from:
- A PRD that clarifies requirements
- Design review that catches architectural issues
- LEAD approval that ensures alignment with venture goals
- Sub-agent checks that catch quality/security issues

### Files Affected

- Bridge module: `lib/eva/lifecycle-sd-bridge.js`
- SD creation: `scripts/leo-create-sd.js`
- SD key generation: `scripts/modules/sd-key-generator.js`
- Venture context: `lib/eva/venture-context-manager.js`

---

## Decision Traceability

All Chairman Decisions are recorded in the SD hierarchy's metadata:

```
SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001
  metadata.chairman_decisions = [
    "D01: Filter Engine (not Prediction) - deterministic risk thresholds",
    "D02: Always-on Reality Gates - deployed artifacts required",
    "D03: Lightweight Dashboard - read-only web companion",
    "D04: Model-isolated Devil's Advocate - GPT-4o via LLM client factory",
    "D05: Natural negative data - wait for organic rejections",
    "D06: Full LEO SDs - LEAD->PLAN->EXEC for everything"
  ]
```

Note: The metadata labels D03 as "Lightweight Dashboard" and D05 as "Natural negative data" -- these refer to broader Chairman decisions that also influenced the preference scoping (D03 in this document) and Devil's Advocate model isolation (D05 in this document) decisions. The numbering in this document reflects the design decision ordering, not the metadata ordering.

## Decision Relationship Diagram

```
D01: Filter Engine Design
  |
  +-- Governs --> Decision Filter Engine
  |                    |
  |                    +-- Uses --> D03: Chairman Preferences
  |                    |              (scoped resolution)
  |                    |
  |                    +-- Uses --> D06: Bridge Design
  |                                  (SD creation from sprint)
  |
D02: Reality Gate Placement
  |
  +-- Governs --> Reality Gates
  |                (fail-closed, not configurable)
  |
D04: Kill Gate Thresholds
  |
  +-- Uses --> D01: Filter Engine
  |              (threshold evaluation)
  |
  +-- Uses --> D03: Chairman Preferences
  |              (threshold customization)
  |
  +-- Uses --> D05: Devil's Advocate
                 (adversarial review at gates)
```

All 6 decisions are interconnected. The Filter Engine (D01) is central because it evaluates thresholds (D04) using Chairman preferences (D03) at boundaries defined by Reality Gates (D02), with adversarial review from the Devil's Advocate (D05). The Bridge (D06) creates the SDs that eventually produce stage outputs that the Filter Engine evaluates.
