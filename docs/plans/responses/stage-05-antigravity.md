# Stage 5 "Profitability" -- AntiGravity Response

> Independent response to the Stage 5 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| ROI Threshold | 15% Estimated ROI | 50% 3-Year ROI | **5 Critical** | High. A 50% hurdle kills viable ventures. 15% is standard for "investable". | ADAPT | CLI threshold is arbitrarily high and likely incorrect for early-stage. |
| Unit Economics | CAC, LTV, Payback, Churn | None (10 aggregated numbers) | **5 Critical** | Critical. Profitability is a function of unit economics. Aggregates hide fatal flaws (e.g. high churn). | CLOSE | Absolute necessity for a "Profitability" gate. |
| Financial Model | AI-generated from granular assumptions | Manual input of 10 aggregates | **5 Critical** | Critical. Without generation, the CLI stage is dead water. Stage 6 needs credible inputs. | CLOSE | CLI must generate these from Stage 4 data using LLM. |
| Kill Behavior | Recursion to Stage 3 | Hard Block | **3 Medium** | Medium. Hard block is fine if "Pivot" is an option. Recursion can cause loops in autonomous mode. | ADAPT | Keep Hard Block but add "Pivot" recommendation. |
| Granularity | Monthly (36mo) | Annual (3yr) | **3 Medium** | Medium. Monthly reveals cash flow dips (Valley of Death) that annual sums hide. | CLOSE | Monthly is better for "Break Even" accuracy. |
| Scoring | 0-100 Weighted Score | Pass/Kill Binary | **2 Low** | Low. Binary is sufficient for a Kill Gate. Score is nice allowed. | ADAPT | Use binary for gate, score for "Confidence". |
| Scenario Analysis | Optimistic / Real / Pessimistic | Single Projection | **4 High** | High. Single projection is often hallucinated. Range gives confidence. | ADAPT | Generate 3, evaluate Kill Gate on "Realistic". |

### 2. ROI Threshold Recommendation

**Verdict: 15% ROI (Projected) is the correct threshold.**

Why: A 50% return on investment over 3 years (1.5x MOIC) is an aggressive target for a mature business or a PE firm. For an early stage venture, the goal is viability and growth potential.

**Formula**: `ROI = (Total Net Profit Y1-3) / Initial Investment`

Note on inputs: If Net Profit is defined as Revenue - Expenses (EBITDA), then Total Net Profit needs to cover Initial Investment plus 15% to pass.

**Calculation**: `(Sum(NetProfit) - InitialInvestment) / InitialInvestment >= 0.15`

This ensures the venture pays back the capital and generates a 15% return on top.

### 3. Unit Economics Decision

**Verdict: MANDATORY.**

The CLI must calculate and validate unit economics.

**Minimum Set**:
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value)
- LTV:CAC Ratio (Threshold: > 3.0 ideal, > 1.5 min)
- Payback Period (Threshold: < 18 months)

**Why**: You can manipulate annual aggregates to look profitable by assuming unrealistic growth or ignoring churn. Unit economics are harder to fake and are the "physics" of the business.

### 4. Financial Model Generation

**Strategy: Usage of Stage 4 + LLM.**

- **Source**: Stage 4's `stage5Handoff` (Competitor prices, Market positioning).
- **Process**:
  1. **Extract**: Price points from Competitors (Stage 4).
  2. **Decide**: Set Your Price relative to competitors (e.g. "We are cheaper" or "We are premium").
  3. **Estimate**:
     - TAM (Total Addressable Market) -> derived from industry standard or user input.
     - Market Share start (e.g. 0.01%) and growth (month-over-month).
  4. **Compute**:
     - Revenue = Users * Price
     - COGS = Users * UnitCost
     - OpEx = Team + Server + Marketing (derived from CAC)
- **Agent Action**: The `analysisStep` in Stage 5 should call an LLM with the prompt: "Given these competitors and this venture idea, generate a realistic 3-year P&L with these assumptions..." providing the schema.

### 5. Kill Behavior Recommendation

**Verdict: Hard Block with "Pivot" Option.**

Why: Recursive loops (auto-sending back to Stage 3) is dangerous in a CLI/Agentic environment without a human brake.

**Behavior**:
- If Kill: Status becomes BLOCKED.
- `reasons` array populated.
- User (or Manager Agent) must manually invoke a "Pivot" command (which might reset Stage 3/4 data) or "Override" (force pass).
- Devil's Advocate should still run to provide the qualitative "This numbers look fake" check.

### 6. Stage 4 -> Stage 5 Pipeline

**Consumption**: Stage 5 input is Empty. The `analysisStep` generates the data. It reads:
- `stage-04.json` (Competitor Pricing, SWOT)
- `stage-01.json` (Venture Description, Target User)

**Schema Update for Stage 4 (Implied)**: Stage 4 must output:

```javascript
output: {
  // ... existing fields ...
  stage5Handoff: {
    marketPriceLow: 10,
    marketPriceHigh: 50,
    averagePrice: 30,
    pricingModels: ["subscription", "freemium"],
    competitivePressure: "High"
  }
}
```

### 7. CLI Superiorities

- **Deterministic Validation**: The `evaluateKillGate` pure function is cleaner and easier to test than the React component logic.
- **Schema Validation**: Precise type checking on inputs ensures data integrity before calculation.
- **Speed**: Instant computation without UI lag.

### 8. Recommended Stage 5 Schema

```javascript
schema: {
  // --- Inputs (Generated by LLM) ---
  financials: {
    type: 'object',
    required: true,
    properties: {
      initialInvestment: { type: 'number', min: 1 },
      currency: { type: 'string', default: 'USD' },
      modelAssumptions: {
         pricingModel: { type: 'string' },
         pricePoint: { type: 'number' },
         customerCountY1: { type: 'number' },
         churnRateMonthly: { type: 'number' }
      },
      year1: { revenue: 'number', cogs: 'number', opex: 'number', marketingCheck: 'number' },
      year2: { revenue: 'number', cogs: 'number', opex: 'number' },
      year3: { revenue: 'number', cogs: 'number', opex: 'number' }
    }
  },

  // --- Computed / Derived ---
  unitEconomics: {
    type: 'object',
    derived: true,
    properties: {
      cac: { type: 'number' },
      ltv: { type: 'number' },
      ltvCacRatio: { type: 'number' }, // Kill if < 1.5
      paybackMonths: { type: 'number' } // Kill if > 18
    }
  },

  projection: {
    type: 'object',
    derived: true,
    properties: {
      grossMarginPct: { type: 'number' }, // Kill if < 20%
      netProfitCumulative: { type: 'number' },
      roi3y: { type: 'number' }, // Kill if < 0.15
      breakEvenMonth: { type: 'number', nullable: true } // Kill if > 24
    }
  },
  decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
  reasons: { type: 'array', derived: true }
}
```

### 9. Minimum Viable Change

1. **Reduce ROI Threshold**: Change 0.5 to 0.15 in `stage-05.js`.
2. **Add Unit Economics**: Add cac, ltv, churn to input (or derive them if data allows) and add Kill Condition `ltv < cac`.
3. **Implement Generation**: Create `lib/eva/generators/stage-05-financials.js` (or similar analysis step) that prompts LLM for the numbers. CLI currently has no generation, so this is the biggest blocker.
4. **Connect Stage 4**: Ensure Stage 5 generator reads Stage 4 file.

### 10. Cross-Stage Impact

**Stage 6 (Business Model Canvas)**:
- Benefit: Will receive validated "Revenue Streams" and "Cost Structure" inputs directly from Stage 5.
- Risk: If Stage 5 is too lenient (15% ROI), Stage 6 might build a business model on shaky ground.

**Blueprint Phase (6-10)**:
- The Blueprint phase assumes viability. Stage 5 is the gatekeeper. Making it robust (Unit Economics) prevents wasted cycles designing a product that can't make money.
