---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 25 "Venture Review" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Venture Decision](#3-venture-decision)
  - [4. Drift Detection Enhancement](#4-drift-detection-enhancement)
  - [5. Initiative Status](#5-initiative-status)
  - [6. Financial Comparison](#6-financial-comparison)
  - [7. Venture Health Score](#7-venture-health-score)
  - [8. Next Steps Enhancement](#8-next-steps-enhancement)
  - [9. Scale Planning](#9-scale-planning)
  - [10. CLI Superiorities (preserve these)](#10-cli-superiorities-preserve-these)
  - [11. Recommended Stage 25 Schema](#11-recommended-stage-25-schema)
  - [12. Minimum Viable Change (Priority-Ordered)](#12-minimum-viable-change-priority-ordered)
  - [13. Cross-Stage Impact](#13-cross-stage-impact)
  - [14. Dependency Conflicts (with Stages 1-24 decisions)](#14-dependency-conflicts-with-stages-1-24-decisions)
  - [15. Contrarian Take](#15-contrarian-take)

> Independent response to the Stage 25 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| analysisStep missing | N/A | None | **5 Critical** | Stage 25 is the capstone. It should synthesize the ENTIRE 25-stage journey. Without an analysisStep, the user manually reviews everything. The CLI has 24 stages of data and doesn't use any of it. | ADD | This is the most complex analysisStep in the pipeline. It must synthesize selectively, not dump 24 stages of data. |
| No venture decision | ADVANCE/REVISE/REJECT (in viewer) | None | **5 Critical** | The MOST IMPORTANT missing output. After 25 stages, the pipeline produces no decision about the venture's future. "What happens next?" has no answer. This is like running a trial without a verdict. | ADD | This is the single most impactful change in the entire 25-stage analysis. |
| Drift detection is simplistic | N/A | Word overlap (<30% = drift) | **3 Medium** | Word overlap misses semantic drift. A venture that pivots from "AI-powered recipe generator" to "Machine learning culinary assistant" shows 0% word overlap but 100% semantic alignment. | ENHANCE | Semantic analysis via analysisStep LLM call. Word overlap is a useful heuristic but insufficient alone. |
| Initiative status free text | N/A | Free text string | **3 Medium** | Can't aggregate initiative outcomes. "done", "completed", "finished" all mean the same thing but can't be programmatically compared. | ENUM | planned/in_progress/completed/abandoned/deferred. Matches the task lifecycle pattern used throughout BUILD LOOP. |
| No financial comparison | Revenue forecasting (3 scenarios) | None | **4 High** | Stage 5 projected profitability. Stage 16 projected financials. Stage 24 measured revenue. Stage 25 should compare projected vs actual. This is the venture's financial truth. | ADD | The comparison IS the learning. Without it, projections were academic exercises. |
| No venture health score | Composite score + confidence | None | **3 Medium** | Stage 25 produces text review but no quantified health. Hard to compare venture health across sprints or ventures. | ADD | Derive from AARRR health (Stage 24) + financial comparison + initiative completion. |
| next_steps timeline free text | Scale milestones with dates | Free text | **2 Low** | "Q2 2026" vs "next month" vs "soon" -- inconsistent. | FIX | Add priority enum. Keep timeline as text (too varied for date validation: "Q2", "next sprint", "6 months"). |
| No scale planning | Scale readiness assessment, growth projections, market expansion | None | **2 Low** | Scale planning is forward-looking strategy. Stage 25 is retrospective review. Different concerns. | SKIP | Scale planning belongs in the NEXT venture iteration's Stage 13 (Product Roadmap) or Stage 17 (Pre-Build Checklist), not in the current iteration's final review. |
| No all-stages summary | Final review across all 25 stages | None | **4 High** | Stage 25 has no summary of the full pipeline journey. Each stage exists in isolation. | ADD (via analysisStep) | The analysisStep should produce a pipeline summary, not a separate field. |

### 2. AnalysisStep Design

**Input (from ALL prior stages -- the entire venture journey)**:

This is the most comprehensive analysisStep in the pipeline. It selectively synthesizes 24 stages.

**Key inputs by phase**:
- THE TRUTH (1-5): venture_name, elevator_pitch, market validation score, competitive intensity, profitability projections (ROI, unit economics)
- THE ENGINE (6-9): risk score, pricing model, business model canvas, exit strategy
- THE IDENTITY (10-12): brand, go-to-market strategy, sales logic
- THE BLUEPRINT (13-16): product roadmap, technical architecture, resource plan, financial projections
- THE BUILD LOOP (17-22): sprint summary, quality assessment, review decision, release readiness
- LAUNCH & LEARN (23-24): launch type, kill gate result, AARRR metrics, success criteria evaluation, learnings

**Process (single LLM call)**:

1. **Venture Journey Summary**: Synthesize the 25-stage journey into a narrative. Key milestones, gate results (3 kill gates at Stages 3, 5, 23; 2 reality gates at 9, 12; 1 promotion gate at 16, 22). What survived? What changed?

2. **Financial Truth**: Compare Stage 5 profitability projections and Stage 16 financial projections against Stage 24's actual revenue metrics. Projected ROI vs actual. Projected unit economics vs actual.

3. **Drift Analysis**: Semantic comparison of Stage 1 vision/pitch against Stage 25 current_vision. Go beyond word overlap -- assess whether the venture's INTENT drifted, not just its vocabulary. Use Stage 8 (BMC), Stage 11 (GTM), and Stage 13 (Roadmap) as intermediate drift checkpoints.

4. **Venture Health Assessment**: Compute health across 5 dimensions:
   - Product Health: Stage 24 activation + retention metrics
   - Market Health: Stage 24 acquisition metrics + Stage 3 market validation
   - Technical Health: Stage 20 quality + Stage 21 review + Stage 14 architecture
   - Financial Health: Stage 24 revenue metrics vs Stage 5/16 projections
   - Team Health: Stage 15 resource plan completion, sprint velocity trends

5. **Venture Decision Recommendation**: Based on all signals, recommend: continue (strong signals), pivot (mixed -- some dimensions healthy, others not), expand (all dimensions strong, growth opportunities), sunset (weak across dimensions), or exit (strong enough for acquisition/partnership).

**Output**: venture_journey_summary, financial_comparison, drift_analysis, venture_health, venture_decision_recommendation.

### 3. Venture Decision

**The most important addition to the entire 25-stage pipeline.**

```javascript
venture_decision: {
  type: 'object', required: true,
  properties: {
    decision: {
      type: 'enum',
      values: ['continue', 'pivot', 'expand', 'sunset', 'exit'],
      required: true,
    },
    rationale: { type: 'string', required: true },
    confidence: { type: 'enum', values: ['high', 'medium', 'low'], required: true },
    key_factors: { type: 'array', items: { type: 'string' } },
  },
}
```

**Decision meanings**:
- **continue**: Venture is on track. Next iteration of BUILD LOOP with current strategy.
- **pivot**: Some dimensions are working, others aren't. Change strategy (market, product, or business model) and re-enter BUILD LOOP.
- **expand**: All dimensions are strong. Scale to new markets, products, or segments. Feeds into next iteration's Stage 13.
- **sunset**: Venture isn't working and unlikely to improve. Graceful wind-down.
- **exit**: Venture is strong enough for acquisition, partnership, or IPO. Aligns with Stage 9's exit strategy.

**This decision is human-made but AI-informed.** The analysisStep recommends; the user decides.

### 4. Drift Detection Enhancement

**Enhance drift detection in two ways:**

1. **Semantic drift via analysisStep**: The LLM compares Stage 1 vision/pitch against Stage 25 current_vision semantically. Word overlap is a supplement, not the primary method.

2. **Keep detectDrift() as a fast heuristic**: The existing word-overlap function remains as a quick signal. It's cheap, deterministic, and catches obvious drift. But the analysisStep provides the authoritative assessment.

```javascript
drift_check: {
  type: 'object', derived: true,
  properties: {
    word_overlap_pct: { type: 'number' },          // Existing heuristic
    word_overlap_drift: { type: 'boolean' },        // Existing: overlap < 30%
    semantic_drift: { type: 'string' },             // NEW: from analysisStep (aligned/minor_drift/significant_drift)
    drift_trajectory: { type: 'array' },            // NEW: intermediate drift points (Stages 8, 11, 13)
    rationale: { type: 'string' },                  // Enhanced: from analysisStep
    original_vision: { type: 'string' },
    current_vision: { type: 'string' },
  },
}
```

### 5. Initiative Status

**Change to enum.**

```javascript
initiatives[].status: {
  type: 'enum',
  values: ['planned', 'in_progress', 'completed', 'abandoned', 'deferred'],
  required: true,
}
```

Five statuses covering the full lifecycle:
- **planned**: Not yet started
- **in_progress**: Currently active
- **completed**: Successfully delivered
- **abandoned**: Dropped (capture why in outcome)
- **deferred**: Pushed to next iteration

### 6. Financial Comparison

**Add projected-vs-actual financial comparison.**

```javascript
financial_comparison: {
  type: 'object', derived: true,
  properties: {
    stage5_projections: {
      roi_projected: { type: 'number' },
      cac_projected: { type: 'number' },
      ltv_projected: { type: 'number' },
    },
    stage24_actuals: {
      revenue_metrics: { type: 'object' },        // From AARRR revenue category
    },
    variance: {
      roi_variance_pct: { type: 'number' },
      unit_economics_assessment: { type: 'string' },  // From analysisStep
    },
    accuracy_score: { type: 'number' },              // How close were projections to actuals
  },
}
```

This is the financial truth: did the venture perform as projected? The variance data informs the venture_decision. Large negative variance + weak metrics → consider sunset. Large positive variance → consider expand.

### 7. Venture Health Score

**Derive a 5-dimension health score.**

```javascript
venture_health: {
  type: 'object', derived: true,
  properties: {
    product: { type: 'number', min: 0, max: 100 },    // From Stage 24 activation + retention
    market: { type: 'number', min: 0, max: 100 },     // From Stage 24 acquisition + Stage 3
    technical: { type: 'number', min: 0, max: 100 },   // From Stage 20/21 quality + review
    financial: { type: 'number', min: 0, max: 100 },   // From Stage 24 revenue vs projections
    team: { type: 'number', min: 0, max: 100 },        // From Stage 15 + sprint velocity
    overall: { type: 'number', min: 0, max: 100 },     // Weighted average
    assessment: { type: 'enum', values: ['healthy', 'mixed', 'at_risk', 'critical'] },
  },
}
```

The health score provides a quantified snapshot for venture portfolio comparison and for informing the venture_decision.

### 8. Next Steps Enhancement

**Add priority. Keep timeline as text.**

```javascript
next_steps: {
  type: 'array', minItems: 1,
  items: {
    action: { type: 'string', required: true },
    owner: { type: 'string', required: true },
    timeline: { type: 'string', required: true },
    priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },  // NEW
    category: { type: 'enum', values: ['product', 'market', 'technical', 'financial', 'team'] },  // NEW
  },
}
```

Priority helps focus. Category links next_steps to the 5 review dimensions. Timeline remains text because it's too varied for ISO date validation ("Q2 2026", "next sprint", "within 6 months").

### 9. Scale Planning

**Do NOT add scale planning to Stage 25.**

Stage 25 is retrospective: "How did the venture do?" Scale planning is prospective: "How do we grow?" These are different activities.

Scale planning belongs in the NEXT iteration:
- Stage 13 (Product Roadmap): expansion plans, new markets
- Stage 17 (Pre-Build Checklist): scale readiness checks
- Stage 18 (Sprint Planning): scaling sprints

The venture_decision at Stage 25 determines WHETHER to scale (expand decision). The HOW belongs in the next BUILD LOOP.

### 10. CLI Superiorities (preserve these)

- **detectDrift()**: Pure function drift detection. Unique to CLI -- no other venture tool does this. The word-overlap heuristic is simple but valuable as a fast signal.
- **5-category initiative structure**: product/market/technical/financial/team covers the full venture dimension space. Well-chosen.
- **Prerequisites parameter in computeDerived()**: Stage 25 already accepts stage01 prerequisites for drift detection. This pattern supports the financial comparison and health score (accepting stage05, stage24, etc.).
- **Drift justification requirement**: If drift is detected, the user must justify it. This captures intentional pivots vs unintentional drift.

### 11. Recommended Stage 25 Schema

```javascript
const TEMPLATE = {
  id: 'stage-25',
  slug: 'venture-review',
  title: 'Venture Review',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    review_summary: { type: 'string', minLength: 20, required: true },
    current_vision: { type: 'string', minLength: 10, required: true },
    drift_justification: { type: 'string' },  // Required if drift_detected

    // === Updated: initiatives with status enum ===
    initiatives: {
      type: 'object', required: true,
      properties: {
        product: { type: 'array', minItems: 1, items: { title, status: enum, outcome } },
        market: { type: 'array', minItems: 1, items: { title, status: enum, outcome } },
        technical: { type: 'array', minItems: 1, items: { title, status: enum, outcome } },
        financial: { type: 'array', minItems: 1, items: { title, status: enum, outcome } },
        team: { type: 'array', minItems: 1, items: { title, status: enum, outcome } },
      },
    },

    // === NEW: venture decision ===
    venture_decision: {
      type: 'object', required: true,
      properties: {
        decision: { type: 'enum', values: ['continue', 'pivot', 'expand', 'sunset', 'exit'], required: true },
        rationale: { type: 'string', required: true },
        confidence: { type: 'enum', values: ['high', 'medium', 'low'], required: true },
        key_factors: { type: 'array', items: { type: 'string' } },
      },
    },

    // === Updated: next steps with priority + category ===
    next_steps: {
      type: 'array', minItems: 1,
      items: {
        action: { type: 'string', required: true },
        owner: { type: 'string', required: true },
        timeline: { type: 'string', required: true },
        priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },
        category: { type: 'enum', values: ['product', 'market', 'technical', 'financial', 'team'] },
      },
    },

    // === Existing derived (unchanged) ===
    total_initiatives: { type: 'number', derived: true },
    all_categories_reviewed: { type: 'boolean', derived: true },
    drift_detected: { type: 'boolean', derived: true },

    // === Updated: drift check with semantic analysis ===
    drift_check: {
      type: 'object', derived: true,
      properties: {
        word_overlap_pct: { type: 'number' },
        word_overlap_drift: { type: 'boolean' },
        semantic_drift: { type: 'string' },         // From analysisStep
        drift_trajectory: { type: 'array' },         // Intermediate checkpoints
        rationale: { type: 'string' },
        original_vision: { type: 'string' },
        current_vision: { type: 'string' },
      },
    },

    // === NEW: derived ===
    venture_health: { type: 'object', derived: true },          // 5-dimension health score
    financial_comparison: { type: 'object', derived: true },     // Projected vs actual
    provenance: { type: 'object', derived: true },
  },
};
```

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `venture_decision`** (continue/pivot/expand/sunset/exit). THE most important output of the entire 25-stage pipeline. Without a decision, the lifecycle produces no verdict.

2. **P0: Add `analysisStep` synthesizing the full venture journey.** Venture summary, financial comparison, drift analysis, health assessment, decision recommendation. The capstone synthesis.

3. **P1: Add `financial_comparison` derived field.** Stage 5/16 projections vs Stage 24 actuals. The financial truth.

4. **P1: Add `venture_health` derived field.** 5-dimension health score (product/market/technical/financial/team). Quantified assessment.

5. **P1: Change initiative status to enum.** planned/in_progress/completed/abandoned/deferred.

6. **P2: Enhance drift detection with semantic analysis via analysisStep.** Keep word-overlap as heuristic, add semantic assessment.

7. **P2: Add priority + category to next_steps.** Enables focus and dimension alignment.

8. **P3: Do NOT add scale planning** (belongs in next iteration's BUILD LOOP).
9. **P3: Do NOT add all-stages summary as separate field** (analysisStep generates this).

### 13. Cross-Stage Impact

| Change | Stage 1-24 (All Prior) | Future Iterations | Overall Pipeline |
|--------|----------------------|-------------------|-----------------|
| Venture decision | All 24 stages feed into the final decision. Every gate, every metric, every learning contributes. | The decision determines what happens next: continue → new BUILD LOOP. Pivot → revisit ENGINE/IDENTITY. Exit → venture lifecycle complete. | The pipeline produces a definitive outcome. |
| Financial comparison | Consumes Stage 5, 16, 24 projections/actuals. | Future iterations can improve projection accuracy based on past variance. | Projection → measurement → comparison → learning. |
| Venture health | Consumes data from Stages 3, 14, 15, 20, 21, 24. | Health trends across iterations show trajectory. | Quantified venture state at review time. |
| Drift analysis | Compares Stage 1 (origin) with Stage 25 (current) via Stages 8, 11, 13 (intermediate). | Drift trajectory helps distinguish intentional pivots from gradual drift. | Vision accountability across the lifecycle. |

### 14. Dependency Conflicts (with Stages 1-24 decisions)

**No conflicts. Clean additions only.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 1 → 25 (vision/pitch) | **EXISTING** | Already used by detectDrift(). Enhanced with semantic analysis. |
| Stage 5 → 25 (profitability) | **NEW** | Financial comparison consumes Stage 5 projections. Read-only. |
| Stage 16 → 25 (financial projections) | **NEW** | Financial comparison consumes Stage 16 projections. Read-only. |
| Stage 24 → 25 (AARRR metrics) | **NEW** | Health score and financial comparison consume Stage 24 actuals. Read-only. |
| Stage 24 → 25 (learnings) | **NEW** | Learning categories align (product/market/technical/financial/process → team). |

All additions consume prior stage data read-only. No field renaming, type changes, or semantic conflicts.

### 15. Contrarian Take

**Arguing AGAINST adding venture_decision:**

1. **Decisions need context that data can't capture.** A venture's future depends on founder passion, market timing, competitive moves, funding runway, team morale -- none of which are in the pipeline data. A "sunset" recommendation based on weak metrics ignores that the founder has a unique insight the metrics don't yet reflect. The decision framework creates false authority.

2. **The pipeline already has enough gates.** Three kill gates (3, 5, 23), two reality gates (9, 12), and a promotion gate (16, 22). If the venture survived all of these, do we need ANOTHER decision point? The gates already filtered for viability. Stage 25's "venture_decision" is asking a question the pipeline already answered.

3. **Decision paralysis.** Adding 5 options (continue/pivot/expand/sunset/exit) forces a choice that may be premature. After one sprint through the BUILD LOOP, the venture has minimal data. "Should we continue, pivot, or sunset?" is often answered with "too early to tell." The decision framework pressures premature commitment.

4. **What could go wrong**: A venture launches to 50 beta users. Stage 24 metrics are below target (by definition -- it's beta). The health score shows "at_risk." The financial comparison shows "large negative variance" (because projections assumed full market). The analysisStep recommends "pivot." The founder, pressured by the framework, pivots when they should have iterated.

**Counter-argument**: The venture_decision is the only place in the pipeline that asks "so what?" Without it, the 25-stage lifecycle is a comprehensive data collection exercise that never reaches a conclusion. The decision is explicitly human-made (the user chooses, not the system). The analysisStep recommends, but the confidence field (high/medium/low) signals uncertainty. And critically: "continue" is a valid decision. The framework doesn't force change -- it forces reflection. And reflecting on whether to continue, pivot, expand, sunset, or exit after completing a full venture lifecycle is exactly the right question to ask.

**Verdict**: Keep venture_decision. It's the capstone that gives the pipeline meaning. Without it, Stage 25 is just another data collection form.
