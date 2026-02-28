
## Table of Contents

- [Architecture](#architecture)
- [Evaluation Order and Short-Circuit Behavior](#evaluation-order-and-short-circuit-behavior)
- [Trigger 1: cost_threshold](#trigger-1-cost_threshold)
  - [Configuration](#configuration)
  - [Input Data Source](#input-data-source)
  - [Evaluation Logic](#evaluation-logic)
  - [When This Trigger Fires](#when-this-trigger-fires)
  - [Chairman Override Capability](#chairman-override-capability)
- [Trigger 2: new_tech_vendor](#trigger-2-new_tech_vendor)
  - [Configuration](#configuration)
  - [Input Data Source](#input-data-source)
  - [Evaluation Logic](#evaluation-logic)
  - [When This Trigger Fires](#when-this-trigger-fires)
  - [Chairman Override Capability](#chairman-override-capability)
  - [Integration with Stage 13](#integration-with-stage-13)
- [Trigger 3: strategic_pivot](#trigger-3-strategic_pivot)
  - [Configuration](#configuration)
  - [Input Data Source](#input-data-source)
  - [Evaluation Logic](#evaluation-logic)
  - [When This Trigger Fires](#when-this-trigger-fires)
  - [Chairman Override Capability](#chairman-override-capability)
  - [Why This Trigger Is Not Configurable](#why-this-trigger-is-not-configurable)
- [Trigger 4: low_score](#trigger-4-low_score)
  - [Configuration](#configuration)
  - [Input Data Source](#input-data-source)
  - [Evaluation Logic](#evaluation-logic)
  - [Score Interpretation](#score-interpretation)
  - [When This Trigger Fires](#when-this-trigger-fires)
  - [Chairman Override Capability](#chairman-override-capability)
- [Trigger 5: novel_pattern](#trigger-5-novel_pattern)
  - [Configuration](#configuration)
  - [Input Data Source](#input-data-source)
  - [Evaluation Logic](#evaluation-logic)
  - [When This Trigger Fires](#when-this-trigger-fires)
  - [Why Not Configurable](#why-not-configurable)
  - [Relationship to cross-venture-learning.js](#relationship-to-cross-venture-learningjs)
  - [Implementation](#implementation)
- [Trigger 6: constraint_drift](#trigger-6-constraint_drift)
  - [Configuration](#configuration)
  - [Input Data Source](#input-data-source)
  - [Evaluation Logic](#evaluation-logic)
  - [Drift Severity Levels](#drift-severity-levels)
  - [When This Trigger Fires](#when-this-trigger-fires)
  - [Chairman Override Capability](#chairman-override-capability)
  - [Integration with constraint-drift-detector.js](#integration-with-constraint-drift-detectorjs)
- [Trigger Interaction Matrix](#trigger-interaction-matrix)
- [Filter Engine Result Contract](#filter-engine-result-contract)
- [Implementation](#implementation)

---
Category: Reference
Status: Approved
Version: 1.0.0
Author: DOCMON Sub-Agent
Last Updated: 2026-02-08
Tags: [cli-venture-lifecycle, eva, reference, filter-triggers, decision-filter]
Related SDs: [SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-001, SD-LEO-INFRA-FILTER-ENGINE-001]
---

# Decision Filter Triggers Reference

The Decision Filter Engine is a deterministic risk-threshold engine that decides whether a stage outcome should auto-proceed or be presented to the Chairman for review. It uses 6 trigger types evaluated in fixed order. This design was established by Chairman Decision D01: "Filter Engine, not Prediction Engine" -- all evaluations are rule-based, not ML-based.

## Architecture

```
Stage Output (from Eva Orchestrator)
         |
         v
+---------------------+
|  Decision Filter     |
|  Engine              |
|                      |
|  evaluateDecision()  |
|                      |
|  Input:              |
|  - stageOutput       |
|  - chairmanPrefs     |
|  - ventureContext    |
|                      |
|  Evaluates 6         |
|  triggers in order   |
|                      |
|  Output:             |
|  {                   |
|    auto_proceed,     |
|    triggers[],       |
|    recommendation    |
|  }                   |
+---------------------+
         |
    auto_proceed?
    |           |
   true        false
    |           |
    v           v
  Continue    Chairman
  to next     reviews
  stage       decision
```

## Evaluation Order and Short-Circuit Behavior

All 6 triggers are always evaluated regardless of earlier results. The engine collects ALL fired triggers into the result array so the Chairman sees the complete picture when reviewing.

```
Trigger #   Type               Result
--------    ----               ------
   1        cost_threshold     PASS or FIRE
   2        new_tech_vendor    PASS or FIRE
   3        strategic_pivot    PASS or FIRE
   4        low_score          PASS or FIRE
   5        novel_pattern      PASS or FIRE
   6        constraint_drift   PASS or FIRE

auto_proceed = (no triggers fired)
triggers = [list of all fired triggers]
```

The fixed evaluation order exists for determinism and auditability -- the same inputs always produce the same output regardless of runtime conditions.

---

## Trigger 1: cost_threshold

**Purpose**: Flag stage outputs where estimated cost exceeds the Chairman's maximum cost preference.

### Configuration

| Parameter | Value |
|-----------|-------|
| Preference key | `filter.cost_max_usd` |
| Default value | 10,000 USD |
| Data type | number |
| Chairman override | Yes |
| Scope | Per-venture or global |

### Input Data Source

The cost value comes from the stage template's output:

```
stageOutput.cost --> numeric value in USD
```

Stage templates are responsible for estimating cost based on their specific domain:
- Infrastructure stages: Cloud resource costs
- Development stages: Development effort costs
- Marketing stages: Campaign budget costs
- Launch stages: Infrastructure + operational costs

### Evaluation Logic

```
IF stageOutput.cost > chairmanPrefs.filter.cost_max_usd
THEN trigger fires
ELSE trigger passes
```

### When This Trigger Fires

- The Chairman is presented with the cost breakdown
- Chairman can approve (proceed), request cost reduction (revise), or kill
- Common at stages involving infrastructure provisioning (17, 22) or marketing budget (11)

### Chairman Override Capability

The Chairman can set different cost thresholds per venture:

| Level | Preference | Effect |
|-------|-----------|--------|
| Global | `filter.cost_max_usd = 10000` | Default for all ventures |
| Venture-specific | `filter.cost_max_usd = 50000` (for venture X) | Higher threshold for enterprise ventures |

This allows conservative defaults with per-venture exceptions.

---

## Trigger 2: new_tech_vendor

**Purpose**: Flag when a stage recommends technology or vendors not on the Chairman's approved list. Prevents surprise technology dependencies.

### Configuration

| Parameter | Value |
|-----------|-------|
| Preference key | `filter.approved_technologies` |
| Default value | `[]` (empty -- all technologies trigger review) |
| Data type | array of strings |
| Chairman override | Yes |
| Scope | Per-venture or global |

### Input Data Source

Two fields from the stage template output:

```
stageOutput.technologies --> array of technology names (e.g., ["React", "PostgreSQL"])
stageOutput.vendors       --> array of vendor names (e.g., ["AWS", "Stripe"])
```

### Evaluation Logic

```
FOR EACH technology in stageOutput.technologies:
    IF technology NOT IN chairmanPrefs.filter.approved_technologies
    THEN trigger fires with unknown_tech = technology

FOR EACH vendor in stageOutput.vendors:
    IF vendor NOT IN chairmanPrefs.filter.approved_technologies
    THEN trigger fires with unknown_vendor = vendor
```

Note: Technologies and vendors are checked against the same approved list.

### When This Trigger Fires

- Most commonly fires at Stage 13 (Tech Stack Evaluation)
- Can also fire at any stage that recommends tools, libraries, or services
- The Chairman is presented with the unknown technology/vendor and its rationale
- Chairman can approve (adding to the approved list), request alternative, or reject

### Chairman Override Capability

The Chairman pre-approves technologies to reduce friction:

```
Approved technologies example:
[
  "React", "Next.js", "Node.js", "PostgreSQL", "Supabase",
  "AWS", "Vercel", "Stripe", "SendGrid", "Sentry"
]
```

When the approved list is empty (default), ALL technology mentions trigger review. This is conservative by design -- the Chairman builds the approved list over time as they gain confidence.

### Integration with Stage 13

Stage 13 (Tech Stack) is the primary consumer of this trigger. The tech stack evaluation produces a list of recommended technologies that are cross-referenced against the approved list. Unknown technologies are flagged even if the tech stack viability score passes the Kill Gate 13 threshold.

```
Tech Stack Evaluation (Stage 13)
         |
    +----+----+
    |         |
Kill Gate 13  Filter Trigger 2
(viability    (approved tech
 score >= 3)   list check)
    |              |
    v              v
Passes kill    May still flag
gate check     unknown tech
```

---

## Trigger 3: strategic_pivot

**Purpose**: Detect when a venture's direction has fundamentally shifted from its original vision, indicating a strategic pivot that the Chairman should review.

### Configuration

| Parameter | Value |
|-----------|-------|
| Configurable | No (automatic comparison) |
| Data type | -- |
| Chairman override | No |
| Scope | Per-venture (always) |

### Input Data Source

Two sources are compared:

```
Baseline: venture_artifacts WHERE lifecycle_stage = 1
    --> Stage 1 (Draft Idea) original vision
    --> problem_statement, target_market, value_proposition

Current: stageOutput
    --> Current stage's analysis
    --> market_position, value_proposition, target_market
```

### Evaluation Logic

The engine compares the current stage output against the Stage 1 baseline across three dimensions:

```
1. Target Market: Has the primary customer segment changed?
2. Value Proposition: Has the core value offering shifted?
3. Market Position: Has the competitive positioning strategy changed?

IF any dimension shows fundamental change
THEN trigger fires with pivot_details
```

This comparison is keyword-based and structural, not AI-based. It checks for:
- Different industry/segment keywords
- Changed value proposition structure
- New competitive positioning terms

### When This Trigger Fires

- Can fire at any stage, but most common during:
  - Stage 8 (Business Model Canvas) -- when the BMC reveals a different model than intended
  - Stage 11 (Go-to-Market) -- when market strategy diverges from original target
  - Stage 13 (Tech Stack) -- when technical choices force a pivot
  - Stage 25 (Scale Planning) -- when growth plans shift the core proposition

### Chairman Override Capability

Not configurable. Strategic pivots always trigger Chairman review because they represent fundamental directional changes that affect all downstream work.

### Why This Trigger Is Not Configurable

Strategic pivots are rare but high-impact events. Making this trigger configurable could allow pivots to slip through unnoticed, leading to ventures that drift far from their original thesis without Chairman awareness. The cost of a false positive (Chairman reviews a non-pivot) is low compared to a false negative (pivot goes unnoticed).

---

## Trigger 4: low_score

**Purpose**: Flag stage outputs where the AI's confidence score is below the minimum threshold, indicating uncertainty in the analysis.

### Configuration

| Parameter | Value |
|-----------|-------|
| Preference key | `filter.min_score_threshold` |
| Default value | 6 (out of 10) |
| Data type | number |
| Chairman override | Yes |
| Scope | Per-venture or global |

### Input Data Source

```
stageOutput.score --> numeric value 0-10
```

Every stage template produces a score (0-10) reflecting the AI's confidence in its analysis. Higher scores indicate more confidence, better data quality, or stronger conclusions.

### Evaluation Logic

```
IF stageOutput.score < chairmanPrefs.filter.min_score_threshold
THEN trigger fires
ELSE trigger passes
```

### Score Interpretation

```
Score     Confidence     Typical Action
 9-10     Very High      Auto-proceed likely
 7-8      High           Auto-proceed likely
 6        Moderate       Borderline (at default threshold)
 4-5      Low            Chairman review recommended
 1-3      Very Low       Chairman review required
 0        No Confidence  May indicate data insufficiency
```

### When This Trigger Fires

- Commonly fires when the LLM has insufficient data to make a strong assessment
- Fires at early stages (1-3) when the venture idea is vague
- Fires at research stages (4, 6) when competitive/risk data is sparse

### Chairman Override Capability

| Setting | Effect |
|---------|--------|
| Raise threshold (e.g., 8) | More conservative -- Chairman reviews more often |
| Lower threshold (e.g., 4) | More permissive -- only very low confidence triggers review |
| Set to 0 | Effectively disables this trigger |
| Set to 10 | All stages trigger review (maximum oversight) |

---

## Trigger 5: novel_pattern

**Purpose**: Flag when a venture enters territory with no historical precedent in the cross-venture learning database. Novel patterns warrant extra Chairman scrutiny because there is no prior data to inform expectations.

### Configuration

| Parameter | Value |
|-----------|-------|
| Configurable | No (automatic cross-reference) |
| Data type | -- |
| Chairman override | No |
| Scope | Cross-venture (all venture history) |

### Input Data Source

```
stageOutput --> Current stage analysis
cross-venture-learning.js patterns --> Historical venture patterns
```

The engine queries the cross-venture learning module for similar patterns:
- Industry/segment combinations
- Business model types
- Technology stack choices
- Market size ranges
- Revenue model types

### Evaluation Logic

```
patterns = crossVentureLearning.findSimilarPatterns(stageOutput)

IF patterns.length === 0
THEN trigger fires (no precedent)
ELSE trigger passes (precedent exists)
```

### When This Trigger Fires

- Fires when a venture is in an industry/segment with no prior ventures
- Fires when a novel business model is proposed
- Fires when an unusual technology combination is chosen
- Does NOT fire for the first 5 ventures (insufficient data baseline)

### Why Not Configurable

Novel patterns represent genuine unknowns. The cost of Chairman review for novel patterns is low, and the benefit of human judgment on uncharted territory is high. Making this configurable could lead to ventures in unknown territory proceeding without adequate oversight.

### Relationship to cross-venture-learning.js

The novel_pattern trigger depends on the cross-venture learning module having sufficient data:

```
Venture Count     Novel Pattern Behavior
  0-4              Trigger disabled (insufficient baseline)
  5-9              Conservative matching (more triggers)
  10+              Stable matching (fewer false triggers)
```

### Implementation

- Pattern lookup: `lib/eva/cross-venture-learning.js`
- Query: Searches `venture_artifacts` across all completed ventures
- Match criteria: Industry, model type, tech stack, market size

---

## Trigger 6: constraint_drift

**Purpose**: Detect when current stage analysis contradicts assumptions established in earlier stages. Constraint drift indicates that foundational assumptions may no longer hold, requiring Chairman review.

### Configuration

| Parameter | Value |
|-----------|-------|
| Preference key | `filter.max_drift_severity` |
| Default value | `HIGH` |
| Data type | string (NONE, LOW, MEDIUM, HIGH) |
| Chairman override | Yes |
| Scope | Per-venture or global |

### Input Data Source

```
constraintDriftDetector.analyze(stageOutput, ventureId)
    --> { severity: 'NONE'|'LOW'|'MEDIUM'|'HIGH', drifts: [...] }
```

The constraint drift detector compares:
- Stage 1-5 assumptions (THE TRUTH baseline)
- Current stage output assertions
- Identifies contradictions or significant changes

### Evaluation Logic

```
severity_order = { 'NONE': 0, 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3 }

driftResult = constraintDriftDetector.analyze(stageOutput, ventureId)

IF severity_order[driftResult.severity] >= severity_order[threshold]
THEN trigger fires
ELSE trigger passes
```

### Drift Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| NONE | No drift detected | All assumptions hold |
| LOW | Minor parameter changes | Revenue projections adjusted by < 20% |
| MEDIUM | Significant assumptions changed | Target market segment shifted |
| HIGH | Foundational contradictions | Original problem statement no longer valid |

### When This Trigger Fires

- Most commonly fires at later stages (15+) when implementation reveals issues with early assumptions
- Stage 25 explicitly runs a constraint drift check against Stage 1
- Can fire at any stage when the drift detector finds contradictions

### Chairman Override Capability

| Setting | Effect |
|---------|--------|
| `HIGH` (default) | Only fires on high-severity drift (most permissive) |
| `MEDIUM` | Fires on medium and high severity |
| `LOW` | Fires on low, medium, and high severity |
| `NONE` | Fires on any detected drift (maximum sensitivity) |

### Integration with constraint-drift-detector.js

The constraint drift detector (`lib/eva/constraint-drift-detector.js`) is a separate module that:

1. Loads baseline assumptions from `assumption_sets` table (populated during stages 1-5)
2. Compares current stage output against baseline
3. Returns severity level and specific drifts found
4. Drift details include: which assumption changed, old value, new value, impact assessment

```
assumption_sets table
         |
         v
+------------------------+
| Constraint Drift       |
| Detector               |
|                        |
| Baseline assumptions   |
| from stages 1-5        |
|         vs             |
| Current stage output   |
|                        |
| Result:                |
| { severity, drifts[] } |
+------------------------+
         |
         v
Decision Filter Engine
(trigger 6 evaluation)
```

---

## Trigger Interaction Matrix

Multiple triggers can fire simultaneously. When this happens, the Chairman sees all fired triggers:

```
Example: Stage 13 (Tech Stack) evaluation

Trigger 1: cost_threshold    --> FIRE (infrastructure cost = $25,000)
Trigger 2: new_tech_vendor   --> FIRE (unknown vendor: "Neon")
Trigger 3: strategic_pivot   --> PASS
Trigger 4: low_score         --> PASS (score = 7)
Trigger 5: novel_pattern     --> PASS (SaaS precedent exists)
Trigger 6: constraint_drift  --> FIRE (tech stack contradicts Stage 1 "simple" constraint)

Result: {
  auto_proceed: false,
  triggers: ['cost_threshold', 'new_tech_vendor', 'constraint_drift'],
  recommendation: 'Review: 3 triggers fired (cost, unknown tech, constraint drift)'
}
```

## Filter Engine Result Contract

The Decision Filter Engine returns a consistent result object:

```
{
  auto_proceed: boolean,          // true = no triggers fired, safe to continue
  triggers: string[],             // list of fired trigger names
  trigger_details: {              // per-trigger details
    cost_threshold: {
      actual: number,
      threshold: number
    },
    new_tech_vendor: {
      unknown_technologies: string[],
      unknown_vendors: string[]
    },
    strategic_pivot: {
      dimensions_changed: string[],
      pivot_details: string
    },
    low_score: {
      actual: number,
      threshold: number
    },
    novel_pattern: {
      search_criteria: object,
      patterns_found: number
    },
    constraint_drift: {
      severity: string,
      drifts: object[]
    }
  },
  recommendation: string,         // human-readable summary
  evaluated_at: string             // ISO 8601 timestamp
}
```

## Implementation

- Filter engine: `lib/eva/decision-filter-engine.js`
- Entry point: `evaluateDecision(stageOutput, chairmanPreferences, ventureContext)`
- Chairman preferences: `lib/eva/chairman-preference-store.js`
- Cross-venture patterns: `lib/eva/cross-venture-learning.js`
- Constraint drift: `lib/eva/constraint-drift-detector.js`
- Decision recording: Results stored in `chairman_decisions.filter_engine_result` when Chairman review occurs
