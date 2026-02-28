---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 6 "Risk Matrix" -- AntiGravity Response

> Independent response to the Stage 6 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Risk Generation | Manual (with samples) | None (Passive validation) | **5 Critical** | High. Without risks, Stage 9 fails. Autonomous agents need generation. | CLOSE | CLI is currently "dumb" here. Must be active. |
| Scoring Model | 2-factor (Prob x Impact) | 3-factor (Sev x Prob x Imp) | **3 Medium** | Low. Both produce a sortable score. | ADAPT | CLI's 3-factor is redundant. "Severity" often overlaps with "Impact". |
| Review Date | No | Required | **4 High** | High for "Engine" phase. Agents need to know when to check back. | PRESERVE | Essential for autonomous governance. |
| Owner | No | Required | **2 Low** | Low. In single-user mode, "Owner" is always "Founder" or "AI". | ADAPT | Make optional or default to "System". |
| Residual Risk | No | Yes (fields + scoring) | **5 Critical** | High. Differentiates "inherent" vs "managed" risk. | PRESERVE | Crucial for showing value of mitigations. |
| Aggregate Metrics | Risk Badge / Counts | None | **4 High** | High. Pricing (Stage 7) needs high-level risk signals. | CLOSE | CLI needs to summarize the matrix. |
| Stage 5 Seeding | No | No | **5 Critical** | High. Financial risks from Stage 5 are hard assertions. | CLOSE | Don't ask the user for what we already know. |

### 2. Risk Generation Recommendation

**Recommendation: Implement `analysisStep` for Auto-Generation.** The CLI must move from passive validation to active generation. Stage 6 is the first "Engine" stage and should synthesize data from Validation (Stages 1-5).

**Pipeline**:
- **Input**: Stage 1 (Concept/Industry), Stage 3 (Viability Report), Stage 4 (Competitor Weaknesses), Stage 5 (Financial Vulnerabilities).
- **Action**: LLM generates 10-15 risks across the 6 categories.
- **Output**: JSON array of risks conforming to schema.

### 3. Scoring Model Decision

**Decision: Simplify to 2-Factor (Probability x Impact).**

- **Reasoning**: "Severity" in the CLI (1-5) overlaps significantly with "Impact" (1-5). In standard risk management (ISO 31000), Risk Level is Probability x Consequence (Impact).
- **Benefit**: Reduces LLM hallucination/confusion between "Severity" and "Impact".
- **Implementation**:
  - Scale: 1-5 integers (Preserve CLI's integer nature for robustness).
  - Score Range: 1-25.
  - Mapping: Low (1-4), Medium (5-9), High (10-15), Critical (16-25).

### 4. Aggregate Metrics Recommendation

**Recommendation: Add `risk_summary` derived object.** Stage 6 should export high-level signals for downstream consumption (Stage 7 Pricing, Stage 9 Exit).

**New Fields**:
- `total_risk_count`: Integer.
- `max_risk_score`: Integer (1-25).
- `critical_risk_count`: Integer (Score >= 16).
- `top_risk_categories`: Array of strings (e.g., ["Financial", "Market"]).
- `overall_risk_level`: Enum (Low, Medium, High, Critical).

### 5. Stage 5 -> Stage 6 Pipeline

**Recommendation: Auto-Seed Financial Risks.** Stage 5's active financial model provides hard data. Stage 6 should technically enforce the presence of these risks if conditions are met.

**Triggers**:
- Cash Flow: If `months_to_breakeven > 18` -> Add Financial Risk: "Extended Cash Burn" (Prob: 5, Impact: 4).
- Margins: If `gross_margin < 40%` -> Add Financial Risk: "Margin Sensitivity" (Prob: 3, Impact: 5).
- Dependence: If Stage 5 explicitly flags "High Churn Sensitivity" -> Add Market Risk: "Customer Retention" (Prob: 4, Impact: 5).

### 6. CLI Superiorities (Preserve These)

- **Residual Risk Tracking**: Critical for the "Design" phase. It proves why a mitigation exists. "If we do X, risk drops from 25 to 10."
- **Explicit Categories**: The 6-category model is better than 4. "Legal/Compliance" is a major venture killer that GUI ignores.
- **Review Date**: Forces temporal thinking. "We will check this again in Q3." Essential for the "Review" loop in Stage 25.

### 7. Recommended Stage 6 Schema

```javascript
schema: {
  risks: {
    type: 'array',
    minItems: 10,
    items: {
      id: { type: 'string', required: true },
      category: { type: 'enum', values: ['Market', 'Product', 'Technical', 'Legal/Compliance', 'Financial', 'Operational'] },
      description: { type: 'string', minLength: 10 },
      probability: { type: 'integer', min: 1, max: 5 },
      impact: { type: 'integer', min: 1, max: 5 },
      score: { type: 'integer', derived: true },
      mitigation: { type: 'string' },
      residual_probability: { type: 'integer', min: 1, max: 5 },
      residual_impact: { type: 'integer', min: 1, max: 5 },
      residual_score: { type: 'integer', derived: true },
      status: { type: 'enum', values: ['open', 'mitigated', 'accepted', 'closed'] }
    }
  },
  risk_summary: {
    type: 'object',
    derived: true,
    properties: {
      total_risks: { type: 'integer' },
      max_score: { type: 'integer' },
      critical_count: { type: 'integer' },
      overall_level: { type: 'string' }
    }
  }
}
```

### 8. Minimum Viable Change

1. **Add `analysisStep`**: Create prompts to generate risks from Stage 1, 3, 4, 5. (Priority: High)
2. **Simplify Scoring**: Remove severity field. Update computeDerived to `score = probability * impact`. (Priority: Medium)
3. **Implement Aggregation**: Update computeDerived to populate `risk_summary`. (Priority: Medium)
4. **Seed Stage 5 Risks**: Inject financial risks into the generation context. (Priority: Medium)

### 9. Cross-Stage Impact

- **Stage 7 (Pricing)**: Can now use `risk_summary.overall_level` to recommend pricing strategy. (e.g., High Risk -> "Skimming" strategy to recover costs early; Low Risk -> "Penetration" strategy).
- **Stage 9 (Exit)**: The "Reality Gate" checks for >= 10 risks. CLI Stage 6 generators must be tuned to produce at least 10 valid risks to avoid blocking Stage 9 later.
- **Stage 25 (Review)**: Will rely on `review_date` and `status` to prompt the user to update risks.
