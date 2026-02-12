# Stage 8 "Business Model Canvas" -- Claude Response

> Independent response to the Stage 8 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| BMC generation | Manual entry (no AI) | Manual entry (no AI) | **5 Critical** | Without generated content, Stage 8 is an empty form. Stage 9 Exit Strategy has no BMC to evaluate. Every downstream stage that references business model is compromised. | CLOSE | Challenge: BMC generation is the most complex analysisStep so far -- it must synthesize 7 prior stages into 9 coherent blocks. But LLMs are well-suited to this synthesis task. |
| Completeness scoring | 0-100% with 50% threshold | Pass/fail validation only | **3 Medium** | Pass/fail is binary -- either all 9 blocks meet min items or validation fails. No partial credit, no "good enough" threshold. But for LLM-generated content, completeness is assured by the prompt. | ADAPT | Challenge: If Stage 8 has an analysisStep, completeness scoring is less important because the LLM will fill all blocks. Scoring matters more for manual entry. Keep pass/fail but add item count per block as metadata. |
| Recommendations engine | Block-specific + cross-block | None | **2 Low** | Recommendations guide manual entry. But if an analysisStep generates the BMC, recommendations become post-hoc validation. The LLM should produce a coherent BMC that doesn't need "add more items" prompts. | ADAPT | Challenge: Don't build a recommendations engine for a stage that will be LLM-generated. Instead, add validation rules that catch structural issues (e.g., Revenue Streams should reference pricing model from Stage 7). |
| Prior stage consumption | Passed but unused | None | **5 Critical** | Both CLI and GUI fail here -- neither actually uses prior stage data. The entire point of Stage 8 being in THE ENGINE phase is that it synthesizes everything before it. Without consumption, BMC is disconnected from the pipeline. | CLOSE | No challenge. This is the single most important gap. Stage 8 must consume Stages 1-7. |
| Guiding prompts | 2-4 questions per block | None | **2 Low** | Prompts guide manual entry. For an analysisStep, the prompts become part of the LLM prompt, not the user interface. | ADAPT | Challenge: Move prompts into the analysisStep system prompt rather than the schema. They're LLM instructions, not data fields. |
| Priority/ranking (CLI) | No | Yes (1-3 per item) | **3 Medium** | Priority helps Stage 9 focus on the most important elements of the business model. "Key Resource #1 is the technology platform" is more useful than an unranked list. | PRESERVE | Challenge: The GUI's lack of priority is a regression, not a feature. Priority ranking is analytically superior. Preserve it. |
| Evidence tracking (CLI) | No | Yes (per item) | **3 Medium** | Evidence traces BMC items back to earlier stage data. "Revenue Streams: SaaS subscriptions (evidence: Stage 7 pricing model = subscription, Stage 4 shows 4/5 competitors use subscriptions)." This is valuable for auditability. | PRESERVE | Challenge: Evidence is uniquely valuable in an LLM pipeline -- it prevents hallucination by requiring the model to cite its sources. |
| Visual layout | 5-column CSS grid | None (data only) | **1 Cosmetic** | Visual layout is a presentation concern. The CLI produces data, not visual artifacts. | ELIMINATE | The CLI doesn't render UI. This is exclusively a frontend concern. |
| Draft saving | Save incomplete canvas | None | **1 Cosmetic** | The CLI processes stages atomically. Draft state is managed by the orchestrator, not the stage template. | ELIMINATE | The EVA orchestrator already handles partial progress at the stage level. |
| Min items threshold | 1-2 (lower, varies) | 2 (1 for partnerships) | **2 Low** | CLI's higher minimum is slightly more demanding but reasonable. For LLM-generated content, the model will typically produce 3-5 items per block anyway. | PRESERVE | Keep CLI's thresholds. They're appropriate for ensuring substance. |
| Artifact versioning | Incremented per save | None explicit | **1 Cosmetic** | Versioning is platform-level concern. The EVA orchestrator tracks stage data versioning. | ELIMINATE | Already handled at orchestrator level. |

### 2. BMC Generation Recommendation

**Add a single `analysisStep` that generates a complete 9-block BMC from Stages 1-7.**

This is the #1 gap across both CLI and GUI. Neither implementation generates BMC content. The GUI's static recommendations ("add more items") are a poor substitute for actual generation.

**Input (from prior stages)**:
- **Stage 1**: Venture description, problem statement, target market
- **Stage 2**: AI review scores and per-dimension analysis
- **Stage 3**: Market validation metrics (TAM, growth rate, market signals)
- **Stage 4**: Competitor landscape (names, positions, pricing models, competitive intensity)
- **Stage 5**: Financial projections (ROI, break-even, unit economics)
- **Stage 6**: Risk register (top risks by category, overall risk score, mitigation strategies)
- **Stage 7**: Pricing strategy (model, tiers, value metrics, competitive positioning)

**Process (single LLM call)**:
1. **Customer Segments**: Derive from Stage 1 target market + Stage 3 TAM analysis + Stage 4 competitor target segments
2. **Value Propositions**: Derive from Stage 1 problem statement + Stage 2 AI review + Stage 7 value metrics
3. **Channels**: Infer from Stage 4 competitor channels + Stage 1 venture type (B2B vs B2C implies different channels)
4. **Customer Relationships**: Derive from Stage 7 pricing model (subscription → ongoing relationship, transaction → transactional)
5. **Revenue Streams**: Directly from Stage 7 pricing model, tiers, and ARPA
6. **Key Resources**: Derive from Stage 6 risk mitigations (what resources are needed to mitigate key risks?) + Stage 1 technology
7. **Key Activities**: Derive from Stage 6 top risk categories (Market risk → marketing activities, Technical risk → engineering activities)
8. **Key Partnerships**: Infer from Stage 4 competitive landscape (gaps that require partners) + Stage 6 mitigations requiring external help
9. **Cost Structure**: Derive from Stage 5 financial model (major cost categories) + Stage 6 mitigation costs + Stage 7 CAC

**Output**: All 9 blocks populated with 3-5 items each, every item having text, priority (1-3), and evidence (referencing source stage).

**Evidence requirement**: Every generated item MUST include an evidence field citing the source stage and data point. This prevents hallucination and enables auditability.

### 3. Item Structure Decision

**Preserve CLI's richer item structure (text + priority + evidence). Do NOT adopt GUI's plain string[].**

The CLI's item structure is analytically superior:
- **priority (1-3)**: Enables Stage 9 to focus on the most important aspects of the business model. Not all items are equal -- priority makes this explicit.
- **evidence**: Traces each BMC item back to its source data. In an LLM-generated pipeline, evidence prevents hallucination and provides auditability.

The GUI's plain string[] was a UI simplification -- easier to type in a text area, but loses analytical value. Since the CLI generates content via LLM (not manual typing), the richer structure costs nothing.

### 4. Completeness Scoring Decision

**Keep pass/fail validation. Add block-level item counts as metadata.**

Rationale:
- If Stage 8 has an `analysisStep`, the LLM will fill all 9 blocks adequately. Completeness scoring is a manual-entry concern.
- Pass/fail validation (all blocks have min items) is sufficient for catching generation failures.
- Add `blockCompleteness` derived field: `{ blockName: itemCount }` for observability.
- Do NOT add a 0-100% score or minimum percentage threshold. This adds complexity for a stage that will be LLM-generated.

### 5. Prior Stage Consumption Strategy

**Stage 8 is the convergence point. Every prior stage feeds into it.**

| Source Stage | BMC Blocks Fed | Data Consumed |
|-------------|---------------|---------------|
| Stage 1 (Venture Entry) | Customer Segments, Value Propositions | Venture description, problem statement, target market |
| Stage 2 (AI Review) | Value Propositions | Per-dimension scores, strengths identified |
| Stage 3 (Market Validation) | Customer Segments, Channels | TAM, growth rate, market signals |
| Stage 4 (Competitive Intel) | Channels, Key Partnerships | Competitor positions, pricing models, competitive gaps |
| Stage 5 (Profitability) | Cost Structure, Revenue Streams | Financial projections, unit economics, break-even |
| Stage 6 (Risk Matrix) | Key Resources, Key Activities, Cost Structure | Top risks, mitigations, risk categories |
| Stage 7 (Pricing) | Revenue Streams, Customer Relationships, Value Propositions | Pricing model, tiers, value metrics, competitive positioning |

**Implementation**: The `analysisStep` prompt includes structured data from all 7 prior stages. The LLM synthesizes this into the 9 BMC blocks with evidence citations back to source stages.

### 6. Recommendations/Validation Design

**Replace GUI's static recommendations with structural validation rules.**

The GUI's recommendations ("Add X more items to [Block]") are manual-entry guardrails. For LLM-generated content, validation should check coherence instead:

1. **Revenue-Pricing alignment**: Revenue Streams must reference Stage 7 pricing model. If Stage 7 = "subscription" but Revenue Streams doesn't mention subscriptions, warn.
2. **Cost-Risk alignment**: Cost Structure should include costs for mitigating Stage 6 top risks. If a high-severity risk has no corresponding cost item, warn.
3. **Segment-Market alignment**: Customer Segments should align with Stage 3 market validation. If Stage 3 validates a B2B market but Customer Segments are all B2C, warn.
4. **Block balance**: No block should have > 3x the items of another block. Unbalanced BMCs suggest the LLM over-focused on one area.

These are validation warnings in the `computeDerived()` function, not a separate recommendations engine.

### 7. CLI Superiorities (preserve these)

- **Priority ranking (1-3)**: Enables downstream stages to focus on what matters most. The GUI's unranked lists lose analytical value.
- **Evidence field**: Traces BMC items to source data. Critical for auditability in an LLM pipeline.
- **Uniform item schema**: All 9 blocks share identical structure. Clean, predictable, easy to validate.
- **Higher min items**: 2 per block (vs GUI's 1) ensures more substance per block.
- **Cross-links**: Static links to Stage 6 and 7 provide explicit stage relationships.
- **Pure function `computeDerived()`**: Deterministic, testable, no side effects.

### 8. Recommended Stage 8 Schema

```javascript
const TEMPLATE = {
  id: 'stage-08',
  slug: 'bmc',
  title: 'Business Model Canvas',
  version: '2.0.0',
  schema: {
    // === All 9 BMC blocks (unchanged structure) ===
    // Each block: { items: [{ text, priority (1-3), evidence }] }
    customerSegments:       { type: 'object', required: true, items: { minItems: 2, ... } },
    valuePropositions:      { type: 'object', required: true, items: { minItems: 2, ... } },
    channels:               { type: 'object', required: true, items: { minItems: 2, ... } },
    customerRelationships:  { type: 'object', required: true, items: { minItems: 2, ... } },
    revenueStreams:          { type: 'object', required: true, items: { minItems: 2, ... } },
    keyResources:           { type: 'object', required: true, items: { minItems: 2, ... } },
    keyActivities:          { type: 'object', required: true, items: { minItems: 2, ... } },
    keyPartnerships:        { type: 'object', required: true, items: { minItems: 1, ... } },
    costStructure:          { type: 'object', required: true, items: { minItems: 2, ... } },

    // === Existing derived (updated) ===
    cross_links: { type: 'array', derived: true },

    // === NEW: Block completeness metadata ===
    blockCompleteness: {
      type: 'object', derived: true,
      // { customerSegments: 3, valuePropositions: 4, ... }
    },

    // === NEW: Validation warnings ===
    warnings: { type: 'array', derived: true },

    // === NEW: Provenance ===
    provenance: {
      type: 'object', derived: true,
      properties: {
        dataSource: { type: 'string' },  // 'generated' or 'manual'
        model: { type: 'string' },
        stagesConsumed: { type: 'array' },  // ['stage-01', 'stage-02', ...]
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. Added `blockCompleteness` metadata (item counts per block)
2. Added `warnings` array for structural validation
3. Added `provenance` tracking (source stages consumed)
4. All existing fields and validation unchanged

### 9. Minimum Viable Change

1. **P0: Add `analysisStep` for BMC generation from Stages 1-7**. Single LLM call consuming all prior stage data. Produces all 9 blocks with text, priority, and evidence per item. This is the #1 gap -- without it, Stage 8 is an empty container.

2. **P0: Wire Stages 1-7 consumption into the analysisStep**. The analysisStep prompt must include structured data from all prior stages. This is what makes Stage 8 "THE ENGINE" -- it synthesizes everything.

3. **P1: Add structural validation warnings**. Revenue-Pricing alignment, Cost-Risk alignment, Segment-Market alignment, block balance. These catch LLM generation issues.

4. **P1: Add `blockCompleteness` and `provenance` derived fields**. Lightweight metadata for observability.

5. **P2: Add block-level guiding context in analysisStep prompt**. Include the GUI's per-block questions as LLM prompt context (not schema fields).

6. **P3: Do NOT add completeness scoring (0-100%)**. Pass/fail is sufficient for LLM-generated content.
7. **P3: Do NOT add recommendations engine**. Structural validation replaces static recommendations.
8. **P3: Do NOT add visual layout concerns**. CLI is data, not presentation.

### 10. Cross-Stage Impact

| Change | Stage 9 (Exit Strategy) | Stage 10+ (Identity/Build) | Broader Pipeline |
|--------|------------------------|---------------------------|-----------------|
| BMC generation | **Direct input** -- Stage 9 needs a complete BMC to evaluate exit pathways. Revenue Streams inform acquirer interest, Cost Structure informs valuation, Key Partnerships inform acquisition targets. | Naming (Stage 10) can reference Value Propositions and Customer Segments. Build phases reference Key Activities and Key Resources. | The BMC is the most referenced artifact in the pipeline. Every downstream stage that discusses "the business model" depends on Stage 8 output. |
| Evidence tracking | Stage 9 can trace exit strategy rationale back through BMC evidence to source stages. "Exit via acquisition because Key Partnerships include [partner] (evidence: Stage 4 competitor gap)." | Evidence chains enable full pipeline traceability from Stage 1 through Stage 25. | Creates an audit trail for the entire venture evaluation. |
| Structural validation | Validation catches BMCs that don't match prior stage data. If Revenue Streams contradicts Stage 7 pricing, Stage 9 would receive inconsistent data. | Inconsistencies propagate. Catching them at Stage 8 prevents downstream confusion. | Stage 8 is the last "synthesis" stage before exit planning. Validation here is a critical quality gate even though it's not a kill gate. |
| Priority ranking | Stage 9 can focus exit strategy on highest-priority BMC elements. "Primary value proposition is X (priority 1), suggesting acquisition by companies needing X." | Priority helps all downstream stages focus on what matters most. | Reduces noise in later stages by surfacing the most important elements. |
