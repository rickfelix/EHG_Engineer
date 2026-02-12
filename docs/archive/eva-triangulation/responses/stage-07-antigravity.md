# Stage 7 "Pricing" -- AntiGravity Response

> Independent response to the Stage 7 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Executive Summary

Stage 7 is the bridge between financial validation (Stage 5) and the business model (Stage 8). The GUI implementation is highly detailed (pricing models, discounts, detailed feature lists), while the CLI implementation is currently a bare-bones calculator for unit economics.

To make the CLI the "Engine" of the venture, Stage 7 must move from a passive inputs form to an active strategy generator. It should consume the Competitive Intel (Stage 4) and Financial Goals (Stage 5) to propose a pricing strategy, rather than just validating one manually entered by the user.

### 2. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:----------:|-------------------|---------|-----------|
| Pricing Model | 7 explicit models (Freemium, Tiered, etc.) | Implicit (via Tiers list) | **4 High** | Ambiguity in Stage 8 (Revenue Streams). | Close Gap | "Tiers" alone doesn't describe the mechanic (e.g., usage-based vs. flat). |
| Tier Richness | Features, Limits, Popular, CTA | Name, Price, Billing, Units | **5 Critical** | Stage 8 cannot populate "Value Propositions" or "Revenue Streams" effectively without knowing what is sold (features). | Close Gap | features and limits are essential. cta and isPopular are cosmetic. |
| Competitor Benchmarking | Explicit benchmarking UI | None | **4 High** | Pricing decisions lack context. | Pipelines | Do not rebuild UI. Consume Stage 4 data strictly. |
| Discount Policies | 4 types (Vol, Promo, etc.) | None | **2 Low** | Minimal. Discounts are execution details, not core business model validation. | Ignore | Keep out of MVP. Over-engineering for this stage. |
| Value Metrics | Primary/Secondary/Anchor | None | **3 Medium** | Helps define "Revenue Streams". | Add Simple | Add single primary_value_metric field. |
| Unit Economics | ACV, ARPU, Conv, Churn | LTV, CAC, Payback | **1 Cosmetic** | CLI calc is actually superior/standardized. | Keep CLI | CLI's standard LTV/CAC formulas are sufficient. |
| AI Generation | Recommendations (Auto-gen) | None | **5 Critical** | The "Engine" fails if it requires manual data entry for everything. | Add Analysis | Must generate tiers based on Stage 4/5/6. |

### 3. Detailed Recommendations

#### A. Pricing Model & Tier Structure

The CLI must be able to describe *how* money is made, not just *how much*.

**Recommendation:**

- Add `strategy_type` enum (Subscription, Usage-Based, Freemium, Hybrid, One-Time).
- Add `features` (array of strings) to Tiers.
- Add `limits` (key-value pairs) to Tiers.

#### B. The "Missing Link" in Stage 4

The user prompt states: "Stage 4 already provides competitor pricing data." **Reality Check:** The current `stage-04.js` schema does NOT have a price field. It has name, position, threat, swot. **Critical Dependency:** We cannot automate Stage 7 benchmarking unless Stage 4 captures competitor pricing info. **Action:** We will assume Stage 4 is updated to include pricing_model and price_points.

#### C. Pipeline Integration (The "Engine" Flow)

Stage 7 should not be a fresh data entry form. It should be a synthesis step.

- **Input (Stage 4):** "Competitor X charges $50/mo."
- **Input (Stage 5):** "We need $100 ARPU to hit 50% margins."
- **Input (Stage 6):** "Risk: 'Price sensitivity in market' (Likelihood: High)."
- **Process (Stage 7 AI):** "Given Competitor X is $50 and we need $100, but price sensitivity is high, we cannot compete on price. We must compete on features. Propose 3 tiers starting at $60 with superior features to justify the premium."

### 4. Recommended Schema (Stage 7 CLI)

```javascript
schema: {
  // Strategy Definition (New)
  currency: { type: 'string', required: true },
  model: {
    type: 'enum',
    values: ['freemium', 'subscription_flat', 'subscription_tiered', 'usage_based', 'per_seat', 'enterprise', 'hybrid'],
    required: true
  },
  primary_value_metric: { type: 'string', description: 'e.g. "Active User", "Gigabyte Stored"' },
  // Richer Tiers
  tiers: {
    type: 'array',
    items: {
      name: { type: 'string' },
      price: { type: 'number' },
      billing_period: { type: 'enum', values: ['monthly', 'annual', 'one_time'] },
      // NEW: Essential for BMC and differentiation
      features: { type: 'array', items: { type: 'string' } },
      limits: { type: 'array', items: { type: 'string' } }, // Simple string representation "5 Users"
      is_recommended: { type: 'boolean' } // Replaces isPopular
    }
  },
  // Unit Economics (Existing + Refined)
  assumptions: {
    gross_margin_pct: { type: 'number' },
    churn_rate_monthly: { type: 'number' },
    cac: { type: 'number' },
    arpa: { type: 'number' } // Weighted average if multiple tiers
  },
  // Derived (Read-only)
  economics: {
    ltv: { type: 'number', derived: true },
    cac_ltv_ratio: { type: 'number', derived: true },
    payback_months: { type: 'number', derived: true }
  }
}
```

### 5. Minimum Viable Change (Step-by-Step)

1. **Schema Update:**
   - Add `model` (enum).
   - Add `tiers[].features` (array).
   - Add `primary_value_metric` (string).

2. **Add `analysisStep`:**
   - Goal: Generate the pricing strategy.
   - Prompt inputs:
     - Stage 4 Competitor Positioning (and pricing, if available).
     - Stage 5 Financial constraints (OpEx, target margins).
     - Stage 6 Risks (e.g., "High Churn Risk" -> AI suggests annual contracts).
   - Output: JSON filling the model and tiers arrays.

3. **Dependencies:**
   - Flag Stage 4 gap (Missing pricing data).

### 6. Cross-Stage Impact

| From Stage | To Stage 7 | Usage |
|------------|-----------|-------|
| Stage 4 | Competitor Data | Context: "Beat Competitor X's feature set" or "Undercut Competitor Y". |
| Stage 5 | Financials | Constraint: "Price * Margin must > CAC". |
| Stage 6 | Risks | Mitigation: "High implementation risk? Charge setup fee." |

| From Stage 7 | To Stage | Usage |
|-------------|----------|-------|
| Stage 8 | Strategy | Populates Revenue Streams (Tier names, prices) and Value Propositions (Tier features). |
