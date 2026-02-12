# Stage 2 "AI Review" -- AntiGravity Response

> Independent response to the Stage 2 triangulation prompt.
> Respondent: AntiGravity (Google Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Downstream Impact (Stage 3 Kill Gate) | Verdict |
|---|---|---|---|---|
| Analysis Generation | Active 4-Agent Ensemble (Lead, Plan, Exec, Eva) | None (Passive container) | CRITICAL. Stage 3 requires data to compute kill metrics. Without Stage 2 analysis, Stage 3 starts blind. | ADAPT (Simplify) |
| Score Scale | 0-10 Decimal | 0-100 Integer | High. Stage 3 formulas expect 0-100. Decimal format requires conversion. | CLOSE (Adopt CLI 0-100) |
| Categories | 5 Generic (Quality, Viability, Market, Originality, Feasibility) | None (Flat composite) | High. Stage 3 has 6 specific metrics. GUI categories don't map 1:1, making prediction of "Kill" likelihood difficult. | ELIMINATE (Use Stage 3 metrics) |
| Recommendation | Hardcoded thresholds (Advance/Revise/Reject) | Decision Filter Engine (Configurable Engine) | Low. The CLI's Decision Filter Engine is superior and centrally managed. | ELIMINATE (Use DFE) |
| Determinism | Randomized (Non-deterministic) | Deterministic Philosophy | Medium. Randomness hurts regression testing and "The Truth" phase reliability. | ELIMINATE (Enforce determinism) |
| Actionable Suggestions | Strategic & Immediate lists | None | Medium. Helpful for user, but not strictly required for the Stage 3 kill calculation. | ADAPT (Include in schema) |

### 2. Architecture Recommendation

**Recommendation: Single "MoA" (Mixture of Agents) Prompt**

- **Why Single vs Multi-Agent?** The GUI's 4-agent ensemble (Lead/Plan/Exec/Eva) is expensive and slow for Stage 2 (Draft Idea level). A Stage 2 idea often has only 3 fields. Spinning up 4 full agents is overkill.
- **Implementation**: Use a single GPT-4o call with a system prompt that explicitly delineates 3 personas ("As Strategic Lead...", "As Technical Executor...", "As Product Planner..."). This maintains the diversity of perspective (the value prop of the GUI) without the overhead of the GUI architecture.
- **Leveraging CLI Infrastructure**:
  - **Devil's Advocate**: Do NOT replicate the "Eva" synthesis agent. Instead, rely on the existing Devil's Advocate infrastructure which already runs at the Stage 3 Gate. Stage 2 should just provide the "Optimistic/Realistic" analysis; Devil's Advocate will provide the "Pessimistic" check at the gate.
  - **Decision Filter Engine**: Do NOT implement "Advance/Reject" logic in the template. Map the output scores to the `low_score` trigger in the Decision Filter Engine.

### 3. Score Scale & Category Alignment

**Scale**: 0-100 Integer.
- Justification: Aligns with Stage 3 kill gate formulas and CLI standard.

**Structure**: Adopt Stage 3 Metrics directly. Instead of the GUI's 5 generic categories, Stage 2 should estimate the 6 specific metrics that will be used to kill the venture in Stage 3. This transforms Stage 2 into a "Pre-flight Check" for Stage 3.

| GUI Category | Recommended CLI Category (Stage 3 Pre-computation) |
|---|---|
| Market | Market Fit (0-100) |
| (New) | Customer Need (0-100) |
| Viability | Revenue Potential (0-100) |
| Originality | Competitive Barrier (0-100) |
| Feasibility | Execution Feasibility (0-100) |
| Quality | Momentum/Signal (0-100) |

### 4. CLI Superiorities (Preserve These)

- **Decision Filter Engine (DFE)**: The CLI's DFE (`lib/eva/decision-filter-engine.js`) is superior to the GUI's hardcoded thresholds because it allows Chairman Preferences to be injected (e.g., "Kill anything with < 60 Market Fit"). Preserving this allows dynamic governance.
- **Infrastructure-Level "Devil's Advocate"**: The CLI decouples the adversarial review from the generation stage. This is better than the GUI's "all-in-one" approach because it prevents the analysis generation from contaminating the risk assessment.
- **Strict Validation**: The CLI's schema validation (`validateString`, `validateInteger`) ensures data integrity that the GUI's loose typing often misses.

### 5. Recommended Stage 2 Schema (CLI-Native)

```javascript
schema: {
  // The Analysis (Replacing descriptions)
  analysis: {
    strategic: { type: 'string', description: 'Market & Positioning analysis' },
    technical: { type: 'string', description: 'Feasibility & Architecture analysis' },
    tactical: { type: 'string', description: 'Execution & Resource analysis' }
  },
  // The Numbers (Aligned to Stage 3)
  metrics: {
    marketFit: { type: 'integer', min: 0, max: 100 },
    customerNeed: { type: 'integer', min: 0, max: 100 },
    revenuePotential: { type: 'integer', min: 0, max: 100 },
    competitiveBarrier: { type: 'integer', min: 0, max: 100 },
    executionFeasibility: { type: 'integer', min: 0, max: 100 },
    momentum: { type: 'integer', min: 0, max: 100 }
  },
  // Actionable metadata (from GUI)
  suggestions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['immediate', 'strategic'] },
        text: { type: 'string' }
      }
    }
  },
  // Composite for rapid filtering
  compositeScore: { type: 'integer', derived: true }
}
```

### 6. Minimum Viable Change

**Priority 1: Inject Analysis Capability (Critical)**
- Modify `lib/eva/stage-templates/stage-02.js` (or the override) to add an `analysisSteps` array.
- Create a single prompt template: `STAGE_02_MULTI_PERSPECTIVE_ANALYSIS`.
- Wire the `llm.generate` step to populate the `analysis` and `metrics` fields.

**Priority 2: Schema Alignment**
- Update `stage-02.js` schema to replace critiques array with the structured metrics object defined above.
- Update `computeDerived` to average the 6 distinct metrics instead of the generic critique scores.

**Priority 3: Decision Engine Wiring**
- Ensure the Decision Filter Engine looks at `metrics.marketFit` and `compositeScore` to trigger `low_score` warnings.

### 7. Cross-Stage Impact

- **Stage 3 (Validation)**: BIG WIN. Stage 3 currently has to "hunt" for data. With this change, Stage 2 passes a hypothesis for each of the 6 kill metrics. Stage 3 becomes a process of validating those specific numbers rather than generating them from scratch.
- **Stage 4 (Competitive)**: The `competitiveBarrier` metric from Stage 2 acts as a triage flag. If Stage 2 says "Barrier: 20/100", Stage 4 knows it must strictly focus on finding competitors to confirm this risk.
- **Stage 5 (Foundation Gate)**: The aggregated data provides a complete "Truth" baseline. The "Foundation" is no longer just "it parsed"; it's "we have estimated probabilities for all success factors."
