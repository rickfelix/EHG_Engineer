# Stage 4 "Competitive Intel" -- Claude Response

> Independent response to the Stage 4 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 5 Kill Gate) | Verdict | Challenge |
|-----|---------|---------|:-----------------:|--------------------------------------|---------|-----------|
| Competitor discovery/research | Active AI agent with polling + manual entry | Nothing -- passive container | **5 Critical** | Stage 5 needs competitor pricing and market data for financial projections. Without competitor discovery, Stage 4 is empty. | CLOSE | Challenge: Stage 3 consensus adds competitor entities to Stage 3 output. But Stage 3 produces identification-level data (name, threat, position) not research-level data (pricing, market share, URLs, SWOT). Stage 4 still needs to deepen that data. |
| Competitor pricing data | Pricing model dropdown (6 types) per competitor | Nothing | **4 High** | Stage 5's revenue/COGS projections are directly informed by competitor pricing. Without knowing if competitors are freemium vs enterprise, pricing assumptions are guesswork. | CLOSE | Challenge: Stage 0 `cross-reference` module may have some pricing context, but it's not structured per-competitor. This is genuinely new data that Stage 4 must produce. |
| Market share estimates | Per-competitor % estimate | Nothing | **3 Medium** | Helps Stage 5 estimate TAM capture but is not directly consumed by the ROI/break-even formula. | ADAPT | Challenge: Market share estimates at the idea stage are speculative. A rough "dominant / significant / niche" classification may be more honest than fake percentages. |
| Feature comparison matrix | 6 weighted features, 4-level coverage | Nothing | **2 Low** | The feature matrix drives differentiation scoring but Stage 5's kill gate (ROI/break-even) doesn't consume feature-level data. | ELIMINATE | Challenge: The feature matrix is a product management tool, not a financial gate input. Stage 5 needs pricing and market size, not feature grids. The CLI's SWOT per competitor captures competitive positioning without the matrix overhead. |
| Differentiation score (0-10) | Calculated from feature coverage | Nothing | **3 Medium** | Informs how defensible the venture is, which affects long-term revenue sustainability. | ADAPT | Challenge: The CLI's existing `competitiveBarrier` metric (from Stage 3, 0-100) serves the same purpose as differentiation score. Don't duplicate it -- carry it forward and enrich it with Stage 4 evidence. |
| Defensibility grade (A-F) | Derived from differentiation score | Nothing | **2 Low** | A letter grade is a presentation format for the differentiation score. No analytical content beyond the score itself. | ELIMINATE | Challenge: This is UX formatting. The CLI's `competitiveBarrier` metric from Stage 3 carries the same signal in numeric form. |
| Market position label | Challenger / Follower / Niche Player | Nothing | **1 Cosmetic** | A string label derived from differentiation score. Zero analytical content. | ELIMINATE | Pure presentation. |
| Persona-to-competitor mapping | Fit scores per (persona, competitor) pair | Nothing | **2 Low** | Interesting for product strategy but not consumed by Stage 5's financial model. | ELIMINATE | Challenge: Stage 3 doesn't produce customer personas in the CLI. This is a GUI-specific feature chain. |
| Quality metadata | Confidence score, extraction method, issues, warnings | Nothing | **3 Medium** | Signals when competitive data is unreliable, which should temper Stage 5's financial assumptions. | ADAPT | Challenge: Good practice for any AI-generated data. The provenance pattern from Stage 2 consensus applies here too. |
| Edge case handling | Blue Ocean detection, partial extraction | Nothing | **3 Medium** | A venture with zero competitors is a valid scenario that needs explicit handling (Blue Ocean) rather than a validation error. | CLOSE | No challenge. The CLI's current schema requires minItems: 1 for competitors, which would reject Blue Ocean ventures. This must be fixed. |
| Website URLs per competitor | URL field | Nothing | **2 Low** | Useful for research provenance but not consumed by Stage 5. | ADAPT | Challenge: URLs are citations, not analytical data. Include in the schema for traceability but don't prioritize. |

### 2. Competitor Discovery Recommendation

**Pipeline approach (3 layers):**

1. **Layer 1 -- Stage 3 handoff** (free, already decided):
   - Per Stage 3 consensus, Stage 3 produces structured competitor entities (name, position, threat level)
   - This provides the initial list of 3-5 competitors identified during market validation
   - Stage 4 loads this artifact as its starting point

2. **Layer 2 -- AI research enrichment** (new `analysisStep`):
   - Single LLM call that takes the Stage 3 competitor list + venture description
   - Prompt: "For each competitor, research and provide: pricing model, estimated market share range, key strengths, key weaknesses, full SWOT analysis, and any additional competitors discovered"
   - LLM can identify 1-2 additional competitors not caught in Stage 3
   - Output: enriched competitor cards matching the schema

3. **Layer 3 -- Deterministic validation**:
   - Check that all required fields are populated
   - Validate threat level assignments against competitive evidence
   - If Blue Ocean detected (LLM found no competitors), produce explicit Blue Ocean artifact
   - Provenance tracking: which data came from Stage 3 vs Stage 4 enrichment

**Why NOT use the GUI's agent execution pattern**: The GUI's polling-based agent execution (start -> poll 3s -> results) is designed for async UI updates. The CLI's synchronous `analysisStep` pipeline is simpler and more reliable. A single well-prompted LLM call achieves the same result.

### 3. Feature Comparison Decision

**Decision: Do NOT build a feature comparison matrix.**

The GUI's feature matrix (6 weighted features, coverage levels) is a product management tool. It drives the differentiation score, but:

1. Stage 5's kill gate formula (`ROI3Y < 0.5 OR breakEvenMonth > 24`) does NOT consume feature-level data
2. The CLI's SWOT per competitor captures competitive positioning qualitatively
3. Stage 3's `competitiveBarrier` metric (0-100) already quantifies defensibility
4. Feature comparison belongs in Stage 8 (Technology Blueprint) or Stage 14 (Dev Preparation), not Stage 4

**What to do instead**: Enhance the SWOT analysis per competitor. The CLI already requires SWOT (strengths, weaknesses, opportunities, threats) per competitor. Make the LLM enrichment step produce detailed, evidence-based SWOTs rather than building a separate feature matrix.

### 4. Scoring Recommendation

**Stage 4 should produce ONE derived metric: `competitiveIntensity` (0-100)**

| Metric | Source | Consumed By |
|--------|--------|-------------|
| `competitiveIntensity` | Derived from competitor count, threat levels, market share distribution | Stage 5 (affects revenue growth assumptions) |

**Calculation**: Deterministic formula based on competitor data:
- Base: `competitor_count * 10` (capped at 50)
- High-threat multiplier: each H-threat competitor adds +10
- Market concentration: if any competitor has >30% share, add +15
- Result: 0-100 scale where higher = more intense competition

**Why NOT replicate GUI's differentiation score**: Stage 3's `competitiveBarrier` already captures defensibility. Stage 4 should capture the OTHER side -- how intense is the competitive landscape? These are complementary signals:
- `competitiveBarrier` (Stage 3): How defensible is OUR position?
- `competitiveIntensity` (Stage 4): How crowded is the market?

Stage 5 can use `competitiveIntensity` to adjust revenue growth projections and CAC assumptions.

### 5. Stage 3 -> Stage 4 Pipeline

**Stage 3 provides (per consensus)**:
- Structured competitor entities (name, position, threat level)
- `competitiveBarrier` metric (0-100)
- Market data from MarketAssumptions Service (TAM, growth, key competitors)

**Stage 4 enrichment** (what's NEW):
1. **Deepens** each competitor card: adds pricing model, market share range, URL, detailed SWOT
2. **Discovers** additional competitors the LLM identifies during research
3. **Quantifies** competitive intensity as a new derived metric
4. **Handles** Blue Ocean edge case (0 valid competitors after research)
5. **Produces** structured data for Stage 5: competitor pricing summary, market concentration

**What Stage 4 does NOT redo**: Threat level classification and `competitiveBarrier` score (already done in Stage 3). Stage 4 carries these forward and enriches them, doesn't recompute.

### 6. CLI Superiorities (preserve these)

- **Full SWOT per competitor** -- The CLI requires strengths, weaknesses, opportunities, AND threats for each competitor. The GUI's manual entry only captures strengths and weaknesses; the SWOT is AI-generated. The CLI's schema is more complete.
- **Duplicate name detection** -- The CLI validates case-insensitive uniqueness of competitor names. The GUI doesn't.
- **Structural validation** -- The CLI's `validate()` function ensures every competitor card has all required fields. The GUI allows incomplete entries.
- **Threat level classification** -- The CLI's H/M/L threat enum is simple, clear, and sufficient. The GUI's differentiation score is over-engineered for this stage.
- **No minimum score gate** -- Stage 4 correctly has no kill gate. It's information-gathering. The GUI also doesn't gate here, confirming this is the right design.
- **Synchronous pipeline** -- The CLI's `processStage()` flow is simpler than the GUI's async polling pattern.

### 7. Recommended Stage 4 Schema

```javascript
const TEMPLATE = {
  id: 'stage-04',
  slug: 'competitive-intel',
  title: 'Competitive Intel',
  version: '2.0.0',
  schema: {
    competitors: {
      type: 'array',
      minItems: 0,  // CHANGED: allow 0 for Blue Ocean
      items: {
        name: { type: 'string', required: true },
        position: { type: 'string', required: true },
        threat: { type: 'enum', values: ['H', 'M', 'L'], required: true },
        pricingModel: { type: 'enum', values: [
          'freemium', 'subscription', 'one-time',
          'usage-based', 'tiered', 'enterprise', 'unknown'
        ]},                                                  // NEW
        marketShareRange: { type: 'enum', values: [
          'dominant', 'significant', 'moderate', 'niche', 'unknown'
        ]},                                                  // NEW (honest classification vs fake %)
        url: { type: 'string' },                             // NEW
        strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
        weaknesses: { type: 'array', minItems: 1, items: { type: 'string' } },
        swot: {
          strengths: { type: 'array', minItems: 1 },
          weaknesses: { type: 'array', minItems: 1 },
          opportunities: { type: 'array', minItems: 1 },
          threats: { type: 'array', minItems: 1 },
        },
      },
    },
    blueOcean: { type: 'boolean', derived: true },            // NEW
    competitiveIntensity: { type: 'integer', min: 0, max: 100, derived: true },  // NEW
    pricingSummary: {                                          // NEW: for Stage 5
      type: 'object', derived: true,
      properties: {
        dominantModel: { type: 'string' },
        priceRange: { type: 'string' },
        avgCompetitorCount: { type: 'integer' },
      },
    },
    provenance: {                                              // NEW: from Stage 2 consensus
      type: 'object',
      properties: {
        stage3Competitors: { type: 'integer' },
        stage4Discovered: { type: 'integer' },
        researchModel: { type: 'string' },
        confidence: { type: 'number', min: 0, max: 1 },
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. `minItems: 0` for competitors (Blue Ocean support)
2. Added `pricingModel` enum per competitor (for Stage 5)
3. Added `marketShareRange` as honest classification instead of fake percentages
4. Added `url` for research provenance
5. Added `blueOcean` derived flag
6. Added `competitiveIntensity` derived metric (0-100)
7. Added `pricingSummary` derived for Stage 5 consumption
8. Added `provenance` tracking

### 8. Minimum Viable Change

Ranked by priority:

1. **P0: Add `analysisStep` for competitor research enrichment** -- Insert into `venture_stage_templates` for lifecycle_stage=4. This step loads Stage 3's competitor entities, sends them to an LLM for enrichment (pricing, market share, SWOT, additional competitors), and produces the v2 competitor cards.

2. **P0: Allow `minItems: 0` for Blue Ocean** -- Change competitors array validation from `minItems: 1` to `minItems: 0`. When empty, set `blueOcean: true` and produce an explicit Blue Ocean artifact with the reasoning.

3. **P1: Add `competitiveIntensity` derived metric** -- Deterministic formula in `computeDerived()` based on competitor count, threat levels, and market share distribution. Feeds Stage 5 revenue assumptions.

4. **P1: Add `pricingModel` per competitor** -- Essential for Stage 5's pricing assumptions. If competitors are all enterprise ($10K+/yr), Stage 5's revenue model looks very different than if they're all freemium.

5. **P2: Add `pricingSummary` derived** -- Aggregate competitor pricing data for Stage 5 consumption (dominant model, price range).

6. **P2: Add `marketShareRange` classification** -- Honest bucket classification instead of fake percentages.

7. **P3: Do NOT build feature comparison matrix** -- SWOT analysis covers competitive positioning qualitatively. Feature matrix is product management, not financial gate input.

8. **P3: Do NOT replicate differentiation score** -- Stage 3's `competitiveBarrier` already quantifies defensibility.

### 9. Cross-Stage Impact

| Change | Stage 5 (Profitability Kill Gate) | Stage 6+ (Blueprint Phase) | Broader Pipeline |
|--------|----------------------------------|---------------------------|-----------------|
| Competitor pricing data | **Direct input** -- Stage 5 can base pricing assumptions on competitive data instead of defaults. If all competitors charge $99/mo, Stage 5's revenue model uses real benchmarks. | Stage 7 (Revenue Architecture) gets validated pricing context | Reduces "garbage in" at financial modeling stages |
| competitiveIntensity metric | **Revenue adjuster** -- High intensity (80+) should temper revenue growth projections; low intensity (<30) supports aggressive growth assumptions | Stage 9 (Brand Genome) uses intensity to inform positioning strategy | Provides a quantified market signal that carries through the pipeline |
| Blue Ocean support | Stage 5 needs special handling: no competitor pricing benchmarks means wider uncertainty bounds on financial projections | Blue Ocean ventures may need different stage workflows in later phases | Prevents false rejections of genuinely novel ventures |
| pricingSummary | **CAC/LTV** -- Competitor pricing model distribution directly informs customer acquisition cost assumptions and lifetime value calculations | Stage 7 consumes this for revenue architecture | Clean data handoff reduces Stage 5 guesswork |
| Stage 3 -> Stage 4 enrichment pipeline | More evidence = higher confidence in Stage 5 projections. Kill gate decisions backed by competitive research are more trustworthy. | All Blueprint stages benefit from rich competitive context | Establishes the "identify then enrich" pattern for multi-stage data building |
