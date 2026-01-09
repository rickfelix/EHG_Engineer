# Topic 3 Deep Research: Triangulation Synthesis

**Date**: 2026-01-08
**Analysts**: Claude (Opus 4.5), OpenAI (GPT-4), Antigravity
**Topic**: Balancing Capability Production vs Venture Success

---

## Executive Summary

**Strong consensus (90%+)** across all three AIs on visualization and portfolio management.

**Key design disagreement** on whether success probability should be:
- A derived metric (Claude)
- A 5th input plane (Antigravity)
- An EVA forecast output (OpenAI) ← **Recommended middle ground**

---

## Full Consensus (All 3 Agree)

| Dimension | Consensus |
|-----------|-----------|
| **Orthogonality** | Capability and success are independent, orthogonal dimensions |
| **Don't collapse into one score** | No single weighted-sum "final score" |
| **2×2 Quadrant Visualization** | Portfolio scatter plot with capability on one axis, success on other |
| **Portfolio Quotas** | Soft constraints on quadrant distribution |
| **Avoid False Precision** | Use buckets/ranges, not exact percentages |
| **Sequential Gates for Admission** | Keep Plane 3 constraints as hard gates |
| **Calibration Over Time** | Track predictions vs outcomes to improve model |
| **Gaming Prevention** | Require evidence, extraction milestones, retrospective validation |

---

## The Core Design Disagreement

### How Should Success Probability Be Represented?

| Approach | Proponent | Description | Pros | Cons |
|----------|-----------|-------------|------|------|
| **Derived Metric** | Claude | Compute Viability Score from Planes 2-4 | No redundancy, simpler model | Success factors may be implicit/hidden |
| **5th Input Plane** | Antigravity | Add Plane 5: Economic Potential as explicit input | Explicit, measurable, can't ignore | Redundant with Plane 2 vectors, adds complexity |
| **EVA Forecast Output** | OpenAI | "Success Outlook" computed by EVA, versioned/auditable | Explicit AND derived, auditable, separates planes from forecasts | Requires EVA algorithm development |

### Analysis

**Claude's Concern**: Adding a 5th plane is redundant because success factors are already captured in:
- Plane 2 (market demand, timing, competition)
- Plane 3 (risk constraints)
- Plane 4 (exploration vs exploitation mode)

**Antigravity's Concern**: "You cannot balance what you don't measure explicitly." Capital allocation requires seeing success probability as a first-class metric.

**OpenAI's Resolution**: Keep planes as "control surfaces" (inputs), but add Success Outlook as an "EVA forecast" (output). This:
- Makes success explicit (addresses Antigravity's concern)
- Avoids redundancy by computing rather than inputting (addresses Claude's concern)
- Creates audit trail for calibration (adds accountability)

---

## Triangulated Recommendation

### Adopt OpenAI's "Success Outlook" Approach

**Rationale**: It's a synthesis of Claude and Antigravity's positions that addresses both concerns.

**Implementation**:

1. **Keep four planes as inputs** (no 5th plane)
   - Plane 1: Capability Impact (0-25)
   - Plane 2: External Vectors (-10 to +25)
   - Plane 3: Constraints (Pass/Block/Escalate)
   - Plane 4: Exploration Dial

2. **Add Success Outlook as EVA output**
   - Success Likelihood: Bucketed (0-20%, 20-40%, 40-60%, 60-80%, 80-100%)
   - Forecast Confidence: Low/Medium/High
   - Primary Failure Modes: Top 3 risks
   - Evidence Buckets: Facts/Assumptions/Simulations/Unknowns

3. **Separate recommendation confidence from success likelihood**
   - "EVA Confidence: 0.81" = confidence in the recommendation
   - "Success Outlook: 60-80%" = predicted venture outcome

---

## Visualization Consensus

### Primary View: Portfolio Scatter Plot

All three AIs recommend this as the primary portfolio view:

```
                    100% ┌────────────────────────────────────┐
                         │  Cash Cows      │   Home Runs      │
                         │  (exploit)      │   (priority)     │
    SUCCESS              │       ○         │      ●  ●        │
    OUTLOOK              │                 │         ●        │
                     50% ├─────────────────┼──────────────────┤
                         │  Dead Zone      │  Strategic Bets  │
                         │  (reject)       │  (time-boxed)    │
                         │                 │      ○           │
                      0% └────────────────────────────────────┘
                         0                 12.5              25
                              CAPABILITY IMPACT (Plane 1)
```

**Encoding**:
- X-axis: Capability Impact (Plane 1)
- Y-axis: Success Outlook (%)
- Dot color: Constraint status (green/yellow/red)
- Dot shape: Exploration mode (Plane 4)
- Dot size: Resource allocation

### Secondary View: Individual Venture Card

Add to existing mockups:
- **Success Outlook strip** (bucketed % + confidence + top driver)
- **Dual gauges**: Capability (0-25) + Success (0-100%)
- **Quadrant badge**: Home Run / Strategic Bet / Cash Cow / Dead Zone

---

## Decision Logic Consensus

### Admission (Single Venture)

| Gate | Rule | Source |
|------|------|--------|
| 1 | Plane 3 Block → Reject | All three |
| 2 | Plane 1 < 10 → Require exception | Claude, OpenAI |
| 3 | Success < 30% → Must be exploration + expiry + extraction milestone | OpenAI |
| 4 | Low-cap + high-success → Time-boxed "cash mandate" + portfolio cap | All three |

### Allocation (Portfolio)

**Triangulated Quotas** (soft constraints):

| Quadrant | Claude | Antigravity | OpenAI | **Consensus** |
|----------|--------|-------------|--------|---------------|
| Home Runs (high-cap + high-success) | 30-50% Golden | Part of 40% revenue floor | ≥30% on Pareto frontier | **30-50%** |
| Strategic Bets (high-cap + low-success) | 10-30% | Part of 30% high-cap minimum | ≤exploration with expiry | **10-25%** |
| Cash Cows (low-cap + high-success) | 20-40% | Part of 40% revenue floor | ≤25% exceptions | **20-30%** |
| Dead Zone (low-cap + low-success) | 0-10% | Reject | Fail admissibility | **0%** (reject) |

### A vs B Tradeoff Example

**Venture A**: Capability 22, Success 40%
**Venture B**: Capability 8, Success 85%

| AI | Recommendation |
|----|----------------|
| Claude | EEV comparison: A=8.8, B=6.8 → A wins on EEV, but consider portfolio balance |
| Antigravity | B must be > 85% success if Cap < 10 ✓ → B is valid Cash Cow |
| OpenAI | B fails Plane 1 threshold unless granted "cash engine exception" → Prefer A unless portfolio needs cash |

**Triangulated Decision**:
- A is default choice (higher expected ecosystem value)
- B acceptable only if portfolio needs cash flow AND explicitly time-boxed
- Chairman must consciously choose to take a low-capability venture

---

## Implementation Consensus

### Database Schema

All three recommend tracking:

```sql
-- Core addition (all three agree)
ALTER TABLE venture_evaluations ADD COLUMN
  success_likelihood_bucket VARCHAR(10),  -- '0-20', '20-40', etc.
  success_confidence VARCHAR(10),         -- 'low', 'medium', 'high'
  success_drivers JSONB,                  -- Top 3 failure modes
  quadrant VARCHAR(20);                   -- 'home_run', 'strategic_bet', etc.

-- Portfolio snapshots (Claude + OpenAI)
CREATE TABLE portfolio_snapshots (
  snapshot_date DATE,
  quadrant_distribution JSONB,
  pareto_frontier_ids UUID[],
  calibration_health DECIMAL
);

-- Calibration tracking (all three)
CREATE TABLE forecast_calibration (
  venture_id UUID,
  forecast_date DATE,
  predicted_bucket VARCHAR(10),
  actual_outcome VARCHAR(20),  -- 'success', 'failure', 'pivot', 'ongoing'
  brier_score DECIMAL
);
```

### EVA Algorithm Requirements

1. **Compute Success Outlook** from Planes 2-4 + stage artifacts
2. **Bucket probabilities** (not point estimates)
3. **Track confidence separately** from likelihood
4. **Store evidence** (Facts/Assumptions/Simulations/Unknowns)
5. **Version forecasts** for calibration

---

## Risk Consensus

| Risk | All Three Agree On | Mitigation |
|------|-------------------|------------|
| **False Precision** | Don't show "67.3%" | Use buckets (60-80%) |
| **Gaming Plane 1** | Teams inflate capability claims | Require evidence + extraction milestones + reuse tracking |
| **Confidence Theater** | "0.81 confidence" is meaningless | Separate recommendation confidence from success likelihood |
| **Capability Junkyard** | Abstractions nobody reuses | Reuse tracking + deprecation discipline |
| **Quadrant Obsession** | Optimizing for labels not value | Show continuous scores alongside quadrants |

---

## New Mockups Required (Consensus)

| Mockup | Description | Priority |
|--------|-------------|----------|
| **Portfolio Scatter** | 2×2 quadrant view with all ventures | HIGH |
| **Venture Comparison** | Side-by-side A vs B analysis | MEDIUM |
| **Success Outlook Panel** | Evidence drawer (Facts/Assumptions/Simulations/Unknowns) | MEDIUM |
| **Portfolio Health Header** | Quadrant %, trend, calibration indicator | HIGH |

### Updates to Existing Mockups

| Current | Change |
|---------|--------|
| Polished Single-Card | Add Success Outlook strip (bucket + confidence + driver) |
| Four-Plane Dashboard | Add dual-gauge (Capability + Success) |
| Vector Field View | Keep as drill-down for Plane 2 detail |

---

## Final Triangulated Recommendation

### Model Design
- **Keep four planes** as input control surfaces
- **Add Success Outlook** as EVA forecast output (not a 5th plane)
- **Use buckets** (0-20%, 20-40%, etc.) not point estimates
- **Separate** recommendation confidence from success likelihood

### Visualization
- **Primary**: Portfolio scatter plot (Capability × Success)
- **Secondary**: Individual venture card with dual gauges
- **Reduce density**: 7 key metrics, rest in drill-down

### Decision Logic
- **Sequential gates** for admission (Plane 3 → Plane 1 → Success floor)
- **Soft quotas** for portfolio balance (30-50% Home Runs, etc.)
- **Pareto frontier** preference for allocation

### Implementation Path
1. Add Success Outlook columns to evaluations table
2. Build EVA forecast algorithm (start simple, calibrate)
3. Create portfolio scatter view
4. Update venture cards with Success Outlook strip
5. Track predictions vs outcomes for calibration

---

## Confidence Assessment

| Recommendation | Agreement Level | Confidence |
|----------------|-----------------|------------|
| Keep 4 planes, add Success Outlook as output | Claude + OpenAI agree; Antigravity wanted 5th plane | **85%** |
| 2×2 quadrant scatter plot | All three | **95%** |
| Soft portfolio quotas | All three | **90%** |
| Bucket probabilities, not point estimates | All three | **95%** |
| Sequential gates + Pareto allocation | Claude + OpenAI | **85%** |
| EVA computes Success Outlook | OpenAI primary; Claude compatible | **80%** |

---

## Summary for Chairman Decision

**The triangulation reveals:**

1. **Full consensus** on visualization (2×2 scatter), quotas (soft constraints), and avoiding false precision (buckets)

2. **Near consensus** on keeping 4 planes rather than adding a 5th

3. **Recommended approach**: OpenAI's "Success Outlook as EVA output" which:
   - Makes success explicit (Antigravity's concern)
   - Avoids redundancy (Claude's concern)
   - Creates audit trail (OpenAI's addition)

**Action required**: Confirm adoption of Success Outlook approach, then proceed to mockup redesign and SD creation.

---

*Topic 3 Deep Research Triangulation Synthesis*
*Created: 2026-01-08*
*Ready for Chairman approval*
