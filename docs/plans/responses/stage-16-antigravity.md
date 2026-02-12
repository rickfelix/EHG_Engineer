# Stage 16 "Financial Projections" -- AntiGravity Response (Google Gemini)

> Independent response to the Stage 16 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Analysis Step | N/A (Doesn't serve this role) | None | **5 Critical** | Manual data entry for financials is error-prone and disconnects Stage 16 from the "Blueprinted" reality (Team, GTM, Pricing). | Implement | Can the user just key in the numbers? Yes, but it defeats the purpose of the "Blueprint" phase which should prove the plan works mathematically. |
| Phase-Variable Burn | N/A | Flat monthly_burn_rate | **5 Critical** | Foundation phase ($) vs Scale phase ($$) distinction is lost. Runway optimization is impossible. | Implement | Essential because Stage 15 explicitly introduced phase-based staffing to solve this. |
| P&L Structure | N/A | Simple revenue / costs | **4 High** | Cannot verify if margins match Stage 5/7 unit economics. Obscures burn drivers (R&D vs Marketing). | Implement | Keep it "Lite" (Revenue, COGS, OpEx categories) rather than full GAAP. |
| Revenue Driver Logic | N/A | Manual entry | **4 High** | User guesses revenue instead of deriving from GTM (Stage 11) & Pricing (Stage 7). | Implement | Simple driver model: Traffic * Conv * Price. |
| Scenario Analysis | N/A | Single scenario | **3 Medium** | No sensitivity analysis (what if conv% is half?). | Defer | A single "Base Case" is sufficient for the Blueprint "Go/No-Go". Scenarios can be V2. |
| Unit Econ Check | N/A | None | **3 Medium** | Internal inconsistency (Projected margins != Stage 5 Unit Economics). | Implement | Add as a validation warning, not a blocker. |
| Funding Triggers | N/A | Basic list | **3 Medium** | Funding is not tied to milestones or runway low-points. | Simplify | Keep manual entry but add validation: "You run out of money in Month 4, but raise isn't until Month 6". |
| Viability Gate | N/A | Structural Checks Only | **5 Critical** | Can approve a venture that is bankrupt on paper. | Implement | The gate MUST check runway > 0 and break_even exists (or funding bridge covers it). |

### 2. AnalysisStep Design

The analysisStep will auto-generate the financial_model based on previous stages.

**Inputs (Upstream Data)**:
- Stage 7 (Pricing): arpa, cac, churn_rate_monthly.
- Stage 11 (GTM): total_monthly_budget (Marketing OpEx), target_cac.
- Stage 13 (Roadmap): Timeline of phases (Foundation -> Growth -> Scale).
- Stage 15 (Resources): Team list with phase_ref, cost_monthly, start_date (implied by phase).
- Stage 14 (Architecture): (Inferred) Infrastructure/Hosting costs (often missing, use default estimate or % of revenue).

**Logic**:
1. Timeline Creation: Map months 1-24 to Phases (e.g., Months 1-6 = Foundation, 7-18 = Growth).
2. Cost Buildup (Bottom-Up): Team (sum cost_monthly by phase) + Marketing (Stage 11 budget) + Infra (estimate).
3. Revenue Buildup (Top-Down or Driver): Marketing Spend / CAC = New Customers. New Customers * ARPA = New MRR. Apply Churn.
4. Output Generation: Populate the projections array.

**Outputs**: projections array with detailed cost/revenue breakdown, initial_capital_recommendation (Max Negative Cashflow * 1.5).

### 3. Phase-Variable Burn Rate Decision

**DECISION: Adopt Phase-Variable Burn.**

Stage 15's phase_ref is meaningless without this. monthly_burn_rate becomes avg_burn_rate derived. Schema stores burn reflected in monthly projections.

### 4. P&L Structure Decision

**DECISION: Adopt "Startup Standard" P&L.**

Revenue → COGS → Gross Profit → OpEx (R&D, S&M, G&A) → Net Income.

Why: Allows verifying if the "Engineering Heavy" Blueprint (Stage 14/15) is sustainable.

### 5. Revenue Model Generation Decision

**DECISION: Driver-Based Generation (Simple).**

New Customers = Marketing Spend / CAC. Ensures consistency. Fallback: manual growth rate if GTM budget undefined.

### 6. Scenario Analysis Decision

**DECISION: Single "Base Case" Only.**

Complexity. Blueprint is about proving one viable path. CLI can simulate scenarios by modifying inputs and re-running analysisStep.

### 7. Unit Economics Coherence

**DECISION: Warning Only.**

If Projected LTV:CAC differs significantly from Stage 5 LTV:CAC, warn. Stage 5 was theoretical, Stage 16 is operational.

### 8. Funding Strategy Enhancement

**DECISION: Bridge Logic.**

Validate rounds against cash_balance curve. Check: Does cash_balance ever drop below $0? Suggests funding needed before that month. min_cash_balance derived field. If negative -> "Bankrupt".

### 9. Promotion Gate Viability

**DECISION: Financial Viability Checks Required.**

New Checks: runway_months >= 6, lowest_cash_balance >= 0, revenue_projections populated.

### 10. CLI Superiorities

- Text-Based P&L: console.table of 12-month projection is faster to read than clicking through a chart.
- Direct Manipulation: Changing marketing_budget in Stage 11 and re-running Stage 16 instantly updates the model.

### 11. Recommended Stage 16 Schema

```javascript
schema: {
  initial_capital: { type: 'number', min: 0 },
  start_date: { type: 'string', format: 'date' },
  projections: {
    type: 'array',
    items: {
      month: { type: 'number' },
      phase_ref: { type: 'string' },
      revenue: { type: 'number' },
      cogs: { type: 'number' },
      opex_rnd: { type: 'number' },
      opex_sm: { type: 'number' },
      opex_ga: { type: 'number' },
      total_expenses: { type: 'number' },
      net_income: { type: 'number' },
      cash_balance_end: { type: 'number' },
    },
  },
  funding_rounds: {
    type: 'array',
    items: {
      name: { type: 'string' },
      amount: { type: 'number' },
      month_index: { type: 'number' },
    },
  },
  // Derived
  total_revenue_year1: { derived: true },
  total_burn_year1: { derived: true },
  min_cash_low_point: { derived: true },
  runway_months: { derived: true },
  break_even_month: { derived: true },
  promotion_gate: { derived: true },
};
```

### 12. Minimum Viable Change (Priority Ordered)

1. Schema Update: Change revenue_projections to P&L structure
2. Analysis Step: Build generateFinancialModel pulling Team Costs (Stage 15), GTM Budget (Stage 11), Timeline (Stage 13)
3. Viability Gate: Update evaluatePromotionGate to check min_cash_low_point >= 0
4. Funding Integration: Allow funding_rounds to inject cash into cash_balance calculation

### 13. Cross-Stage Impact

Stage 15 (Resources): Must strictly use phase_ref. If Stage 15 is vague, Stage 16 fails.
Stage 11 (GTM): total_monthly_budget becomes a "Load Bearing" number.

### 14. Dependency Conflicts

Stage 12 "Sales Model": funnel_stages conversion rates are static. Stage 16 assumes linear application. If not filled out, Revenue Driver Logic fails. Resolution: Fallback to simple "Manual Revenue Growth" if funnel data missing.

### 15. Contrarian Take

**Argument: Don't automate the Revenue Model.**

Automating revenue based on Marketing Spend / CAC is dangerous. Assumes linear scaling. Pre-launch CAC is a guess. Building a model on a guess on a guess creates false precision.

**Alternative**: Let costs be automated (deterministic from hiring plan), keep Revenue as manual entry or simple growth rate.

**Rebuttal**: Blueprint phase goal is to see if assumptions hold together. If assumptions are unrealistic, the model should expose that. Stage 5 vs 16 check catches it. Automate to expose the absurdity of bad assumptions.
