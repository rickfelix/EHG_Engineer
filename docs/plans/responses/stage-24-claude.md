# Stage 24 "Metrics & Learning" -- Claude Response

> Independent response to the Stage 24 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| analysisStep missing | N/A | None | **5 Critical** | Stage 24 should evaluate Stage 23's success criteria against actual AARRR metrics. Without it, metrics are collected but not interpreted. The "learning" in "Metrics & Learning" is passive. | ADD | The analysisStep transforms raw metrics into a launch scorecard: what worked, what didn't, and why. |
| No success criteria evaluation | N/A | No connection to Stage 23 | **5 Critical** | Stage 23 defines success criteria (per consensus). Stage 24 must evaluate them. Without this link, the learning loop is broken -- targets were set but never measured against. | ADD | This is the entire point of Stage 24. Without it, success_criteria at Stage 23 are dead data. |
| Learning category free text | Categorized analytics | Free text string | **3 Medium** | Can't aggregate learnings by type. Hard to identify patterns across ventures. | ENUM | Keep it simple: product, market, technical, financial, process. Matches Stage 25's review categories. |
| Funnel steps untyped | Journey mapping with touchpoints | Untyped array items | **3 Medium** | Funnel steps lack conversion data. Steps are just... items. No conversion rates, no dropoff analysis. | ENHANCE | Add step name and conversion_rate. Funnels without conversion data are just lists. |
| trend_window_days unused | Cohort analysis, trend lines | Field exists but unused in derivation | **2 Low** | Trend data isn't computed. The field is aspirational, not functional. | USE OR REMOVE | Either compute trend-based metrics or remove the field. Dead fields confuse users. |
| No launch type context | N/A | No awareness of Stage 23's launch_type | **4 High** | A beta launch with 100 users and a GA launch with 100 users have very different interpretations. Without launch_type context, metrics are evaluated without context. | ADD | Stage 24 should know what kind of launch happened. Affects target interpretation. |
| No growth-specific metrics | MAU, NRR, cohort analysis, viral coefficient | Only AARRR | **2 Low** | AARRR already covers growth metrics. Acquisition = growth. Revenue = MRR. The GUI adds granularity but not new dimensions. | SKIP | AARRR is comprehensive. Growth metrics like viral coefficient fit under Referral. NRR fits under Revenue. |
| No experimentation tracking | A/B testing platform | None | **2 Low** | Experiments are operational. A venture lifecycle tool tracks outcomes, not experiment velocity. | SKIP | Experiments produce learnings. Capture the learnings, not the experiment infrastructure. |
| No metric time series | Trend lines, cohort retention by month | Single snapshot values | **2 Low** | No trend data. But ventures iterate through BUILD LOOP sprints, and each sprint produces new Stage 24 data. The time series IS the sequence of Stage 24 snapshots across sprints. | SKIP | Each sprint iteration creates a new Stage 24. Trend = comparing Stage 24 across iterations. |

### 2. AnalysisStep Design

**Input (from Stage 23 -- Launch Context + Stage 24 metrics)**:
- Stage 23: success_criteria[], launch_type, kill gate result, planned_launch_date, actual_launch_date
- Stage 24 (self): aarrr metrics, funnels, learnings

**Process (single LLM call)**:

1. **Success Criteria Evaluation**: Map each Stage 23 success_criteria to the closest AARRR metric. Calculate: criteria_met (value ≥ target), criteria_missed (value < target), unmeasured (no matching metric). Generate a success rate.

2. **Launch Scorecard**: Using launch_type context:
   - soft_launch: focus on activation and early retention. Revenue targets relaxed.
   - beta: focus on all 5 AARRR categories. Targets assessed with beta context.
   - general_availability: full assessment. All targets strict.

3. **AARRR Health Assessment**: Per category: on-target count, below-target count, biggest gap, strongest performer. Overall health: green (≥80% on target), amber (50-80%), red (<50%).

4. **Learning Synthesis**: Group learnings by category. Identify: product-market fit signals (activation + retention strong?), growth signals (acquisition + referral strong?), monetization signals (revenue strong?).

5. **Stage 25 Handoff**: Summarize: venture health (based on metrics), key wins, key concerns, recommended focus areas for venture review.

**Output**: success_criteria_evaluation, launch_scorecard, aarrr_health, learning_synthesis, stage25_handoff.

### 3. Success Criteria Evaluation

**Add explicit evaluation linking Stage 23 criteria to Stage 24 metrics.**

```javascript
success_criteria_evaluation: {
  type: 'object', derived: true,
  properties: {
    criteria_results: {
      type: 'array',
      items: {
        criterion: { type: 'string' },       // From Stage 23
        target: { type: 'string' },           // From Stage 23
        actual_metric: { type: 'string' },    // Best matching AARRR metric name
        actual_value: { type: 'number' },     // AARRR metric value
        met: { type: 'boolean' },
        gap_pct: { type: 'number' },          // % above/below target
      },
    },
    total_criteria: { type: 'number' },
    criteria_met: { type: 'number' },
    criteria_missed: { type: 'number' },
    success_rate: { type: 'number' },          // criteria_met / total_criteria
  },
}
```

This closes the learning loop: Stage 23 sets targets → Stage 24 measures → success_rate tells you how the launch went.

### 4. Learning Categories

**Change to enum. Align with Stage 25's review categories.**

```javascript
learnings[].category: {
  type: 'enum',
  values: ['product', 'market', 'technical', 'financial', 'process'],
  required: true,
}
```

Five categories that:
- Match Stage 25's review categories (product/market/technical/financial/team → process instead of team)
- Cover the full venture lifecycle dimension space
- Allow aggregation: "What did we learn about our market? Our product? Our process?"

### 5. Funnels

**Add step structure with conversion rates.**

```javascript
funnels: {
  type: 'array', minItems: 1,
  items: {
    name: { type: 'string', required: true },
    aarrr_category: { type: 'enum', values: AARRR_CATEGORIES },  // NEW: which AARRR category
    steps: {
      type: 'array', minItems: 2,
      items: {
        name: { type: 'string', required: true },
        count: { type: 'number' },           // Users/events at this step
        conversion_rate: { type: 'number' }, // % converting to next step
      },
    },
  },
}
```

Key additions:
- Steps have names, counts, and conversion rates (instead of untyped items)
- Funnels link to AARRR categories (acquisition funnel, activation funnel, etc.)
- Conversion rate at each step enables dropoff analysis

### 6. Trend Data

**Remove trend_window_days. It's aspirational dead weight.**

The field exists in the current schema but computeDerived() doesn't use it. Trend analysis across time requires multiple snapshots -- which happen naturally as ventures iterate through BUILD LOOP sprints.

Each sprint produces its own Stage 24 with fresh AARRR metrics. Comparing Stage 24 data across sprints IS the trend.

If trend_window_days is needed later, it can be added when actual trend computation is implemented. Don't carry dead fields.

### 7. Launch Type Context

**Add launch_type reference from Stage 23.**

```javascript
launch_context: {
  type: 'object', derived: true,
  properties: {
    launch_type: { type: 'string' },              // From Stage 23
    planned_launch_date: { type: 'string' },       // From Stage 23
    actual_launch_date: { type: 'string' },        // From Stage 23
    days_since_launch: { type: 'number' },         // Computed
  },
}
```

The analysisStep uses launch_type to contextualize metric interpretation. The derived launch_context surfaces this information.

### 8. Growth Metrics

**Do NOT add growth-specific metrics beyond AARRR.**

AARRR already covers growth comprehensively:
- **Acquisition** = user growth, CAC, channels
- **Activation** = onboarding, first value moment
- **Retention** = stickiness, churn, DAU/MAU
- **Revenue** = MRR, ARPU, LTV
- **Referral** = viral coefficient, NPS, word-of-mouth

The GUI's extra metrics (MAU, NRR, viral coefficient, cohort analysis) all fit within these 5 categories. Adding separate growth metrics creates redundancy.

### 9. Experimentation

**Do NOT add experimentation tracking.**

A/B tests produce learnings. The `learnings[]` array captures those learnings with insight/action/category. The experiment infrastructure (active tests, velocity, success rate) is operational tooling, not venture lifecycle data.

### 10. CLI Superiorities (preserve these)

- **AARRR framework**: Well-chosen, comprehensive, venture-standard. The CLI already uses the right framework.
- **Metrics with targets**: value + target per metric enables on/off target computation. Simple, effective.
- **Funnels**: Multi-step funnel definition is a good primitive.
- **Learnings as first-class data**: insight/action pairs are actionable. The GUI buries learnings in operational dashboards.
- **computeDerived()**: Clean computation of metrics_on_target/metrics_below_target. Good pattern.

### 11. Recommended Stage 24 Schema

```javascript
const TEMPLATE = {
  id: 'stage-24',
  slug: 'metrics-learning',
  title: 'Metrics & Learning',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    aarrr: {
      type: 'object', required: true,
      properties: {
        acquisition: { type: 'array', minItems: 1, items: { name, value, target } },
        activation: { type: 'array', minItems: 1, items: { name, value, target } },
        retention: { type: 'array', minItems: 1, items: { name, value, target } },
        revenue: { type: 'array', minItems: 1, items: { name, value, target } },
        referral: { type: 'array', minItems: 1, items: { name, value, target } },
      },
    },

    // === Updated: funnels with step structure ===
    funnels: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        aarrr_category: { type: 'enum', values: AARRR_CATEGORIES },  // NEW
        steps: {
          type: 'array', minItems: 2,
          items: {
            name: { type: 'string', required: true },    // NEW
            count: { type: 'number' },                     // NEW
            conversion_rate: { type: 'number' },           // NEW
          },
        },
      },
    },

    // === Updated: learnings with category enum ===
    learnings: {
      type: 'array',
      items: {
        insight: { type: 'string', required: true },
        action: { type: 'string', required: true },
        category: { type: 'enum', values: ['product', 'market', 'technical', 'financial', 'process'], required: true },  // CHANGED
      },
    },

    // === Existing derived (unchanged) ===
    total_metrics: { type: 'number', derived: true },
    categories_complete: { type: 'boolean', derived: true },
    funnel_count: { type: 'number', derived: true },
    metrics_on_target: { type: 'number', derived: true },
    metrics_below_target: { type: 'number', derived: true },

    // === NEW: derived ===
    success_criteria_evaluation: { type: 'object', derived: true },  // Links to Stage 23
    launch_context: { type: 'object', derived: true },               // From Stage 23
    aarrr_health: { type: 'object', derived: true },                 // Per-category assessment
    provenance: { type: 'object', derived: true },
  },
};
```

**Removed**: `trend_window_days` (unused, dead field).

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` evaluating launch success against Stage 23 criteria.** Launch scorecard, AARRR health, learning synthesis. This makes Stage 24 active rather than passive.

2. **P0: Add `success_criteria_evaluation` derived field.** Maps Stage 23 criteria to AARRR metrics. Computes success rate. Closes the learning loop.

3. **P1: Change learning category to enum.** product/market/technical/financial/process. Enables aggregation, aligns with Stage 25.

4. **P1: Enhance funnel steps with name, count, conversion_rate.** Transforms funnels from lists into analyzable conversion data.

5. **P1: Add `launch_context` from Stage 23.** launch_type, dates, days_since_launch. Contextualizes metric interpretation.

6. **P2: Remove `trend_window_days`.** Dead field -- unused in derivation.

7. **P3: Do NOT add growth-specific metrics** (AARRR already covers them).
8. **P3: Do NOT add experimentation tracking** (operational, not lifecycle).
9. **P3: Do NOT add time series** (sprint iterations provide natural time series).

### 13. Cross-Stage Impact

| Change | Stage 23 (Launch Execution) | Stage 25 (Venture Review) | Overall Pipeline |
|--------|----------------------------|---------------------------|-----------------|
| Success criteria evaluation | Consumes Stage 23's criteria. Closes learning loop. | Stage 25 knows if launch met targets. | Traceability: targets → measurement → review. |
| Learning categories | N/A | Learnings align with Stage 25's review categories. Cross-reference possible. | Consistent categorization from metrics to review. |
| Launch context | Consumes Stage 23's launch_type and dates. | Stage 25 knows launch type for context. | Launch context flows through to final review. |
| AARRR health | N/A | Stage 25 has quantified venture health per AARRR dimension. | Data-driven venture review. |

### 14. Dependency Conflicts (with Stages 1-23 decisions)

**No conflicts. Clean additions only.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 23 → 24 (success_criteria) | **NEW** | Evaluation links Stage 23 criteria to AARRR metrics. Forward contract from Stage 23 consensus. |
| Stage 23 → 24 (launch_type) | **NEW** | Context for metric interpretation. Forward contract from Stage 23 consensus. |
| Stage 23 → 24 (dates) | **NEW** | days_since_launch computation. Forward contract from Stage 23 consensus. |
| Stage 24 → 25 (learnings) | **NEW** | Category enum aligns with Stage 25 review categories. Forward contract. |

All additions consume Stage 23 consensus fields read-only. No field renaming, type changes, or semantic conflicts with any prior stage.

### 15. Contrarian Take

**Arguing AGAINST adding success_criteria_evaluation:**

1. **Metrics don't tell the whole story.** A venture can miss every target metric and still be succeeding if it discovered a better market. Conversely, a venture can hit all targets and be dying (vanity metrics). A "success rate" based on metric targets is dangerously reductive.

2. **Target-setting is flawed.** Stage 23 success criteria are set before launch -- they're guesses about what "good" looks like. Post-launch reality often reveals that the targets were wrong, not that the venture failed. Evaluating against flawed targets produces misleading scores.

3. **Automation bias.** A computed success_rate (e.g., "4 of 6 criteria met = 67%") creates a false sense of objectivity. The user sees 67% and thinks "not great" without questioning whether the criteria were appropriate. The automation displaces human judgment with mechanical evaluation.

4. **What could go wrong**: A soft_launch with 50 beta users misses the "1000 DAU" target that was set optimistically. success_rate = 0%. The user sees this and pivots unnecessarily. But 50 highly engaged beta users with 90% retention is actually a strong signal. The success_criteria_evaluation said "failure"; reality says "early success."

**Counter-argument**: The evaluation is ONE input, not THE verdict. The analysisStep contextualizes the raw success_rate with launch_type context, qualitative interpretation, and the full AARRR picture. A low success_rate with strong retention signals different things than a low success_rate across the board. The evaluation surfaces the data; the human (and Stage 25) interprets it. And having targets to evaluate against -- even imperfect ones -- is strictly better than having no targets at all, which is the current state.

**Verdict**: Keep success_criteria_evaluation but ensure the analysisStep contextualizes it. The raw success_rate should never be the sole decision input.
