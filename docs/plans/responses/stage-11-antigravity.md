# Stage 11 "Go-To-Market" -- AntiGravity Response

> Independent response to the Stage 11 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Segment Depth | Persona, pain points, conversion rates | Name, description, TAM/SAM/SOM | **5 Critical** | High. Stage 12 (Sales) needs personas to build scripts/funnels. | CLOSE GAP | Does CLI need full personas? YES. "Identity" phase without "Who" is incomplete. |
| Channel Meta | Type (paid/owned/etc), priority, tactics | Name, budget, CAC, KPI | **3 Medium** | Moderate. Harder to analyze strategy balance (e.g. "too much paid"). | CLOSE GAP | Can we infer type from name? Maybe, but explicit is safer for AI critique. |
| GTM Metrics | Leads, conv %, customers, CAC target | Budget, CAC breakdown | **4 High** | High. Verification of business model (Stage 7) viability. | CLOSE GAP | Are these just guesses? Yes, but modeled guesses are better than no model. |
| Launch Detail | Status, objectives, success metrics | Milestone, date, owner | **2 Low** | Low. "Status" is for execution, "Objectives" is good but implicit in KPI. | PARTIAL | Keep CLI simple. Add deliverables array? |
| Flexible Counts | Flexible channel counts | EXACTLY 8 channels, 3 tiers | **3 Medium** | Low. Rigid counts might force bad data. | KEEP CLI | "Forced Breadth" is the EVA method. Don't relax. |

### 2. AnalysisStep Design

The analysisStep will bridge the gap between "Brand Identity" (Stage 10) and "Market Execution" (Stage 11).

**Inputs (Context)**:
- **Stage 1** (Concept): problemStatement, valueProposition.
- **Stage 4** (Competitors): Where are competitors active? (Channel overlap).
- **Stage 7** (Economics): LTV, target_cac (Constraint), pricing_model.
- **Stage 10** (Identity): brandGenome.audience (Target), brandGenome.archetype (Voice), brandGenome.values.
- **Stage 9** (Exit): buyer_type (Strategic/PE) might prefer different growth levers (Growth vs Profit).

**Process (AI Logic)**:
1. **Segment Synthesis**: Comprehensive deep-dive into the audience from Stage 10 to generate 3 distinct tiers with personas.
2. **Channel Strategy**: Rigorous selection of 8 distinct channels. Constraint: Must include mix of Paid, Organic, Outbound (if B2B).
3. **Budgeting**: Allocate total_monthly_budget across channels.
4. **Coherence Check**: Ensure Weighted Avg CAC < Stage 7 LTV.

**Outputs (JSON)**:
```json
{
  "segments": [
    {
      "name": "Tier 1: Early Adopters",
      "persona": "The Tech-Forward Optimizer",
      "pain_points": ["Specific pain 1", "Specific pain 2"],
      "tam": 100000, "sam": 50000, "som": 5000,
      "estimated_conversion": 0.02
    }
  ],
  "channels": [
    {
      "name": "LinkedIn Ads",
      "type": "PAID",
      "tactics": ["Sponsored content targeting CTOs"],
      "monthly_budget": 2000,
      "expected_cac": 150,
      "primary_kpi": "Leads",
      "rationale": "High affinity with Tier 1 persona."
    }
  ],
  "launch_timeline": [...]
}
```

### 3. Fixed Counts vs Flexible Decision

**Decision: PRESERVE RIGIDITY (Mostly).**

- **Why**: The prompt states "Forces prioritization" (Tiers) and "Forces breadth" (Channels). In early-stage venture planning, the danger is usually narrow vision (only doing what's comfortable) or lack of focus (targeting everyone).
- **Refinement**: Keep REQUIRED_TIERS = 3 and REQUIRED_CHANNELS = 8.
- **Allow**: Zero budget for some channels if they are "Parked/Future", but force the user/AI to name them and assign a KPI, effectively populating the backlog.

### 4. Channel Classification Decision

**Decision: ADOPT GUI CLASSIFICATION.**

- **Add**: `type` enum: `['PAID', 'ORGANIC', 'EARNED', 'OWNED', 'PARTNER']`.
- **Value**: Allows the analysisStep to critique the "Marketing Mix". E.g., "Warning: 100% of budget is in Paid channels; high risk of CAC spikes."

### 5. Segment Depth Decision

**Decision: ADOPT GUI DEPTH (Personas & Pain Points).**

- **Why**: Stage 10 gives us "Brand Voice". Stage 11 must define "Who listens?". TAM/SAM/SOM is just numbers. Persona and Pain Points are the logic for the numbers.
- **Implementation**: Add `persona` (string), `pain_points` (array of strings), and `behavior` (string) to the tiers object.

### 6. GTM Metrics Decision

**Decision: ENHANCE CLI METRICS.**

**Current**: total_budget, avg_cac.
**Add**:
- `projected_monthly_leads` (derived from Budget / CAC).
- `projected_monthly_customers` (derived from Leads × Conversion).
- `cac_payback_sanity_check` (Comparison against Stage 7 Price).

**Why**: These are the "Physics" of the business. We need to see if the GTM plan is distinct from reality.

### 7. Stage 10 → 11 Consumption Mapping

- **Brand Archetype (Stage 10) → Channel Voice/Tactics (Stage 11)**.
  - "Magician" archetype → "Transformational Content" (Content Marketing) & "Webinars" (Events).
  - "Outlaw" archetype → "Disruptive PR" and "Viral Social".
- **Audience (Stage 10) → Segment Definition (Stage 11)**.
  - Stage 10 audience is usually a high-level string. Stage 11 breaks this into 3 actionable tiers.

### 8. Budget-Pricing Coherence Check

**Requirement: HARD WARNING.**

- If Stage 11 Avg CAC > Stage 7 LTV / 3 (or relevant ratio), the system must flag a "Unviable GTM Model" warning.
- This checks if we are paying more to acquire customers than they are worth, correcting for the "Idea Phase Optimism".

### 9. CLI Superiorities (Preserve)

- **Rigidity**: The Required 8 Channels is a better forcing function than the GUI's "Select as many as you want". It ensures a diversification strategy is at least considered.
- **Simplicity**: Deriving total_budget automatically rather than asking for it as a separate input ensures consistency.

### 10. Recommended Stage 11 Schema

```javascript
schema: {
  tiers: {
    type: 'array', exactItems: 3,
    items: {
      name: { type: 'string', required: true },
      persona: { type: 'string', required: true },
      pain_points: { type: 'array', items: { type: 'string' } },
      tam: { type: 'number', min: 0 },
      sam: { type: 'number', min: 0 },
      som: { type: 'number', min: 0 },
      est_conversion_rate: { type: 'number', min: 0, max: 1 }
    }
  },
  channels: {
    type: 'array', exactItems: 8,
    items: {
      name: { type: 'string', required: true },
      type: { type: 'string', enum: ['PAID', 'ORGANIC', 'EARNED', 'OWNED', 'PARTNER'] },
      tactics: { type: 'array', items: { type: 'string' } },
      monthly_budget: { type: 'number', min: 0 },
      expected_cac: { type: 'number', min: 0 },
      primary_kpi: { type: 'string' }
    }
  },
  launch_timeline: { /* Keep existing */ },
  gtm_metrics: {
    total_budget: { type: 'number', derived: true },
    blended_cac: { type: 'number', derived: true },
    est_monthly_customers: { type: 'number', derived: true }
  }
}
```

### 11. Minimum Viable Change (Priority Ordered)

1. Update Schema: Add `persona` and `pain_points` to Tiers. Add `type` to Channels.
2. Implement AnalysisStep: Build the prompt to consume Stage 1/4/7/10 and generate the strict 3-tier/8-channel structure.
3. Implement Coherence Check: Add validation logic to compare CAC vs Stage 7 Price/Margin.

### 12. Cross-Stage Impact

- **Stage 12 (Sales)**: Will rely heavily on the persona and pain_points defined here to generate "Sales Scripts" and "Objection Handling".
- **Stage 5 (Profitability)**: Might need a "Re-run" or "Update" if the detailed GTM budget differs significantly from the initial Stage 5 estimates.

### 13. Dependency Conflicts

- **Stage 5 vs Stage 11 Budget**: Stage 5 (Profitability) likely estimated a "Marketing % of Revenue". Stage 11 builds a bottom-up budget. **Conflict**: Bottom-up (Stage 11) is almost always higher than Top-down (Stage 5). **Resolution**: Stage 11 should warn if Total Budget > Stage 5 Marketing Allocation, possibly triggering a "Profitability Update" flag.

### 14. Contrarian Take

**Argument: Stop calculating CAC in Stage 11.**

- **Why**: At the "Identity" phase (pre-product, pre-revenue), CAC is a pure hallucination. Forcing the AI (or user) to invent specific CACs for "Influencer Marketing" or "PR" is creating false precision.
- **Risk**: We build financial models (Stage 12, Blueprints) on top of these made-up numbers, compounding error.
- **Alternative**: Use "Effort Score" (1-10) and "Reach Potential" (Low/Med/High) instead of dollar CAC.
- **Counter-Counter**: Investors expect to see CAC assumptions, even if wrong. It shows you understand the lever.
- **Verdict**: Keep CAC, but label it "Target CAC" or "Est. CAC".
