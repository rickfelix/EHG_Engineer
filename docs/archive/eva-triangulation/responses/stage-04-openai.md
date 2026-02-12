# Stage 4 "Competitive Intel" -- OpenAI Response

> Independent response to the Stage 4 triangulation prompt.
> Respondent: GPT 5.3 (OpenAI)
> Date: 2026-02-11

`stage-04-triangulation.md` points to the right core issue: GUI Stage 4 is *analysis-heavy*, CLI Stage 4 is *schema-only*.
For Stage 5, you do **not** need full GUI parity; you need enough competitive signal to avoid bad ROI/break-even assumptions.

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 5 Kill Gate) | Verdict | Challenge |
|-----|---------|---------|:-----------------:|---------------------------------------|---------|-----------|
| Competitor discovery/enrichment | Active agent + manual entry | None (passive validation) | **5** | Missing competitor set -> weak pricing/CAC assumptions -> false-positive ROI | **CLOSE** | Stage 3 already emits competitors; don't duplicate full discovery, do targeted enrichment |
| Stage 3 -> 4 contract usage | Persona/market linkage flow | Not explicit in template behavior | **5** | Pipeline discontinuity causes Stage 4 to add no new evidence for Stage 5 | **CLOSE** | If Stage 3 contract is strong, Stage 4 should be "refine + normalize," not "re-find everything" |
| Pricing intelligence fields | Pricing model + pricing tab | No pricing fields | **5** | Stage 5 revenue assumptions become guessy without price anchors | **CLOSE** | Could be coarse bands first; no need for perfect competitor pricing scraper |
| Market-share / concentration signals | Segment/share estimates | Threat H/M/L only | **4** | Poor TAM/SAM realism and competitive pressure modeling | **ADAPT** | Replace exact market share with confidence-bounded estimate to avoid fake precision |
| Stage 5 handoff artifact | Explicit feed into pricing/CAC/LTV | None | **5** | Even good Stage 4 data becomes unusable if not transformed for Stage 5 inputs | **CLOSE** | Keep artifact minimal and deterministic |
| Quality/confidence metadata | confidence_score, quality issues | None | **4** | Stage 5 can't weight uncertain intel, increasing model brittleness | **CLOSE** | Reuse existing CLI validation mindset; avoid GUI-style progress/polling complexity |
| Weighted feature matrix (6 features, coverage levels) | Yes | None | **2** | Nice strategic detail; low direct impact on ROI gate mechanics | **ELIMINATE (full version)** | Keep lightweight substitute (capability parity flag), not full matrix |
| Differentiation/Defensibility/Market-position scores | Numeric + grade outputs | None | **3** | Helpful if tied to conversion/churn assumptions; otherwise vanity | **ADAPT** | Only keep scores that directly map to Stage 5 variables |
| Persona-to-competitor mapping | Explicit persona fit | None | **2** | Limited direct kill-gate effect unless pricing by persona is modeled | **ADAPT** | Optional in MVC; defer unless Stage 5 segments by persona |
| Edge-case handling (Blue Ocean/partial extraction) | Explicit handling | None | **3** | Missing branch logic can break pipeline or force bad defaults | **CLOSE** | Small cost, high reliability payoff |

### 2. Competitor Discovery Recommendation

- Use a **two-tier pipeline**:
  - **Tier 1 (required):** consume Stage 3 structured competitors as seed set.
  - **Tier 2 (targeted enrichment):** for each seed competitor, fill only Stage-5-relevant fields (pricing model, price band, segment, confidence, evidence source).
- Discovery should be **analysisStep-based enrichment**, not full "agentic crawl."
- Data sources:
  - Stage 3 competitor entities (primary).
  - Stage 0/MarketAssumptions context (secondary for market framing).
  - Optional LLM+search for missing pricing/position details with confidence tagging.
- Rule: if enrichment fails, preserve seed competitor and mark fields as `unknown` + confidence low (no hard fail at Stage 4).

### 3. Feature Comparison Decision

- CLI does **not** need GUI's full weighted matrix for Stage 5.
- Stage 5 mainly needs economic pressure indicators, so use a **light comparison model**:
  - `feature_parity`: `inferior | parity | superior`
  - `switching_cost_signal`: `low | medium | high`
  - `price_pressure_signal`: `low | medium | high`
- This gives enough defensibility/pricing context without reproducing GUI complexity.

### 4. Scoring Recommendation

Keep only scores that change Stage 5 assumptions:

- `pricing_pressure_index` (0-1): competition pressure on achievable ASP/margin.
- `defensibility_risk_index` (0-1): affects churn/CAC payback assumptions.
- `intel_confidence` (0-1): controls how aggressively Stage 5 uses Stage 4 inputs.

Avoid GUI-style scores unless mapped to formulas.
If you keep "Differentiation," convert it into one of the two indices above.

### 5. Stage 3 -> Stage 4 Pipeline

- Stage 4 should **ingest Stage 3 competitors as baseline truth**.
- Stage 4 adds:
  - Pricing model/bands
  - Segment relevance
  - Confidence/evidence metadata
  - Aggregate competitive pressure metrics
- Net: Stage 3 does "who exists," Stage 4 does "how they affect unit economics."

### 6. CLI Superiorities (preserve these)

- Deterministic validation-first flow in `lib/eva/stage-templates/stage-04.js` (predictable, testable).
- Simpler schema and fewer moving parts (lower failure surface than edge-function/polling stack).
- Existing kill-gate discipline around surrounding stages (Stage 3 and Stage 5) keeps decision accountability clear.
- Easier automation and CI validation in pure CLI pipeline.

### 7. Recommended Stage 4 Schema (CLI-native)

- `competitors[]`:
  - existing: `name`, `position`, `threat`, `strengths`, `weaknesses`, `swot`
  - add:
    - `website` (optional)
    - `segment` (required if known, else `unknown`)
    - `pricing_model` (`subscription | usage | one_time | freemium | enterprise | unknown`)
    - `price_band` (`low | mid | high | unknown`)
    - `evidence_sources[]` (URLs or source ids)
    - `confidence` (0-1)
- `aggregate`:
  - `pricing_pressure_index` (0-1)
  - `defensibility_risk_index` (0-1)
  - `market_concentration_signal` (`fragmented | moderate | concentrated`)
  - `intel_confidence` (0-1)
- `stage5_handoff`:
  - normalized assumptions payload (price pressure, defensibility risk, confidence weights)

### 8. Minimum Viable Change (priority-ranked)

1. **P0 - Add Stage 4 derived outputs**
   - Modify: `lib/eva/stage-templates/stage-04.js`
   - Add `computeDerived()` logic for `pricing_pressure_index`, `defensibility_risk_index`, `intel_confidence`.

2. **P0 - Enforce Stage 3 input contract consumption**
   - Modify: `lib/eva/eva-orchestrator.js`
   - Ensure Stage 4 receives and maps Stage 3 competitor entities before validation/enrichment.

3. **P0 - Add Stage 5 handoff payload**
   - Modify: `lib/eva/stage-templates/stage-04.js`
   - Emit `stage5_handoff` object with normalized assumptions.

4. **P1 - Extend Stage 4 schema fields**
   - Modify: `lib/eva/stage-templates/stage-04.js`
   - Add `pricing_model`, `price_band`, `segment`, `confidence`, `evidence_sources`.

5. **P1 - Add edge-case rules**
   - Modify: `lib/eva/stage-templates/stage-04.js`
   - Explicit handling for 0 competitors (Blue Ocean) and low-confidence partial intel.

6. **P2 - Optional lightweight enrichment step**
   - Create (optional): `lib/eva/analysis-steps/stage-04-enrichment.js`
   - Keep this optional/failable; never block Stage 4 completion.

### 9. Cross-Stage Impact

- Stage 5 kill gate quality improves because ROI/break-even assumptions are grounded in competitive pressure, not generic defaults.
- False optimism risk drops (especially around ASP and CAC payback).
- Pipeline remains CLI-native and deterministic while adding only high-value intelligence.
- You avoid GUI complexity debt (polling, fallback synthetic generation, tabbed UX logic) that does not materially improve kill-gate correctness.
