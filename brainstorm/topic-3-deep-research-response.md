# Topic 3 Deep Research: Balancing Capability Production vs Venture Success
**Date**: 2026-01-08  
**Context**: Extends `brainstorm/topic-3-deep-research-prompt.md` and the Four-Plane spec in `brainstorm/topic-3-venture-evaluation-matrix.md`.

---

### 1. Conceptual Framework

**Core distinction**:
- **Capability contribution** is an *ecosystem outcome* (internal compounding).
- **Venture success probability** is an *external outcome* (commercial survival/returns).

These two are **not substitutes** and should not be collapsed into one number. Treat them as a **bi-objective control problem**:
- Objective A: maximize **EHG capability graph impact** (Plane 1)
- Objective B: maximize **commercial success likelihood** (new explicit forecast)

**Where success probability fits**
- It should be **explicit as a forecast output**, not a fifth “plane” that competes with Plane 2 and Plane 3.
- Reason: Planes are designed to be **orthogonal control surfaces** (capability / vectors / constraints / rules). “Success probability” is an *aggregate prediction* that should be computed from multiple planes + stage evidence and then tracked/calibrated.

**Important governance rule**:
- The UI must present success probability as a **bucketed estimate + confidence band** (avoid false precision), and always show the **evidence basis** (Facts/Assumptions/Simulations/Unknowns).

---

### 2. Recommended Model Changes

#### 2.1 Keep the four planes. Add one new output: “Success Outlook”
Add a **Success Outlook panel** (forecast) that is produced by EVA and is explicitly *downstream* of the planes:
- **Success Likelihood (0–100%)**: bucketed (e.g., 10% bands)
- **Forecast Confidence**: Low/Med/High (not a second decimal)
- **Primary failure modes**: top 3 drivers (e.g., distribution risk, regulatory risk, unit economics)
- **Key leading indicators**: what would move the forecast up/down

This preserves plane orthogonality and avoids redundancy with Plane 2 (vectors) and Plane 3 (constraints).

#### 2.2 Add a “Portfolio Frontier” rule (not a weighted sum)
Replace any temptation to compute a single “final score” with:
- **Sequential gates (as you already do)** for safety and governance (Plane 3, then Plane 1 thresholding, then vector rationale, then dial consistency).
- **Portfolio optimization** for resource allocation:
  - The decision isn’t “which is best?” but “which set gives us the best mix?”
  - Use a **Pareto frontier** view and a **portfolio quadrant distribution**.

#### 2.3 Make exceptions first-class (but bounded)
Keep your existing exception doctrine (Plane 4 expiry) and extend it:
- **Low capability + high success** can be approved only as **explicit exploitation** with:
  - time-boxed review cadence
  - explicit “cash mandate” (what it funds / what capability work it subsidizes)
  - a cap on portfolio allocation (see Decision Logic)
- **High capability + low success** can be approved only as **explicit exploration** with:
  - expiry date
  - a capability extraction milestone by a specific stage (e.g., Stage 3 or Stage 5)

---

### 3. Dashboard Visualization Recommendations

#### 3.1 Primary view (individual venture, 10-second glance)
Add one compact panel to the existing decision card:
- **Success Outlook** (bucketed % + confidence + 1-line driver)

Recommended layout (stays cockpit-like):
- Plane 1 (capability radar)  
- Plane 2 (vector bars)  
- Plane 3 (constraint gates)  
- Plane 4 (dial + review/expiry)  
- **Success Outlook (new)**: “~40% (Med)” + “Primary driver: distribution risk”

#### 3.2 Portfolio balance view (the missing view)
Make this a first-class toggle alongside the single-venture card:
- **Scatter plot (quadrants)**:
  - X = Plane 1 Capability (0–25)
  - Y = Success Likelihood (0–100%)
  - Color = Plane 3 status (Pass / Escalate / Block)
  - Shape = Plane 4 mode (exploration ↔ exploitation)
  - Optional halo = forecast confidence (Low/Med/High)

Portfolio overlays:
- **Frontier line** (Pareto-efficient set)
- **Quota bands** (target mix zones; see Decision Logic)
- **Resource allocation**: size dot by “current burn” or “planned allocation”

#### 3.3 Key metrics to display (portfolio header)
- **% ventures per quadrant**:
  - High-cap / high-success (compounders)
  - High-cap / low-success (strategic bets)
  - Low-cap / high-success (cash engines)
  - Low-cap / low-success (reject/kill candidates)
- **Trend over time**: quadrant drift + average confidence
- **Calibration health**: forecast error summary (simple: “forecast calibration: improving / stable / degraded”)

---

### 4. Mockup Direction

#### 4.1 New mockups needed
1) **Portfolio Frontier Screen** (primary gap)
- Scatter plot as described above + quadrant counts + allocation sizing

2) **Venture Comparison Drawer**
- Side-by-side: Plane 1 vs Success Outlook vs Plane 3 gates (fast “A vs B”)

3) **Success Outlook Evidence Drawer**
- Shows what produced the forecast:
  - Facts / Assumptions / Simulations / Unknowns
  - “What would change this number?” (leading indicators checklist)

#### 4.2 Changes to existing mockups
- Add a **small Success Outlook strip** to the header area.
- Make “Confidence: 0.81” explicitly labeled as either:
  - **Recommendation confidence** (EVA confidence in PROCEED/HOLD/etc.), and separate it from
  - **Success Likelihood** (forecast of commercial outcome)

This prevents “confidence theater” where users confuse model certainty with venture success.

---

### 5. Decision Logic

#### 5.1 Two decisions, not one
Treat decisions as two layers:
- **Admissibility (single-venture)**: can this venture exist in the system?
  - Plane 3 Block ⇒ Reject
  - Plane 1 < 10 ⇒ Reject unless exception granted (time-boxed)
  - Plane 4 exploration requires expiry; exploitation requires efficiency rules
- **Allocation (portfolio)**: how much time/money/tokens does it get vs others?
  - Use quadrant mix + frontier selection

#### 5.2 Handling the example (A vs B)
- Venture A: Capability 22, Success ~40%  
- Venture B: Capability 8, Success ~85%

Recommended framework:
- **B is not admissible by default** (Plane 1 < 10) unless explicitly tagged as:
  - “Cash engine exception” (exploitation), time-boxed, with an explicit funding mandate.
- If B is granted exception, then allocate by portfolio needs:
  - If portfolio is underweight cash engines, B may be chosen to fund exploration.
  - Otherwise A is preferred because it strengthens the capability lattice and still has non-trivial success odds.

#### 5.3 Portfolio-level balancing rules (simple, enforceable)
Start with policy targets (tune later with data):
- **At least 50%** of active ventures must be **Plane 1 ≥ 15** (capability-forward)
- **No more than 25%** of active ventures may be **Plane 1 < 10** (exceptions only)
- **At least 30%** of resourcing must sit on the **Pareto frontier**
- **Any low-success (<30%) venture** must have:
  - exploration dial set
  - expiry date
  - extraction milestone

These rules keep the doctrine real without pretending to predict outcomes perfectly.

---

### 6. Implementation Considerations

#### 6.1 Database schema implications (versioned, auditable)
Add a versioned evaluation snapshot table (do not overwrite fields on `ventures` only):
- `venture_evaluation_snapshots`
  - `venture_id`
  - `created_at`
  - `plane_1_score`, `plane_1_breakdown`
  - `plane_2_score`, `plane_2_breakdown`
  - `plane_3_status`, `plane_3_breakdown`
  - `plane_4_mode`, `review_interval`, `expiry_date`
  - **`success_likelihood_bucket`**, **`success_confidence`**, **`success_drivers`**
  - `recommendation`, `recommendation_confidence`
  - `evidence` (Facts/Assumptions/Simulations/Unknowns)

This matches the EVA governance posture in `docs/vision/specs/04-eva-orchestration.md` (append-only events + decision records).

#### 6.2 EVA algorithm requirements (forecast, not score theater)
Compute Success Likelihood from:
- Plane 2 vector structure (tailwinds/headwinds + mitigations)
- Plane 3 exposure (hard caps; block conditions)
- Stage artifacts as they arrive (market validation, unit economics, GTM readiness)
- Historical outcomes (once you have them)

Output must include:
- bucketed % + confidence band
- drivers + leading indicators
- explicit unknowns (what you don’t know yet)

#### 6.3 Calibration approach (portfolio learning loop)
Treat Success Likelihood as a forecast that is measured and improved:
- Store forecasts at time \(t\) (snapshot) and outcomes at time \(t+k\)
- Track simple calibration metrics (e.g., Brier score by bucket)
- Show a “calibration health” indicator in the portfolio view

---

### 7. Risks and Mitigations

- **Risk: false precision / confidence theater**
  - **Mitigation**: bucketed probabilities + confidence tier; separate “recommendation confidence” from “success likelihood.”

- **Risk: gaming Plane 1 to pass the gate**
  - **Mitigation**: require “Extraction Clarity” evidence, enforce extraction milestones, and track actual reuse later (capability ledger + reuse counts).

- **Risk: “capability junkyard” (many abstractions, little reuse)**
  - **Mitigation**: add deprecation discipline + reuse instrumentation; make “capability ROI” measurable before hard enforcement.

- **Risk: portfolio drifts into low-capability cash chasing**
  - **Mitigation**: portfolio quota caps + frontier requirement + explicit exception labeling.

- **Risk: system becomes too complex for 10-second decisions**
  - **Mitigation**: keep the decision card minimal; push drivers/evidence into drawers; reserve heavy analytics for the portfolio view.

---

## File created
- **New file**: `/mnt/c/_EHG/EHG_Engineer/brainstorm/topic-3-deep-research-response.md`

