---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 9 "Exit Strategy" -- AntiGravity Response

> Independent response to the Stage 9 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Exit Types | 6 explicit enum types | Freeform string | **5 Critical** | High (naming/branding context) | ADOPT ENUM | Freeform is too vague for the "Engine" capstone. |
| Buyer Types | 4 enum types | None | **4 High** | High (Stage 10 Naming target audience) | ADOPT ENUM | Necessary for AI to identify specific types of targets. |
| Valuation | 4 methods (Rev, EBITDA, DCF, Comps) | None | **3 Medium** | Low (valuation is speculative at this phase) | PARTIAL ADOPT | Full valuation suite is overkill. Revenue Multiple only. |
| Target Acquirers | buyer DB, outreach tracking | 3 min list, fit_score 1-5 | **3 Medium** | Medium (sets stage for Identity) | CLI SUFFICIENT | Detailed outreach tracking belongs in Execution (CRM), not Engine. |
| Exit Readiness | 6-category checklist, A-F grading | None | **2 Low** | None (belongs in Build/Scale) | DEFER TO BUILD | "Readiness" is about being ready to sell, not planning to sell. |
| Milestones | status, dependencies, owner | date + criteria | **3 Medium** | Low (planning fidelity) | CLI SUFFICIENT | At blueprint stage, "status" is always "pending". Keep simple. |
| Reality Gate | None (Exit Grade substitutes) | Explicit Stg 6/7/8 checks | **5 Critical** | Critical (Phase transition safety) | KEEP CLI | CLI's explicit gate is superior to a fuzzy "grade". |
| AI Generation | 4 functions | None | **5 Critical** | Critical (Analysis step needed) | ADD ANALYSIS | Essential to generate the strategy from BMC context. |

### 2. AnalysisStep Design

**Context**: The LLM has stage00 (context), stage06 (Risks), stage07 (Pricing), and stage08 (BMC).

**Inputs**:
- **BMC (Stage 8)**: Specifically Revenue Streams (for valuation model), Key Partnerships (for acquirer targets), Value Propositions (distribution channel fit).
- **Financial Grid (Stage 5)**: Revenue magnitude (to size the exit).
- **Competitors (Stage 4)**: To identify potential acquirers (competitors often buy).

**Mapping: BMC to Exit Strategy**:
- Key Partnerships → Target Acquirers (Strategic fit)
- Customer Segments → Buyer Type (Who wants this audience?)
- Revenue Streams → Valuation Model (SaaS = Rev Mult; Transactional = GMV/EBITDA)
- Cost Structure → Profitability Profile (influences Private Equity interest)

**Outputs (JSON)**:
```json
{
  "exit_thesis": "One paragraph narrative explaining the most likely exit intent.",
  "primary_exit_type": "enum(acquisition | ipo | merger | strategic_sale | mbo | liquidation)",
  "exit_horizon_months": 36,
  "valuation_blueprint": {
    "method": "revenue_multiple",
    "rationale": "High growth SaaS typically trades on revenue.",
    "conservative_multiple": 5.0,
    "aggressive_multiple": 10.0
  },
  "potential_acquirers": [
    {
      "name": "Competitor X",
      "type": "competitor",
      "rationale": "Consolidation of market share.",
      "fit_score": 5
    }
  ],
  "engine_audit": {
    "risks_captured": 12,
    "pricing_tiers_defined": true,
    "bmc_completeness": 100
  }
}
```

### 3. Exit Type & Buyer Type Decisions

**Exit Types (Enum)**: Adopt the GUI's list but simplify descriptions for the CLI prompt.
`['acquisition', 'ipo', 'merger', 'strategic_sale', 'mbo', 'liquidation']`

**Reasoning**: Downstream (Stage 10 Identity) needs to know if we are building a "Flip to Google" brand or a "Legacy IPO" brand.

**Buyer Types (Enum)**:
`['strategic', 'financial', 'competitor', 'private_equity']`

**Reasoning**: Critical for Stage 10. A brand built for a Strategic acquirer (integration focus) looks different than one built for Private Equity (cash cow focus).

### 4. Valuation Approach (Blueprint Phase)

**Decision**: Revenue Multiple Only (for pre-revenue/early stage).

**Reasoning**: DCF and Comps are purely fictional at Stage 9. EBITDA is likely negative. Revenue multiple is the standard shorthand for "Scale Potential".

**Schema**: Add `valuation_blueprint` object (method, range, rationale). Do not calculate specific dollar amounts, just the logic.

### 5. Exit Readiness: Defer to BUILD

**Verdict**: Exclude from Stage 9.

**Reasoning**: You cannot check "Legal Documentation Readiness" for a venture that doesn't exist yet. This is a Stage 13+ (BUILD phase) concern. Stage 9 is about Strategy (The Engine), not Execution.

### 6. Reality Gate Assessment

**Verdict**: CLI Gate is Superior.

The CLI's `evaluateRealityGate` is concrete, testable, and strictly enforces the "Engine Compliant" rule.

**Modification**: Keep the existing function but add a check for exit_thesis quality (length/keywords).

### 7. Recommended Stage 9 Schema

```javascript
schema: {
  exit_thesis: { type: 'string', minLength: 50, required: true },
  exit_horizon_months: { type: 'integer', min: 6, max: 120 },
  primary_exit_type: {
    type: 'string',
    enum: ['acquisition', 'ipo', 'merger', 'strategic_sale', 'mbo', 'liquidation']
  },
  valuation_blueprint: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['revenue_multiple', 'ebitda_multiple'] },
      multiple_range: { type: 'string' }, // e.g. "5x-8x"
      rationale: { type: 'string' }
    }
  },
  target_acquirers: {
    type: 'array',
    minItems: 3,
    items: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['strategic', 'financial', 'competitor', 'private_equity'] },
      rationale: { type: 'string' },
      fit_score: { type: 'integer', min: 1, max: 5 }
    }
  },
  milestones: { /* keep existing simple structure */ }
}
```

### 8. Minimum Viable Change (Priority Ordered)

1. **Add analysisStep**: The most critical gap. Needs to synthesize Stages 1-8 into an exit story.
2. **Enforce Enums**: Restrict exit_paths (rename to primary_exit_type) and add buyer_type to acquirers.
3. **Add Valuation Logic**: Simple "multiple theory" only.
4. **Update Reality Gate**: Ensure it checks for the new enum validity.

### 9. Dependency Conflicts & Cross-Stage Impact

- **Stage 10 (Naming)**: Critical Dependency. The output of Stage 9 (Exit Strategy + Buyer Types) is a required input for Stage 10. Knowing we are targeting "Private Equity" (Conservative branding) vs "Google" (Innovative branding) changes the Naming generation prompt.
- **Stage 8 (BMC)**: No conflict, but Stage 9 validates Stage 8 completeness.

### 10. Contrarian Take / Risks

**Argument**: "We are over-engineering the exit for a paper idea."

**Counter-Point**: Startups that don't think about the exit at design time build un-acquirable businesses (e.g., service-heavy, low margin). Forcing this step ensures the "Engine" is actually capable of reaching a destination.

**Risk**: AI hallucinations on "Potential Acquirers". It might suggest "Google" for everything.

**Mitigation**: The fit_score and rationale must be rigorous. The User (human) is the final editor.
