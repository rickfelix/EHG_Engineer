# Topic 3 Deep Research: Balancing Capability Production vs Venture Success

**Purpose**: Triangulation prompt for OpenAI, Antigravity, and Claude to determine the best approach for visualizing and balancing capability contribution against venture success in the EHG Venture Evaluation Matrix.

**Date**: 2026-01-08

---

## Background Context

### What is EHG?

ExecHoldings Global (EHG) is a holding company that builds and operates software ventures using a **25-stage venture workflow**. The workflow takes ventures from inception through validation, development, launch, and maturity with structured gates at each stage.

### The Capability Compounding Strategy

EHG operates on a doctrine where:
1. **Every venture should contribute capabilities** to the ecosystem (reusable code, patterns, learnings)
2. **Capabilities compound over time** - new ventures leverage existing capabilities, reducing time and risk
3. **Capability production is a secondary objective** - not a guarantee of success, but a strategic priority

**Critical Clarification**: Capability production does NOT predict venture success. A venture can:
- Succeed AND produce capabilities (ideal)
- Succeed WITHOUT producing capabilities (acceptable)
- Fail BUT contribute capabilities (not a total loss)
- Fail AND produce nothing (total loss)

The 25-stage workflow handles success/failure risk. Capability tracking is a separate dimension measuring ecosystem contribution.

### The Four-Plane Evaluation Matrix (Current Design)

EHG has designed a four-plane model for venture evaluation:

| Plane | Question | Measures | Score Range |
|-------|----------|----------|-------------|
| **Plane 1: Capability Graph** | What does this make EHG better at—permanently? | Ecosystem contribution potential | 0-25 |
| **Plane 2: External Vectors** | Which real-world forces does this ride—or fight? | Market/timing alignment | -10 to +25 |
| **Plane 3: Constraints** | What could blow us up? | Risk gates | Pass/Block/Escalate |
| **Plane 4: Exploration Dial** | What rules apply to this venture? | Strategic positioning | Exploration ↔ Exploitation |

**Current Hard Rule**: If Plane 1 < 10, venture must justify itself as a time-boxed exception or be rejected.

### The Problem

The current design heavily weights **capability contribution** (Plane 1) but doesn't explicitly account for **venture success probability**.

Questions:
1. Where does "likelihood of commercial success" fit in this model?
2. Is it implicit in Plane 2 (External Vectors) or should it be explicit?
3. How do we balance a venture that scores HIGH on capability but LOW on success probability (and vice versa)?

---

## The Core Research Question

> **How should EHG visualize and balance "capability contribution to the ecosystem" against "venture success probability" in the Evaluation Matrix dashboard?**

This is fundamentally a **portfolio optimization problem**, not a prediction problem.

---

## Specific Questions to Answer

### 1. Model Design Questions

**Q1.1**: Should "success probability" be a fifth plane, or is it already implicit in Planes 2-4?

**Q1.2**: If implicit, how do we make it visible without adding redundancy?

**Q1.3**: What is the right way to aggregate four (or five) planes into a final recommendation? Options:
- Weighted sum
- Sequential gates (current design)
- Multi-dimensional Pareto frontier
- AI-generated holistic score

**Q1.4**: How do we handle the tradeoff between:
- High capability + Low success probability (strategic bet)
- Low capability + High success probability (cash cow)
- Medium capability + Medium success probability (balanced)

### 2. Dashboard/Analytics Questions

**Q2.1**: Should the primary view be:
- Individual venture evaluation (current mockups)
- Portfolio balance visualization
- Both with easy switching

**Q2.2**: What visualizations best show the capability vs success balance?
- Two-axis scatter plot (X = capability, Y = success probability)
- Dual score cards side by side
- Stacked indicators
- Portfolio pie/donut showing distribution

**Q2.3**: How do we show portfolio-level balance?
- % of ventures in each quadrant (high-cap/high-success, high-cap/low-success, etc.)
- Trend over time (are we shifting toward capability-heavy or success-heavy?)
- Resource allocation view (where is attention going?)

**Q2.4**: Should the dashboard support:
- Scenario modeling ("what if we add this venture?")
- Retrospective analysis ("how did our predictions compare to reality?")
- Calibration tracking ("are our scores accurate over time?")

### 3. Decision Logic Questions

**Q3.1**: Given two ventures competing for resources:
- Venture A: Capability score 22/25, Success probability 40%
- Venture B: Capability score 8/25, Success probability 85%

How should the system recommend? What's the decision framework?

**Q3.2**: Should there be "portfolio quotas"?
- "At least X% of ventures must be high-capability"
- "No more than Y% can be pure exploitation (low capability contribution)"

**Q3.3**: How do we prevent gaming?
- Inflating capability scores to pass the Plane 1 > 10 gate
- Underestimating success probability to lower expectations

### 4. Visualization/Mockup Questions

**Q4.1**: The current mockups (4 images) focus on individual venture evaluation. What additional views are needed?

**Q4.2**: What's the right information density? Current mockups may be too complex for "10-second glanceability."

**Q4.3**: Should capability and success be shown:
- Separately (two distinct panels)
- Integrated (single visualization showing both)
- Contextually (success shown when relevant, capability always visible)

---

## Existing Mockups (For Reference)

Four mockups exist for the Venture Evaluation Matrix:

1. **Vector Field Focus View** (`Cybernetic venture dashboard analysis.png`)
   - Focuses on Plane 2 with 3D vector visualization
   - Scenario simulation capabilities

2. **Full Four-Plane Dashboard** (`Advanced venture evaluation dashboard overview.png`)
   - All four planes visible simultaneously
   - Radar chart for capabilities, horizontal bars for vectors
   - Constraint gates, exploration dial

3. **Four-Plane Dashboard Variant** (`Venture evaluation dashboard interface image.png`)
   - Similar to #2 with minor layout differences

4. **Polished Single-Card View** (`Truth Engine X venture evaluation dashboard.png`)
   - Cleaner layout, 3D hexagonal vector visualization
   - Most polished individual venture view

**Gap**: No mockups currently show:
- Portfolio-level capability vs success balance
- Trend analysis over time
- Comparative venture analysis

---

## Constraints and Requirements

### Must Have
- **Dark mode first** - Matches "aircraft cockpit" design philosophy
- **Glanceable** - Key status visible in under 10 seconds
- **Database-driven** - All data from EHG ventures table
- **Governance-compatible** - Clear escalation paths, audit trail

### Should Have
- **Mobile responsive** - Chairman may check on mobile
- **Drill-down capability** - Summary → Detail progression
- **Historical tracking** - See how scores evolved over venture lifecycle

### Must NOT Have
- **Gamification** - No badges, streaks, celebrations
- **Complexity theater** - No unnecessary animations or 3D effects
- **False precision** - Don't show "0.8134" when "~80%" is appropriate

---

## What Success Looks Like

A successful research output will provide:

1. **Conceptual Model**: Clear framework for how capability and success relate in the matrix
2. **Decision Logic**: Rules or heuristics for balancing the two dimensions
3. **Visualization Recommendations**: Specific suggestions for dashboard views
4. **Mockup Guidance**: Direction for new/revised mockups that show the balance
5. **Implementation Path**: How to add this to the existing four-plane design without breaking it

---

## Files for Reference

| File | Description |
|------|-------------|
| `brainstorm/topic-3-venture-evaluation-matrix.md` | Full four-plane specification with current mockup analysis |
| `brainstorm/topic-2-compounding-capabilities.md` | Capability compounding strategy context |
| `brainstorm/triangulation-synthesis.md` | Previous triangulation findings across all 5 topics |
| `docs/vision/specs/04-eva-orchestration.md` | EVA architecture (provides recommendations) |

---

## Deliverable Format

Please provide your analysis in the following structure:

### 1. Conceptual Framework
- How do capability and success relate?
- Should success be explicit or implicit in the model?

### 2. Recommended Model Changes
- Modifications to the four-plane design
- New scoring or aggregation logic

### 3. Dashboard Visualization Recommendations
- Primary view design
- Portfolio balance view
- Key metrics to display

### 4. Mockup Direction
- What new mockups are needed?
- What changes to existing mockups?

### 5. Decision Logic
- How to handle capability vs success tradeoffs
- Portfolio-level balancing rules

### 6. Implementation Considerations
- Database schema implications
- EVA algorithm requirements
- Calibration approach

### 7. Risks and Mitigations
- What could go wrong with this approach?
- How do we prevent gaming or misuse?

---

## Triangulation Instructions

This prompt will be given to:
- **Claude** (Opus 4.5)
- **OpenAI** (GPT-4)
- **Antigravity**

Each AI should provide independent analysis. Responses will be synthesized to find consensus and identify disagreements.

**Evidence Requirement**: Where possible, reference specific files, industry frameworks, or research to support recommendations.

---

*Deep Research Prompt for Topic 3 Triangulation*
*Created: 2026-01-08*
*For use in Ground-Truth Triangulation Protocol*
