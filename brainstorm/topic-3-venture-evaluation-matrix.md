# Brainstorm Topic 3: Venture Evaluation Matrix (Four-Plane Control System)

## The Problem with Metaphors

Trees and stars are **descriptive metaphors, not control systems**.

What EHG needs:
- **Adversarial**, not pastoral
- Separates orientation, execution, risk, and timing
- Makes exceptions first-class
- **Machine-operable**, not just human-legible
- Does not smuggle inevitability or destiny into decisions

---

## The EHG Strategic Control Stack

Four orthogonal planes that interact but never collapse into one another.

### One-Line Summary:
> "EHG is a capability graph moving through a hostile vector field under explicit constraints, with a controllable risk dial."

---

## PLANE 1: Capability Graph Impact

**Question**: What does this make EHG better at—permanently?

| Dimension | Description | Score (0–5) |
|-----------|-------------|-------------|
| New Capability Node | Introduces a genuinely new capability | |
| Capability Reuse Potential | Likely to be reused by ≥2 other ventures | |
| Graph Centrality Gain | Increases importance of existing core capabilities | |
| Maturity Lift | Hardens reliability, speed, or quality of existing capability | |
| Extraction Clarity | Capability can be abstracted cleanly (API, service, playbook) | |

**Plane 1 Score**: 0–25

**Hard Rule**: If Plane 1 < 10, venture must justify itself as a time-boxed exception or be rejected.

### Key Invariant:
> Every venture must increase graph connectivity or edge weight. If it doesn't, it is structurally extractive—it weakens the system.

---

## PLANE 2: External Vector Alignment

**Question**: Which real-world forces does this ride—or fight?

| Vector | Tailwind / Neutral / Headwind | Strength (0–5) |
|--------|-------------------------------|----------------|
| Market Demand Gradient | | |
| Technology Cost Curve | | |
| Regulatory Trajectory | | |
| Competitive Density | | |
| Timing Window (Now vs Later) | | |

**Required Declarations**:
- Primary tailwind:
- Primary headwind:
- Headwind mitigation strategy:

**Plane 2 Net Score**: –10 to +25

**Hard Rule**: Strong headwinds are allowed only if explicitly declared and mitigated.

### Key Invariant:
> Strategy is the art of moving with strong vectors and across weak ones.

---

## PLANE 3: Control & Constraint Exposure

**Question**: What could blow us up?

This plane is **not additive**. It is **gated**.

| Constraint Area | Exposure Level |
|-----------------|----------------|
| Spend Risk | Low / Medium / High |
| Legal / Regulatory Risk | Low / Medium / High |
| Brand Risk | Low / Medium / High |
| Security / Data Risk | Low / Medium / High |
| Autonomy Risk (agent misfire) | Low / Medium / High |

**Mandatory Declarations**:
- Non-autonomous actions required: Yes / No
- Kill-switch defined: Yes / No
- Escalation owner: ___

**Hard Rules**:
- Any High exposure → Chairman or EVA escalation required
- Missing kill-switch → automatic block

**Plane 3 Status**: ✅ Pass / ❌ Block / ⚠ Escalate

### Key Invariant:
> No amount of opportunity overrides constraint violations.

---

## PLANE 4: Exploration vs Exploitation Position

**Question**: What rules apply to this venture?

| Dial Position | Select One |
|---------------|------------|
| Pure Exploration | [ ] |
| Skewed Exploration | [ ] |
| Balanced | [ ] |
| Skewed Exploitation | [ ] |
| Pure Exploitation | [ ] |

| Dimension | Exploration | Exploitation |
|-----------|-------------|--------------|
| Time Horizon | Long | Short |
| Efficiency Tolerance | Low | High |
| Failure Tolerance | High | Low |
| Governance Strictness | Flexible | Strict |
| Success Metric | Learning | ROI / Reliability |

**Required**:
- Declared Review Interval: ___ weeks
- Auto-expiry Date (if exploratory): ___

**Hard Rule**: Exploratory ventures without expiry dates are invalid.

### Key Invariant:
> Exceptions are allowed only if explicitly declared and time-bound.

---

## Aggregate Decision Logic (Non-Negotiable)

### Step 1 — Constraint Check
- Plane 3 ❌ Block → Reject
- Plane 3 ⚠ Escalate → Hold

### Step 2 — Capability Test
- Plane 1 < 10 → Reject unless exception granted

### Step 3 — Strategic Viability
- Plane 2 net score negative → Require explicit rationale

### Step 4 — Dial Consistency
- Metrics must match declared dial position
- Mismatch → Forced pivot or kill

---

## EVA Recommendation Output Format

```json
{
  "venture_id": "XYZ",
  "plane_1_capability_score": 18,
  "plane_2_vector_score": 11,
  "plane_3_status": "pass",
  "plane_4_mode": "skewed_exploration",
  "recommendation": "PROCEED",
  "confidence": 0.81,
  "conditions": [
    "capability_extraction milestone by Stage 3",
    "regulatory review before spend > $X",
    "auto-review in 6 weeks"
  ]
}
```

---

## UI Visualization Spec

### Philosophy
- **Decision-first, adversarial-aware, glanceable**
- Understand status, risk, and leverage in **under 10 seconds**
- Think **aircraft cockpit**, not analytics dashboard

### Structure: One Decision Page + Focused Drill-Downs

| Level | Purpose | Navigation |
|-------|---------|------------|
| **Level 0** | Canonical Decision Page | ONE page for 90% of usage |
| **Level 1** | In-Context Expansions | Inline drawers/panels (same page) |
| **Level 2** | Secondary Pages | Analysis mode (rare, intentional) |

### Mental Model:
> "One page to decide. Many views to understand. Zero pages to justify."

### Primary View: Venture Evaluation Card

```
┌───────────────────────────────────────────────────────────┐
│ Venture: Truth Engine X        Status: 🟢 PROCEED          │
│ Mode: Skewed Exploration       Confidence: 0.81           │
├───────────────────────────────────────────────────────────┤
│ Capability Impact        External Vectors        Constraints│
│ (Radar)                  (Vector Bars)          (Gates)   │
│                                                           │
│   ◯─────◯                 Demand     ████████▌  +4       │
│  ◯   ◯   ◯                Tech Cost  ████████▌  +4       │
│   ◯─────◯                 Regulation ███▌       –1       │
│                                                           │
│ Centrality: +0.7        Net Vector Score: +11              │
├───────────────────────────────────────────────────────────┤
│ ⚠ Review in 6 weeks     ⏳ Auto-expiry: 2026-03-01         │
└───────────────────────────────────────────────────────────┘
```

### Plane 1: Capability Graph Radar
- Radar chart with 5 axes (New Capability, Reuse Potential, Centrality Gain, Maturity Lift, Extraction Clarity)
- Overlay: Current venture vs portfolio average vs strategic threshold

### Plane 2: External Vector Field
- Horizontal force bars (green = tailwind, gray = neutral, red = headwind)
- **Critical**: Every red bar must have a mitigation badge

### Plane 3: Constraint Gate Panel
- Binary and aggressive vertical gate stack
- Any 🔴 **locks the card** and disables action buttons

### Plane 4: Exploration-Exploitation Dial
- Single horizontal dial with labels
- Mandatory: Auto-expiry date, next review countdown, ruleset badge

### Portfolio View: Matrix Heatmap
- X-axis: Capability Impact (Plane 1)
- Y-axis: Vector Strength (Plane 2)
- Dot color = Constraint Status
- Dot shape = Dial Position

### Visual Design Language
- Dark-mode-first
- High contrast
- No gradients
- Minimal animation
- Red is rare and serious
- Green is earned, not default

---

## Where Old Metaphors Still Live (Safely)

Metaphors become **UI**, not control systems:

| Old Metaphor | New Role |
|--------------|----------|
| 🌳 Tree | Visual shorthand for capability maturity |
| ✨ Stars | Communication artifacts for long-term intent |

Used only in:
- Briefings
- Human alignment
- Storytelling

**Never in gating logic.**

---

## Why This Is Strictly Better

This model:
- ✅ Handles adversaries
- ✅ Handles discontinuities
- ✅ Handles exceptions
- ✅ Handles regulation
- ✅ Handles short-term arbitrage
- ✅ Handles long-term vision
- ✅ Is simulation-friendly
- ✅ Is governance-compatible
- ✅ Is machine-enforceable

Most importantly:
> It does not confuse explanation with control.

---

## Open Questions for Triangulation

### Conceptual Questions:

1. **Plane Weighting**: Should all four planes have equal weight, or should some dominate in certain contexts?

2. **Threshold Calibration**: The "Plane 1 < 10 = reject" rule—is this the right threshold? How do we calibrate?

3. **Vector Volatility**: How do we handle rapidly changing vectors (e.g., regulatory shifts mid-venture)?

4. **Exception Governance**: Who can grant exceptions? What's the accountability chain?

5. **Cross-Venture Interactions**: How do we model ventures that compete for the same capability resources?

### Implementation Questions:

6. **Database Schema**: How do we store four-plane scores with versioning and audit trail?

7. **EVA Scoring Algorithm**: What's the actual math behind "confidence: 0.81"?

8. **Real-Time Updates**: Should plane scores update automatically as external data changes?

9. **Integration with 25-Stage Workflow**: At which stages do we re-evaluate the matrix?

10. **Retrospective Analysis**: How do we compare predicted scores vs. actual outcomes for calibration?

### UI/UX Questions:

11. **Mobile Experience**: How does the decision card work on mobile?

12. **Comparison Mode**: How do we compare two ventures side-by-side on the matrix?

13. **Alert Escalation**: How does the UI notify Chairman of status changes?

---

## Relationship to Topic 2 (Compounding Capabilities)

This matrix operationalizes Topic 2's strategy:
- **Plane 1** directly measures capability compounding
- **Hard Rule** (Plane 1 < 10 = reject) enforces "no extractive ventures"
- **Capability Graph** visualization makes compounding visible

---

## Draft UI Mockups (Visual Analysis)

Four draft images were created to visualize the Venture Evaluation Matrix concept.

### Image 1: Vector Field Focus View
**File**: `Cybernetic venture dashboard analysis.png`

**Key Elements**:
- **3D Vector Field Visualization**: Dynamic representation of external forces with directional arrows
- **Tabs**: Capability Map | External Vector Intelligence | Risk/Governance
- **Vector Magnitude indicator**: Shows strength of combined forces
- **Sources & Indicators panel**: Lists data sources feeding the vectors
- **Scenario Deltas section**: Shows "Market Demand Fluctuation" and "Risk Advisory: Regulatory Uncertainty"
- **EVA Recommendation strip**: PROCEED | Confidence: 0.81
- **Action buttons**: HOLD | ESCALATE

**Unique Feature**: This view focuses on Plane 2 (External Vectors) with scenario simulation capabilities.

---

### Image 2: Full Four-Plane Dashboard (Detailed)
**File**: `Advanced venture evaluation dashboard overview.png`

**Key Elements**:
- **Header**: Venture name, Status (PROCEED), Mode (Skewed Exploration), Confidence (0.81)
- **Plane 1 - Capability Impact**: Radar chart with 5 axes, Graph Score: 18, Centrality Increase: +0.7
- **Capability Details Table**: Nodes, Reuse Candidates, Extraction status
- **Plane 2 - External Vectors**: Horizontal bars (Market Demand +4, Tech Cost +3, Regulation -1, Competition +2, Timing Window +3), Net Vector Score: +11
- **Plane 3 - Constraints**: Color-coded gates (Spend Risk: LOW, Legal/Reg: MEDIUM, Brand Risk: LOW, Autonomy Risk: MEDIUM)
- **KILL-SWITCH DEFINED badge**: Confirms safety mechanism exists
- **Security Risk panel**: Shows "TRUST ORIGIN" verification
- **Plane 4 - Exploration/Exploitation Dial**: Visual slider with "Skewed Exploration" selected
- **Review/Expiry fields**: "Review in 6 Weeks" | Auto-Expiry date
- **Action buttons**: HOLD | ESCALATE | KILL

**Assessment**: This is the closest to the "canonical decision page" spec—all four planes visible simultaneously.

---

### Image 3: Four-Plane Dashboard (Variant)
**File**: `Venture evaluation dashboard interface image.png`

**Key Elements**: Nearly identical to Image 2 with minor layout variations.

**Notable Differences**:
- Security Risk section has expanded context
- Slightly different spacing on constraint indicators

**Assessment**: Good A/B test candidate against Image 2.

---

### Image 4: Polished Single-Card View
**File**: `Truth Engine X venture evaluation dashboard.png`

**Key Elements**:
- **Cleaner header layout**: Status and confidence prominently displayed
- **3D Hexagonal Vector visualization**: More visually striking than flat bars
- **Skewed Exploration details panel**:
  - Review In 6 Weeks
  - Auto-Expiry: 2026-03-01
  - "Strengthening Decision Intelligence root"
  - "Riding strong market & tech tailwinds"
  - "Contained risk with kill-switch defined"
- **Same action buttons**: HOLD | ESCALATE | KILL

**Assessment**: Most polished version. The hexagonal vector visualization and expanded exploration details add clarity.

---

### Visual Design Observations

**What Works Well**:
| Element | Assessment |
|---------|------------|
| Dark mode | ✅ Matches "aircraft cockpit" spec |
| Color-coded constraints | ✅ GREEN/YELLOW/RED instantly legible |
| Radar chart for capabilities | ✅ Shows 5 dimensions at once |
| KILL-SWITCH DEFINED badge | ✅ Makes safety visible |
| Action buttons (HOLD/ESCALATE/KILL) | ✅ Clear decision vocabulary |
| Confidence score prominent | ✅ EVA accountability visible |

**Questions for Triangulation**:
1. **Vector Visualization**: Flat bars (Image 2) vs 3D hexagon (Image 4)—which is more decision-useful?
2. **Information Density**: Is this too much for "10-second glanceability"?
3. **Mobile Responsiveness**: How would this collapse on smaller screens?
4. **Color Choices**: Is the blue/green palette sufficiently warning-oriented?
5. **Recommendation Strip**: Should EVA's reasoning be visible by default or expandable?

---

### Image File Locations
```
c:/Users/rickf/Downloads/Cybernetic venture dashboard analysis.png
c:/Users/rickf/Downloads/Advanced venture evaluation dashboard overview.png
c:/Users/rickf/Downloads/Venture evaluation dashboard interface image.png
c:/Users/rickf/Downloads/Truth Engine X venture evaluation dashboard.png
```

---

*Topic 3 of 4 for Ground-Truth Triangulation Protocol*
*Created: 2026-01-08*
*Updated: 2026-01-08 (added visual mockup analysis)*
*Source: ChatGPT conversation with Rick*
