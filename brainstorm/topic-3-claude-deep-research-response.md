# Topic 3 Deep Research: Claude's Independent Analysis

**Analyst**: Claude (Opus 4.5)
**Date**: 2026-01-08
**Protocol**: Ground-Truth Triangulation - Deep Research

---

## 1. Conceptual Framework

### How Capability and Success Relate

These are **orthogonal dimensions**, not correlated variables. This is the key insight.

```
                    HIGH SUCCESS PROBABILITY
                            │
         "Cash Cows"        │        "Golden Ventures"
      (Exploit existing     │     (Ideal: compound AND win)
       market, low learning)│
                            │
   LOW ─────────────────────┼───────────────────── HIGH
   CAPABILITY               │                   CAPABILITY
                            │
        "Losers"            │        "Strategic Bets"
     (Why are we doing      │     (Build capability even
      this?)                │      if venture fails)
                            │
                    LOW SUCCESS PROBABILITY
```

**Key Insight**: The 25-stage workflow already optimizes for success probability through its gates. The Matrix should optimize for **portfolio composition**, not duplicate success prediction.

### Should Success Be Explicit or Implicit?

**Recommendation: Make success EXPLICIT but DERIVED, not a separate input.**

Here's why:

| Approach | Pros | Cons |
|----------|------|------|
| **Implicit (current)** | Simpler model | Success buried in Plane 2, hard to see tradeoffs |
| **5th Plane** | Explicit visibility | Redundant - success factors already in Planes 2-4 |
| **Derived Score** | Best of both - visible but not redundant | Requires clear derivation logic |

**Proposed Solution**: Calculate a **Viability Score** derived from Planes 2, 3, and 4:

```
Viability Score = f(Plane 2 net vectors, Plane 3 risk gates, Plane 4 mode)
```

This makes success probability visible without adding a redundant input plane.

---

## 2. Recommended Model Changes

### Keep Four Planes, Add Derived Metrics

**Do NOT add a 5th plane.** Instead:

1. **Keep Plane 1** (Capability) as-is - measures ecosystem contribution
2. **Keep Planes 2-4** as-is - they collectively determine viability
3. **Add derived Viability Score** - computed from Planes 2-4, displayed prominently

### New Aggregation Logic

Replace the current sequential gates with a **two-axis classification**:

**Step 1: Compute Viability Score**
```
Viability = (
  (Plane2_net_score + 10) / 35 * 0.5 +     # Normalize -10 to +25 → 0 to 1
  (Plane3_pass ? 1 : 0) * 0.3 +             # Binary risk gate
  (Plane4_exploitation_weight) * 0.2        # Higher for exploitation mode
) * 100

Result: 0-100% Viability Score
```

**Step 2: Classify into Quadrant**

| Quadrant | Capability (P1) | Viability | Portfolio Role |
|----------|-----------------|-----------|----------------|
| **Golden** | ≥15 | ≥60% | Priority investment |
| **Strategic Bet** | ≥15 | <60% | Time-boxed with capability extraction milestones |
| **Cash Cow** | <15 | ≥60% | Acceptable if portfolio needs cash flow |
| **Reconsider** | <15 | <60% | Reject or major pivot required |

**Step 3: Apply Portfolio Constraints**
- No more than 30% of ventures in "Strategic Bet" quadrant
- At least 40% must be "Golden" or "Cash Cow"
- "Reconsider" ventures require Chairman exception

### Softened Plane 1 Rule

**Change**: Remove hard "Plane 1 < 10 = reject" rule
**Replace with**: Quadrant classification + portfolio balance check

Rationale: A low-capability venture with 90% success probability (Cash Cow) may be strategically valuable for funding capability-heavy ventures.

---

## 3. Dashboard Visualization Recommendations

### Primary View: Dual-Lens Dashboard

The Chairman needs to see **both individual ventures AND portfolio balance** at a glance.

**Layout (Desktop)**:
```
┌─────────────────────────────────────────────────────────────────┐
│  PORTFOLIO BALANCE                     │  ATTENTION REQUIRED    │
│  ┌─────────────────────┐              │  ┌──────────────────┐  │
│  │    2×2 Quadrant     │              │  │ Venture A ⚠️     │  │
│  │    Scatter Plot     │              │  │ Venture C 🔴     │  │
│  │    (all ventures)   │              │  │ Venture F ⏰     │  │
│  └─────────────────────┘              │  └──────────────────┘  │
│  Golden: 4 | Bets: 2 | Cows: 1 | ?: 1 │  3 items need review   │
├─────────────────────────────────────────────────────────────────┤
│  SELECTED VENTURE: Truth Engine X                               │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Capability: 18  │ │ Viability: 72%  │ │ Quadrant: GOLDEN│   │
│  │ (radar chart)   │ │ (gauge)         │ │ ✅ PROCEED      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
│  [Details ↓] [Compare] [History] [Scenarios]                    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Visualizations

**1. Portfolio Quadrant Scatter (PRIMARY)**
- X-axis: Capability Score (0-25)
- Y-axis: Viability Score (0-100%)
- Dot size: Resource allocation (attention/spend)
- Dot color: Constraint status (green/yellow/red)
- Quadrant lines: Configurable thresholds
- Click dot → Select venture for detail view

**2. Capability-Viability Gauge (Per Venture)**
- Two semi-circular gauges side by side
- Left: Capability (0-25)
- Right: Viability (0-100%)
- Color coding: Green (good), Yellow (marginal), Red (concern)

**3. Portfolio Balance Bar**
- Horizontal stacked bar showing % in each quadrant
- Target zone indicator (e.g., "Healthy: 40%+ Golden/Cow")
- Trend arrow (improving/declining)

**4. Trend Sparklines (Optional)**
- Small inline charts showing score evolution over time
- Useful for ventures in "Strategic Bet" (are they moving toward Golden?)

### Mobile View

Simplified to essentials:
```
┌─────────────────────┐
│ PORTFOLIO HEALTH    │
│ ████████░░ 78%      │
│ 4 Golden | 2 Bets   │
├─────────────────────┤
│ ⚠️ 3 Need Review    │
│ > Venture A         │
│ > Venture C         │
│ > Venture F         │
├─────────────────────┤
│ [View Full Matrix]  │
└─────────────────────┘
```

---

## 4. Mockup Direction

### New Mockups Needed

**Mockup A: Portfolio Quadrant View**
- 2×2 scatter plot with all ventures
- Quadrant labels (Golden, Strategic Bet, Cash Cow, Reconsider)
- Portfolio balance summary below
- Click-to-select interaction

**Mockup B: Dual-Gauge Venture Card**
- Simplified version of current detailed view
- Two prominent gauges: Capability + Viability
- Quadrant badge (color-coded)
- Key constraints as icons
- Single recommended action

**Mockup C: Portfolio Health Dashboard**
- Aggregate metrics view
- Balance bar + trend
- Risk concentration indicators
- Resource allocation heatmap

### Changes to Existing Mockups

| Current Mockup | Recommended Change |
|----------------|-------------------|
| Full Four-Plane Dashboard | Add Viability gauge; reduce information density |
| Vector Field Focus | Keep for drill-down; not primary view |
| Polished Single-Card | Add quadrant badge; show Viability prominently |

### Information Density Reduction

Current mockups show ~15+ data points. Reduce to **7 for primary view**:

1. Venture name + status
2. Capability score (number + visual)
3. Viability score (number + visual)
4. Quadrant classification
5. Key constraint status (pass/warn/block)
6. Exploration mode badge
7. Recommended action

Everything else → drill-down.

---

## 5. Decision Logic

### Tradeoff Framework

**Question**: Venture A (Cap 22, Viability 40%) vs Venture B (Cap 8, Viability 85%)?

**Framework: Expected Ecosystem Value (EEV)**

```
EEV = Capability_Score × Viability × Time_Factor

Venture A: 22 × 0.40 × 1.0 = 8.8 EEV
Venture B: 8 × 0.85 × 1.0 = 6.8 EEV
```

By EEV alone, Venture A wins despite lower viability.

**But add portfolio context:**

```
Current Portfolio: 60% Strategic Bets, 20% Golden, 20% Cash Cow
Adding Venture A: Increases Strategic Bet concentration (risky)
Adding Venture B: Adds Cash Cow (improves balance)
```

**Decision**: Choose Venture B to improve portfolio balance, OR accept Venture A with explicit risk acknowledgment.

### Portfolio Quotas (Soft Constraints)

| Quadrant | Target Range | Rationale |
|----------|--------------|-----------|
| Golden | 30-50% | Core value creation |
| Strategic Bet | 10-30% | Future capability investment |
| Cash Cow | 20-40% | Funds the portfolio |
| Reconsider | 0-10% | Exceptions only |

**Enforcement**: Soft warnings, not hard blocks. Chairman can override with documented rationale.

### Gaming Prevention

**Risk 1: Inflating Capability Scores**
- Mitigation: Retrospective validation - compare predicted capability extraction vs. actual
- Mitigation: Peer review of capability claims by EVA

**Risk 2: Sandbagging Viability**
- Mitigation: Track prediction accuracy over time
- Mitigation: External market data feeds for Plane 2 (harder to manipulate)

**Risk 3: Gaming Quadrant Thresholds**
- Mitigation: Use continuous scores, not just quadrant labels
- Mitigation: Show distance from thresholds ("2 points from Golden")

---

## 6. Implementation Considerations

### Database Schema Additions

```sql
-- Add to venture_evaluations table
ALTER TABLE venture_evaluations ADD COLUMN
  viability_score DECIMAL(5,2),           -- Derived from P2/P3/P4
  quadrant VARCHAR(20),                    -- 'golden', 'strategic_bet', 'cash_cow', 'reconsider'
  expected_ecosystem_value DECIMAL(8,2),   -- Capability × Viability
  portfolio_balance_impact JSONB;          -- Effect on portfolio composition

-- Portfolio snapshots for trend tracking
CREATE TABLE portfolio_snapshots (
  id UUID PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  quadrant_distribution JSONB,             -- {"golden": 4, "strategic_bet": 2, ...}
  total_capability_score INTEGER,
  average_viability DECIMAL(5,2),
  health_score DECIMAL(5,2)
);
```

### EVA Algorithm Requirements

1. **Viability Calculation**: Deterministic formula from Planes 2-4
2. **Quadrant Classification**: Thresholds configurable per portfolio strategy
3. **EEV Calculation**: Capability × Viability × Time Factor
4. **Portfolio Impact Analysis**: "If we add this venture, how does balance change?"
5. **Recommendation Generation**: Based on quadrant + portfolio state

### Calibration Approach

**Phase 1 (Months 1-3): Collect Data**
- Score all ventures on four planes + derived viability
- Do NOT enforce quotas yet
- Track actual outcomes vs. predictions

**Phase 2 (Months 4-6): Calibrate**
- Compare predicted viability vs. actual success/failure
- Adjust derivation weights if needed
- Set initial quadrant thresholds based on observed distribution

**Phase 3 (Months 7+): Soft Enforcement**
- Enable portfolio balance warnings
- Track exception requests
- Refine thresholds quarterly

---

## 7. Risks and Mitigations

### Risk 1: False Precision
**Problem**: Showing "Viability: 67.3%" implies precision that doesn't exist
**Mitigation**: Use ranges or buckets (High/Medium/Low) alongside numbers; show confidence intervals

### Risk 2: Quadrant Obsession
**Problem**: Teams optimize for quadrant labels rather than actual value
**Mitigation**: Emphasize continuous scores; show distance to thresholds; track boundary cases

### Risk 3: Portfolio Quota Rigidity
**Problem**: "We can't do this great venture because we're at 30% Strategic Bets"
**Mitigation**: Quotas are warnings, not blocks; Chairman can override; seasonal adjustments allowed

### Risk 4: Viability Derivation Errors
**Problem**: Formula may not accurately predict success
**Mitigation**: Start with simple formula; calibrate based on outcomes; allow manual override with justification

### Risk 5: Historical Data Sparsity
**Problem**: EHG may not have enough ventures to calibrate
**Mitigation**: Use industry benchmarks initially; adjust as internal data accumulates; be explicit about uncertainty

### Risk 6: Capability Measurement Difficulty
**Problem**: "Did this venture actually produce capabilities?" is hard to verify
**Mitigation**: Define capability extraction milestones upfront; require evidence at stage gates; retrospective audits

---

## Summary Recommendations

### Conceptual
- Keep capability and success as **orthogonal dimensions**
- Add **derived Viability Score** (not a 5th plane)
- Use **2×2 quadrant model** for portfolio classification

### Visualization
- **Primary view**: Portfolio quadrant scatter + attention queue
- **Secondary view**: Individual venture dual-gauge card
- **Reduce density**: 7 key metrics on primary view, rest in drill-down

### Decision Logic
- **Expected Ecosystem Value (EEV)** for venture comparison
- **Soft portfolio quotas** with Chairman override
- **Continuous calibration** based on outcome tracking

### Implementation
- Add `viability_score`, `quadrant`, `eev` columns to evaluations
- Create portfolio snapshots table for trend tracking
- Phase rollout: collect → calibrate → enforce

### What NOT To Do
- Don't add a 5th plane (redundant)
- Don't use hard quotas (too rigid)
- Don't show false precision (use ranges)
- Don't optimize for quadrants (optimize for EEV)

---

## Confidence Assessment

| Recommendation | Confidence | Rationale |
|----------------|------------|-----------|
| Derived Viability Score | 85% | Avoids redundancy while making success visible |
| 2×2 Quadrant Model | 90% | Industry-standard portfolio visualization |
| EEV Formula | 70% | Simple starting point, needs calibration |
| Portfolio Quotas | 75% | Useful but must be soft constraints |
| Dashboard Layout | 80% | Balances glanceability with depth |
| Calibration Approach | 85% | Phased rollout reduces risk |

---

*Claude's Independent Analysis for Topic 3 Deep Research*
*Ready for triangulation with OpenAI and Antigravity responses*
