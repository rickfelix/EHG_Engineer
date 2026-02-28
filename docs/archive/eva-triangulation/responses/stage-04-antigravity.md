---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 4 "Competitive Intel" -- AntiGravity Response

> Independent response to the Stage 4 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 5 Kill Gate) | Verdict | Challenge |
|-----|---------|---------|:-----------------:|---------------------------------------|---------|-----------|
| Competitor Discovery | Active AI agent (Edge Function) discovers & analyzes competitors | Passive validation only (no analysisSteps) | **5 Critical** | High. Stage 5 requires revenue/cost projections. Without competitor pricing/model data, these projections are pure guesses, making the Stage 5 ROI kill gate meaningless. | CLOSE | Can Stage 3's "Market Assumptions" service provide this? Unlikely to provide granular competitor data (pricing tiers, features) needed for accurate financial modeling. |
| Pricing Model Data | Explicit field: pricing_model (Freemium, Tiered, etc) | Missing from schema | **5 Critical** | High. Essential for Stage 5's revenue and breakEvenMonth calculations. You cannot build a financial model without reference pricing. | CLOSE | Essential data point. |
| Market Share/Size | market_share estimate | Missing | **4 High** | Medium. Affects revenuePotential in Stage 3 (already passed), but validator for Stage 5's "Likely accessible market". | ADAPT | Move to "Market Size" specific field rather than per-competitor share, or derive from Stage 3. |
| Feature Vision | Weighted 6-feature coverage matrix | Simple strengths/weaknesses array | **2 Low** | None. Stage 5 is purely financial (ROI/Break-even). Feature differentiation informs conversion rates (a Stage 5 assumption), but a complex matrix is overkill for a kill gate. | ELIMINATE | Convert to text-based "Differentiation Factors" in strengths. |
| Scoring | Differentiation (0-10), Defensibility (A-F) | None | **3 Medium** | Low. Stage 5 doesn't input these scores. They are "confidence boosters" for the human constructing the Stage 5 model. | ELIMINATE | The Stage 5 Kill Gate is strictly financial. These scores are Stage 3 concerns (Barrier/Execution). |
| Persona Mapping | Links Stage 3 Personas to Competitors | None | **2 Low** | None. | ELIMINATE | Keep Stage 4 focused on the competitor, not the customer (Stage 3). |
| URL/Website | website_url | Missing | **5 Critical** | Medium. Required for verification and deep-dive if the financial model looks suspicious. | CLOSE | Trivial schema addition. |

### 2. Competitor Discovery Recommendation

The CLI must implement an active discovery phase. Passive entry is insufficient for a "Venture Builder".

**Recommended Pipeline:**

1. **Input**: Consume stage-03 output (specifically the Competitor Entities defined during triangulation).
2. **Action**: Create a standard `analysisStep` in `stage-04.js`:
   - **Tool**: browser_search (or generic search tool)
   - **Query**: "[Competitor Name] pricing model features reviews"
   - **Extraction**: Use an LLM to parse search results into the Schema (Pricing tiers, Core Value Prop, customer sentiment).
   - **Fallback**: If Stage 3 provided no specific entities, run a broad search for "competitors to [Venture Name/Description]" (Blue Ocean check).
3. **Data Source**:
   - Primary: Live Web Search (via analysisSteps).
   - Secondary: Stage 3 competitiveBarrier justification text (context only).

### 3. Feature Comparison Decision

**Decision: ELIMINATE the complex matrix.**

Reasoning: The GUI's "Weighted Feature Matrix" is a product management tool, not a venture viability tool. Stage 4 is a "Truth" stage (Stages 1-5). The Truth we need is: "Can we compete economically?"

**Replacement**: A simplified `differentiation_factor` text field.
- Old: "User Interface: Advanced (8/10)"
- New: `strengths: ["Superior UI latency (10ms vs 100ms)"]`

**Impact**: Stage 5 needs to know why we can charge $X. This is answered by qualitative differentiation, not a 6xN matrix.

### 4. Scoring Recommendation

**Decision: ELIMINATE all Stage 4 scoring.**

Reasoning:
- Stage 3 already killed the idea if competitiveBarrier was < 50.
- Stage 5 will kill the idea if the financials don't work.
- A "Defensibility Grade" generated in Stage 4 is redundant with Stage 3 and noise for Stage 5.

**Exception**: `confidence_score` (1-100) on the data extraction itself. If the AI couldn't find pricing, Stage 5 needs to know that the financial model is built on shaky ground.

### 5. Stage 3 -> Stage 4 Pipeline

Current Gap: CLI Stage 4 starts empty (`defaultData: []`). Fix:

1. **Orchestrator Change**: When initializing Stage 4, pre-populate the competitors array from Stage 3's context if available.
2. **Stage 3 Update**: Ensure Stage 3's output strictly formats competitors as entities, not just free text.
3. **Refinement**: Stage 4's first `analysisStep` should be "Verify and Expand Stage 3 Competitors".

### 6. CLI Superiorities

- **Speed**: No 10-second polling loop or "Skip" button. Analysis happens as fast as the LLM/Tool can execute.
- **Focus**: Specific `swot` structure is cleaner than the GUI's unstructured "notes" + rigid matrix.
- **Validation**: The CLI's `validate()` function enforces data integrity (unique names, required fields) which the GUI handled loosely via UI warnings.

### 7. Recommended Stage 4 Schema

```javascript
schema: {
  competitors: {
    type: 'array',
    minItems: 1,
    items: {
      name: { type: 'string', required: true },
      url: { type: 'string', required: true }, // NEW
      position: { type: 'string', required: true },
      pricing_model: {
         type: 'enum',
         values: ['Freemium', 'Subscription', 'One-time', 'Enterprise', 'Marketplace', 'Unknown'],
         required: true
      }, // NEW
      pricing_tiers: { type: 'array', items: { type: 'string' } }, // NEW (e.g. "$10/mo", "$99/year")
      threat: { type: 'enum', values: ['H', 'M', 'L'], required: true },
      strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
      weaknesses: { type: 'array', minItems: 1, items: { type: 'string' } },
      // SWOT sub-object preserved for structure
      swot: { ... }
    }
  },
  // Global Market Context (moved from individual competitors)
  market_size_estimate: { type: 'string' }, // NEW: "SAM: $50M"
  confidence_score: { type: 'integer', min: 0, max: 100 } // NEW: Quality of research
}
```

### 8. Minimum Viable Change (Priority Ranked)

1. **Schema Update (High)**: Add `url`, `pricing_model`, and `pricing_tiers` to `stage-04.js`.
2. **Agent Integration (Critical)**: Implement `analysisSteps` in `stage-04.js` to:
   - Take competitor names from input (or Stage 3).
   - Search for them.
   - Extract pricing/positioning.
3. **Pipeline Wiring (Medium)**: Pass Stage 3 competitor list into Stage 4's `defaultData` or prompt context.

### 9. Cross-Stage Impact

**Stage 5 (Profitability)**:
- Impact: Stage 5 inputs (`year1.revenue`) are user-entered. The User cannot reliably estimate revenue without the `pricing_tiers` data from Stage 4.
- Risk: If Stage 4 remains passive/empty, Stage 5 becomes a "Garbage In, Garbage Out" generator, potentially passing non-viable ventures or killing viable ones based on hallucinated pricing.

**Stage 3 (Validation)**:
- Feedback Loop: If Stage 4 discovers a "High Threat" competitor that was missed in Stage 3, it should theoretically flag a "Reality Gate" breach, but for MVP, we just accept the new data.
