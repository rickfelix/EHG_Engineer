# Stage 5 "Profitability" -- Claude Response

> Independent response to the Stage 5 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 6 & Blueprint Phase) | Verdict | Challenge |
|-----|---------|---------|:-----------------:|------------------------------------------------|---------|-----------|
| Financial model generation | AI + S-curve local model generates projections from assumptions | Nothing -- 10 input numbers must be provided externally | **5 Critical** | Without generated projections, Stage 5 cannot execute. The kill gate is live code but has no data to evaluate. Stage 6 receives no financial signal. | CLOSE | Challenge: Stage 4 consensus adds `stage5Handoff` with pricing data. But pricing data alone doesn't produce revenue/cogs/opex projections. An `analysisStep` must bridge the gap. |
| Unit economics (CAC, LTV, churn) | Full: CAC, LTV, LTV:CAC ratio (40% weight), payback period, churn rate | Nothing | **4 High** | Stage 6's Business Model Canvas needs unit economics to design revenue streams and cost structure. Without them, Stage 6 works from abstract annual totals. | ADAPT | Challenge: The CLI's kill gate formula doesn't directly consume unit economics -- it uses annual aggregates. But unit economics are *how you derive* credible annual aggregates. They're intermediate calculations, not gate inputs. |
| ROI threshold calibration | 15% projected ROI | 50% 3-year cumulative ROI | **5 Critical** | Wrong threshold kills viable ventures (too high) or passes non-viable ones (too low). The two systems disagree by 3.3x on the bar. Getting this wrong means Stage 5 is a bad gatekeeper. | CLOSE | Challenge: These are different calculations. CLI's 50% is (totalNetProfit - investment) / investment over 3 years. GUI's 15% is projected ROI from the model. They're not directly comparable, but both are the *only* gate. |
| Monthly granularity | 36-month monthly projections | 3-year annual aggregates | **2 Low** | The kill gate only needs annual totals for ROI and a break-even month estimate. Monthly projections are useful for display but don't change the kill decision. | ELIMINATE | Challenge: The GUI's monthly projections power the chart UI. The CLI has no chart. Annual granularity is sufficient for a financial viability gate. |
| Scenario analysis | 3 scenarios (optimistic/realistic/pessimistic) | Single projection | **3 Medium** | Scenario analysis reveals how sensitive the venture is to assumptions. A venture that passes realistically but fails pessimistically is riskier than one that passes all three. Stage 6 benefits from knowing sensitivity. | ADAPT | Challenge: The kill gate decision is binary. Running 3 scenarios doesn't change the gate -- you either kill or pass. But scenario spread gives a *confidence signal* (narrow spread = robust, wide spread = fragile). |
| Recursion (kill → Stage 3 loop) | FIN-001 recursion with loop prevention (3x → Chairman) | Hard block (`blockProgression: true`) | **3 Medium** | Recursion gives the venture a chance to revise assumptions. Hard block is final. For an autonomous pipeline, hard block is actually cleaner -- Devil's Advocate already challenges before the gate fires. | ADAPT | Challenge: Recursion makes sense in a GUI where a human can revise inputs. In the CLI's autonomous pipeline, what would "go back to Stage 3" mean? The LLM would re-run Stage 3 with the same data and likely produce the same result. Without human-in-the-loop intervention, recursion risks infinite loops. |
| Chairman override | Override with justification | None | **2 Low** | The CLI's Chairman Preference Store + DFE provides governance at a different layer. An explicit override at Stage 5 adds complexity for a case that should be rare (the kill gate threshold should be well-calibrated). | ELIMINATE | Challenge: If the kill gate is correctly calibrated, overrides should almost never happen. The CLI's existing governance (DFE, Chairman preferences) can handle the edge case without a Stage 5-specific override mechanism. |
| Profitability score (0-100) | Weighted: LTV:CAC (40%) + Payback (30%) + Margin (20%) + Breakeven (10%) | Binary pass/kill only | **2 Low** | A composite score is informational. Stage 6 doesn't consume a profitability score -- it builds its own model. The kill decision is what matters. | ELIMINATE | Challenge: The profitability score is GUI display logic. It makes a nice dashboard card but doesn't change the kill decision. Stage 3 already produces metric scores; Stage 5 is purely financial. |
| Validation warnings | Churn >20%, CAC > pricing × 24 months | Basic numeric validation only | **3 Medium** | Business logic warnings catch unrealistic inputs before they produce misleading results. A churn rate of 50% will technically pass validation but produce garbage projections. | CLOSE | Challenge: These warnings are simple guard rails. If Stage 5 gets an `analysisStep`, the LLM should produce reasonable numbers. But if user-provided inputs are ever supported, warnings become important. |
| Stage 4 consumption | Implicit -- competitive data influences manual inputs | No connection to Stage 4 at all | **5 Critical** | Stage 4 consensus produces `stage5Handoff` with pricing summary, competitive pressure, and confidence. Stage 5 must consume this to ground projections in reality. Without it, the financial model is disconnected from competitive intelligence. | CLOSE | No challenge. This is the entire point of Stage 4. |
| AI-powered projections | Edge function generates forecasts from assumptions | Nothing | **4 High** | The CLI needs *some* mechanism to generate the 3-year financial model from venture description + Stage 4 intel. Without AI, the 10 input numbers are guesses or must come from a human. | CLOSE | Challenge: An LLM generating financial projections is inherently speculative. But so is any early-stage financial model. The deterministic kill gate provides the safety net -- the LLM generates, the gate evaluates. |

### 2. ROI Threshold Recommendation

**The CLI's 50% and GUI's 15% are measuring different things**, but both are problematic:

- **CLI's 50% 3-year ROI** = `(totalNetProfit - initialInvestment) / initialInvestment`. This means total net profit over 3 years must be at least 1.5x the initial investment. For a $100K investment, you need $150K total net profit. This is a reasonable bar for venture viability.

- **GUI's 15% projected ROI** = a different calculation based on the forecasting model, not directly comparable. 15% sounds low for a 3-year venture but depends on the formula.

**Recommendation: Keep CLI's formula, calibrate the threshold to 30%.**

Rationale:
- 50% may be too aggressive for early-stage ventures with high uncertainty. Many viable ventures have modest Y1 returns that compound in Y2-3.
- 30% means $130K total net profit for a $100K investment -- the venture must return its investment plus 30% over 3 years.
- This is still a meaningful bar (most failed ventures have negative Y1 net profit, which triggers the `breakEvenMonth === null` kill anyway).
- Keep `MAX_BREAKEVEN_MONTHS = 24` -- this is the stronger guard. If you can't break even in 24 months, the venture is too slow regardless of 3-year ROI.

**Formula**: Keep `roi3y = (totalNetProfit - initialInvestment) / initialInvestment`. This is clean, deterministic, and testable. Don't switch to the GUI's more complex formula.

### 3. Unit Economics Decision

**ADAPT: Add unit economics as intermediate calculations, not gate inputs.**

The kill gate should continue to evaluate `roi3y` and `breakEvenMonth`. But the `analysisStep` that generates the 3-year projections should work *through* unit economics:

1. **LLM generates unit economics estimates** from Stage 4 intel:
   - Pricing (informed by competitor pricing models and tiers)
   - CAC estimate (informed by competitive intensity)
   - Churn estimate (informed by switching cost signals)
   - LTV = pricing / churn
   - Growth trajectory

2. **Deterministic model converts unit economics to annual aggregates**:
   - Y1 revenue = estimated_customers × pricing × 12
   - Y1 cogs = variable_cost × estimated_customers × 12
   - Y1 opex = fixed_costs × 12 + marketing + development
   - (Similar for Y2, Y3 with growth and churn applied)

3. **Kill gate evaluates annual aggregates** (unchanged logic)

This gives us unit economics for Stage 6 *and* keeps the kill gate clean.

**Store unit economics in the output** for downstream consumption but don't gate on them:

```
unitEconomics: {
  pricing: number,
  cac: number,
  ltv: number,
  ltvCacRatio: number,
  monthlyChurn: number,
  paybackMonths: number,
}
```

### 4. Financial Model Generation

**Add a single `analysisStep` that generates the 3-year financial model.**

**Input**:
- Venture description (from Stage 1)
- Stage 4's `stage5Handoff` artifact (pricing summary, competitive pressure, confidence)
- Stage 3's market data (TAM, growth rate, competitiveBarrier)
- `initialInvestment` (from user input or Stage 0 context)

**Process** (single LLM call):
1. Prompt: "Given this venture [description], competitive landscape [stage5Handoff], and market context [Stage 3 data], generate a realistic 3-year financial projection."
2. LLM produces: unit economics estimates + annual projections
3. Validate LLM output against business logic warnings (churn >20%, negative margins, etc.)
4. If `stage5Handoff.confidence` is low, widen uncertainty ranges and flag in output

**Output**: The 10 input numbers (initialInvestment + 3 years of revenue/cogs/opex) + unit economics intermediate values

**Why a single LLM call**: The financial model at this stage is inherently speculative. A sophisticated multi-step process doesn't make it more accurate -- it just makes it slower. One well-prompted call with structured output is sufficient. The kill gate provides the safety net.

**What if no Stage 4 data?**: If Stage 4 produced limited intel (Blue Ocean, low confidence), the LLM should produce conservative projections. The `confidence` field from Stage 4 directly influences how aggressive the financial assumptions are.

### 5. Kill Behavior Recommendation

**Keep CLI's hard block. Do NOT implement recursion.**

Rationale:
1. **Recursion makes sense with humans, not LLMs**: The GUI's recursion sends the venture back to Stage 3 so a human can revise their business model. In the CLI's autonomous pipeline, there's no human to revise anything. The LLM would re-run Stage 3 with the same inputs and likely produce similar results.

2. **Devil's Advocate already covers the challenge function**: At gate stages (including Stage 5), the existing `devils-advocate.js` challenges the financial projections. If the projections are unrealistic (too optimistic or too pessimistic), DA catches it *before* the kill gate fires.

3. **Hard block is honest**: If the financial model shows the venture is non-viable, killing it is the right decision. Looping back to Stage 3 implies "try harder to make the numbers work," which is exactly the wrong incentive.

4. **Add a "confidence-adjusted kill" instead**: If Stage 4 confidence is low AND the venture barely fails the kill gate, annotate the kill with `lowConfidenceKill: true`. This signals that the kill may be based on uncertain data, allowing a future human review process to re-evaluate.

**Preserve**: `blockProgression: true`, structured kill reasons, exported `evaluateKillGate()` pure function.

### 6. Stage 4 -> Stage 5 Pipeline

**Stage 4 provides** (per consensus):
- `stage5Handoff.pricingSummary` (dominant model, price range, competitor count)
- `stage5Handoff.competitiveIntensity` (0-100)
- `stage5Handoff.confidence` (0-1)
- Per-competitor: `pricingModel`, `pricingTiers`, `marketShareRange`

**Stage 5 consumes**:
1. **Pricing anchor**: Use `pricingSummary.priceRange` and `pricingSummary.dominantModel` to inform the venture's pricing assumption. If competitors charge $10-50/mo subscription, the financial model uses a realistic price point in that range.

2. **CAC estimation**: Use `competitiveIntensity` to adjust CAC. High intensity (80+) = higher CAC (harder to acquire customers in a crowded market). Low intensity (<30) = lower CAC.

3. **Churn estimation**: Use market share distribution and competitive density to estimate churn. Fragmented market with many alternatives = higher churn.

4. **Confidence weighting**: If `stage5Handoff.confidence < 0.5`, the `analysisStep` should produce conservative projections (lower revenue growth, higher costs) to compensate for uncertain competitive data.

**Stage 3 also provides**:
- Market size (TAM from MarketAssumptions)
- `competitiveBarrier` (0-100) -- informs defensibility
- Market growth rate

### 7. CLI Superiorities (preserve these)

- **Pure function kill gate** (`evaluateKillGate`): Deterministic, testable, auditable. Takes exactly two inputs (roi3y, breakEvenMonth) and produces a definitive decision. No ambiguity.
- **Structured kill reasons**: Each kill reason has type, message, threshold, and actual value. This is far more useful than "GATE BLOCKED" with a percentage. Stage 6+ can read *why* a venture was killed if it was overridden.
- **Hard block enforcement**: `blockProgression: true` is unambiguous. No "soft" recursion that might loop.
- **Simple annual model**: Annual aggregates are the right granularity for a viability gate. Monthly projections add false precision at this stage.
- **Exported constants**: `ROI_THRESHOLD` and `MAX_BREAKEVEN_MONTHS` are configurable and transparent. No magic numbers buried in UI logic.
- **No GUI coupling**: The kill gate is pure business logic with zero UI dependencies. It can run in CI, in tests, or in any orchestration context.

### 8. Recommended Stage 5 Schema

```javascript
const TEMPLATE = {
  id: 'stage-05',
  slug: 'profitability',
  title: 'Profitability',
  version: '2.0.0',
  schema: {
    // === Input fields (10, unchanged) ===
    initialInvestment: { type: 'number', min: 0.01, required: true },
    year1: {
      revenue: { type: 'number', min: 0, required: true },
      cogs: { type: 'number', min: 0, required: true },
      opex: { type: 'number', min: 0, required: true },
    },
    year2: { /* same as year1 */ },
    year3: { /* same as year1 */ },

    // === Derived fields (existing, unchanged) ===
    grossProfitY1: { type: 'number', derived: true },
    grossProfitY2: { type: 'number', derived: true },
    grossProfitY3: { type: 'number', derived: true },
    netProfitY1: { type: 'number', derived: true },
    netProfitY2: { type: 'number', derived: true },
    netProfitY3: { type: 'number', derived: true },
    breakEvenMonth: { type: 'number', nullable: true, derived: true },
    roi3y: { type: 'number', derived: true },
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },

    // === NEW: Unit economics (intermediate, for Stage 6) ===
    unitEconomics: {
      type: 'object', derived: true,
      properties: {
        pricing: { type: 'number' },           // Monthly price point
        cac: { type: 'number' },               // Customer acquisition cost
        ltv: { type: 'number' },               // Lifetime value
        ltvCacRatio: { type: 'number' },        // LTV:CAC
        monthlyChurn: { type: 'number' },       // Monthly churn rate
        paybackMonths: { type: 'number' },      // Months to recover CAC
        grossMargin: { type: 'number' },        // Gross margin %
      },
    },

    // === NEW: Scenario sensitivity ===
    scenarioSpread: {
      type: 'object', derived: true,
      properties: {
        pessimisticRoi3y: { type: 'number' },   // ROI with 0.7x rev, 1.2x cost
        optimisticRoi3y: { type: 'number' },    // ROI with 1.3x rev, 0.9x cost
        robustness: { type: 'enum', values: ['fragile', 'moderate', 'robust'] },
      },
    },

    // === NEW: Provenance ===
    provenance: {
      type: 'object', derived: true,
      properties: {
        dataSource: { type: 'string' },         // 'analysisStep' or 'manual'
        stage4Confidence: { type: 'number' },   // Carried from Stage 4
        modelVersion: { type: 'string' },       // LLM model used
        lowConfidenceKill: { type: 'boolean' }, // Kill based on uncertain data
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. Unit economics as derived intermediate values (for Stage 6 consumption)
2. Scenario spread with robustness classification (avoids full 3-scenario model)
3. Provenance tracking (data source, confidence carry-through)
4. `lowConfidenceKill` flag when kill is based on uncertain Stage 4 data
5. ROI threshold reduced from 0.5 to 0.3 (recommended, configurable)

### 9. Minimum Viable Change

1. **P0: Add `analysisStep` for financial model generation** -- Single LLM call that takes venture description + Stage 4 `stage5Handoff` + Stage 3 market data and produces the 10 input numbers + unit economics. This is the #1 gap -- without it, Stage 5 is dead code.

2. **P0: Add Stage 4 `stage5Handoff` consumption** -- Wire the `analysisStep` to read Stage 4's output artifact and use competitive pricing, intensity, and confidence to ground the financial projections.

3. **P0: Calibrate ROI threshold** -- Change `ROI_THRESHOLD` from 0.5 to 0.3 (or make configurable). 50% is too aggressive for early-stage ventures with inherently uncertain projections.

4. **P1: Add unit economics to `computeDerived()`** -- Calculate CAC, LTV, LTV:CAC, churn, payback from the intermediate values produced by the `analysisStep`. Store in `unitEconomics` for Stage 6.

5. **P1: Add business logic warnings** -- Validate generated projections against sanity checks: churn >20%, negative gross margins, CAC > 24 months of revenue, revenue declining Y1→Y2.

6. **P1: Add scenario spread** -- Simple calculation: apply pessimistic/optimistic multipliers to the base projection and compute `pessimisticRoi3y` and `optimisticRoi3y`. Classify robustness as `fragile` (pessimistic fails), `moderate` (all pass but tight), `robust` (pessimistic comfortably passes).

7. **P2: Add provenance tracking** -- Record whether data came from `analysisStep` or manual input, carry Stage 4 confidence through, flag `lowConfidenceKill` when applicable.

8. **P3: Do NOT implement recursion** -- Keep hard block. Devil's Advocate handles the challenge function.

9. **P3: Do NOT implement profitability score** -- Binary pass/kill is sufficient. The score is GUI display logic.

### 10. Cross-Stage Impact

| Change | Stage 6 (Business Model Canvas) | Stage 7+ (Blueprint Phase) | Broader Pipeline |
|--------|--------------------------------|----------------------------|-----------------|
| Financial model generation | **Direct input** -- Stage 6 receives validated financial projections (not just pass/kill) to build its business model canvas around real numbers. | Stage 7 (Revenue Architecture) gets pricing and growth assumptions grounded in competitive reality. | Every stage from 6-25 benefits from a venture that has proven financial viability. |
| Unit economics | **Primary input** -- Stage 6's revenue streams, cost structure, and customer channels are directly informed by CAC, LTV, churn, and pricing from Stage 5. Without unit economics, Stage 6 designs a business model in the dark. | Stage 7 uses LTV:CAC to design revenue optimization. Stage 8 (Tech Blueprint) uses cost structure for architecture decisions. | Unit economics are the language of business model design. Stage 5 producing them means every subsequent stage has a shared vocabulary. |
| ROI threshold calibration | Fewer false kills means more ventures reach Stage 6 for proper business model design. 50% → 30% doesn't lower the bar much -- most killed ventures fail on breakEvenMonth, not ROI. | Cascade effect: more ventures in the pipeline means more work for Blueprint stages. | Prevents killing ventures that are viable but slow-growing (common in B2B SaaS). |
| Scenario spread | Stage 6 can design different business models for different scenarios. A fragile venture might need a lower-cost business model. | Stage 9 (Brand Genome) can adjust brand positioning based on market sensitivity. | Robustness signal carries through the entire pipeline as a confidence weight. |
| Stage 4 consumption | Stage 6 gets financial projections that are grounded in competitive pricing, not hallucinated. This means the business model canvas builds on real market data. | All Blueprint stages benefit from the competitive-intelligence-to-financials pipeline. Stage 4 → Stage 5 → Stage 6 is the core data chain. | Closes the information gap between competitive intelligence and financial modeling that exists when the stages are disconnected. |
