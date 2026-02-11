# Stage 1 "Draft Idea" — AntiGravity Response

> Independent response to the Stage 1 triangulation prompt.
> Respondent: Google AntiGravity (Gemini)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Downstream Impact (Stages 2-5) | Verdict |
|-----|---------|---------|--------------------------------|---------|
| Problem Statement | Explicit field (Optional) | Implicit (assumed in Description) | High. Stage 3 explicitly validates customerNeed. Without a clear problem statement, AI critique in Stage 2 is unfocused. | CLOSE (Add field) |
| Assumptions | Explicit list (Optional) | None | Medium. Stage 3 validates executionFeasibility. Explicit assumptions help identifying risks early. | CLOSE (Add field) |
| Archetype | Explicit dropdown (Optional) | Calculated in Stage 0 (but lost in Stage 1) | High. Archetypes drive the business model validation in Stage 3. | ADAPT (Wire from Stage 0) |
| Strategic Focus | Multi-select (Required) | None | Low. Primarily for portfolio management/filtering, less critical for individual venture validation. | ELIMINATE (Derive later) |
| Tags | Tag input (Required) | None | Low. Metadata only. | ELIMINATE |
| Category | Dropdown (Optional) | None | Low. Metadata only. | ELIMINATE |
| Key Metrics | Computed "Completeness" % | None | Medium. Helps user know if they are ready for Stage 2. | ADAPT (Implement `validate` feedback) |
| AI Enhancement | "Enhance with AI" button | Stage 0 Synthesis (Rich, but disconnected) | High. The GUI's AI helper improves the idea before submission. The CLI has a much more powerful engine in Stage 0 that should be leveraged. | ADAPT (Use Stage 0 Output) |

### 2. CLI Superiorities (Preserve These)

- **Rich Synthesis Engine (Stage 0)**: The CLI possesses detailed problem_reframing, moat_architecture, build_cost_estimation, and time_horizon analysis from Stage 0. The GUI has none of this pending the "Enhance" button.
- **Financial Forecasting (Stage 0)**: The CLI generates a full 3-year P&L forecast in Stage 0. This is superior to any manual entry in the GUI and should be carried forward.
- **Deterministic Validation**: The CLI's validation logic is code-based and testable (validateString utils), whereas the GUI relies on client-side form state.

### 3. Stage 0 → Stage 1 Pipeline Recommendation

**Current State**: Stage 0 produces a venture_brief (Synthesis + Forecast). Stage 1 currently initializes with empty string defaults.

**Recommendation**: Modify `executeStageZero` in `stage-zero-orchestrator.js` to pass the entire synthesized object to the Stage 1 initialization command.

The `stage-01.js` template should be updated to accept an `initialData` payload that maps the rich Stage 0 output:

- `description` <- `synthesis.problem_reframing.recommended_framing.framing` + `pathOutput.suggested_solution`
- `idea_archetype` <- `synthesis.archetypes.primary_archetype`
- `moat_strategy` <- `synthesis.moat_architecture.primary_moat`
- `market_analysis` <- `synthesis.market_sizing` (TAM/SAM/SOM)

This ensures the "Enhance with AI" capability is effectively native to the CLI flow, as Stage 0 IS the enhancement step.

### 4. Recommended Field Set (CLI Stage 1)

Update `lib/eva/stage-templates/stage-01.js` schema:

```javascript
schema: {
  // Core Identity
  name: { type: 'string', minLength: 5, required: true },
  description: { type: 'string', minLength: 50, required: true }, // The "Pitch"
  // Value Definition (New/Renamed)
  problem_statement: { type: 'string', minLength: 20, required: true }, // FROM GAP
  target_market: { type: 'string', minLength: 10, required: true },
  value_prop: { type: 'string', minLength: 20, required: true },
  // Strategic Context (From Stage 0)
  archetype: { type: 'string', enum: ['automator', 'aggregator', 'platform', 'deep_tech', 'saas', 'service'], required: true },
  moat: { type: 'string', required: false },
  // Execution Reality (From Gap)
  key_assumptions: { type: 'array', items: { type: 'string' }, required: false },
}
```

### 5. Minimum Viable Change

**Priority 1: Update Stage 1 Schema**
- Verify `stage-01.js` against the recommended field set.
- Add `problem_statement` and `key_assumptions` fields.
- Add `archetype` field (enum based).

**Priority 2: Wire Stage 0 Output**
- Modify `executeStageZero` to construct the CLI command with arguments derived from synthesis, OR rely on a continuing_venture_context file if CLI args are too long.
- (Better) Create a `hydrateFromStage0(brief)` utility in Stage 1 that maps the Stage 0 artifact to the Stage 1 schema.

### 6. Cross-Stage Impact

- **Stage 2 (AI Critique)**: Will now have specific `problem_statement` and `key_assumptions` to critique, making the generic "Strengths/Risks" output much more targeted. The `compositeScore` will be more reliable.
- **Stage 3 (Validation)**:
  - `marketFit` metric will rely on `target_market` + `problem_statement` alignment.
  - `executionFeasibility` metric will rely on checking the `key_assumptions` list.
  - Kill Gate: The distinct `archetype` field allows Stage 3 to apply different scoring weights (e.g., Deep Tech needs higher `executionFeasibility` than a simple SaaS).
