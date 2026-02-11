# Stage 10 "Naming / Brand" -- OpenAI Response

> Independent response to the Stage 10 triangulation prompt.
> Respondent: OpenAI (GPT 5.3)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| AI-generated brand + naming | Narrative + naming generation support | Manual user entry only | **5 Critical** | Stage 11 GTM quality depends on consistent name/voice inputs | **Close** | Could users prefer manual creative control? Keep manual override |
| Brand genome richness | Vision/mission/voice/messages/cultural style | 5-key genome only | **4 High** | Weak messaging handoff to Stage 11 | **Partially close** | Avoid turning Stage 10 into full brand strategy workshop |
| Candidate metadata depth | Pros/cons, status flags, confidence | Name, rationale, weighted criterion scores | **4 High** | Harder to compare strategic fit and risk | **Close minimally** | Too much metadata can become noisy without real checks |
| Domain availability status | Included in GUI | Not present | **3 Medium** | GTM naming risk discovered late | **Defer checks, add risk flag** | Live lookup in CLI may be brittle and region-specific |
| Trademark status | Included in GUI | Not present | **4 High** | Legal rework risk before launch/sales | **Defer checks, add legal-risk placeholder** | Early statuses are often unreliable without legal workflow |
| Visual identity presets | Cultural design styles + palette hints | None | **2 Low** | Helpful for messaging cohesion, not pipeline-critical | **Add lightweight "visual direction" only** | Full style system belongs later |
| Decision output (ADVANCE/REVISE/REJECT) | Included | Rank only | **4 High** | Stage 11 may consume weak naming set | **Add soft decision signal** | Hard gate may over-constrain creative iteration |
| Criteria defaults | Predefined dimensions | Fully flexible weights | **3 Medium** | Inconsistent scoring quality between ventures | **Keep flexible + add defaults template** | Default criteria can bias nonstandard ventures |

### 2. AnalysisStep Design (inputs, prior-stage mapping, outputs)

**Inputs**:
- Stage 1: problem statement, assumptions
- Stage 3: validated market signals + metric outcomes
- Stage 4: competitor/pricing intensity
- Stage 5: unit economics posture (premium/value implications)
- Stage 7: pricing model + value metric language
- Stage 8: BMC value props, customer segments, channels
- Stage 9: exit path + buyer-type orientation + Reality Gate context
- Optional user constraints: forbidden words, preferred style, language, length, acronym tolerance

**Mapping logic**:
- Audience + segment + buyer type → tone/lexicon
- Value props + differentiators → naming semantic fields
- Pricing posture + competitive intensity → naming boldness/conservatism
- Exit path (acquisition vs IPO) → enterprise-trust vs broad-market memorability bias

**Outputs**:
- Expanded brand genome (core + narrative)
- 12-20 generated name candidates (clustered by strategy)
- Scored shortlist (top 5-8) with weighted score + risk notes
- Recommendation: `ADVANCE` / `REVISE`
- Handoff artifact for Stage 11 messaging seed pack

### 3. Brand Genome Structure Decision

Keep current 5 keys as **core**, add a **narrative extension**:

- `core`: archetype, values, tone, audience, differentiators
- `narrative`: vision, mission, brand_voice, key_messages[], market_position
- `directional`: optional visual_direction (not full design system)

Reason: gives Stage 11 enough messaging fuel without overloading Stage 10 with design production.

### 4. Name Candidate Generation Design

**Count**: Generate 12-20, require final shortlisted 5-8.

**Generation criteria**:
- Segment fit
- Value-prop clarity
- Distinctiveness vs competitors
- Pronounceability and memorability
- Scalability across geographies/categories
- Exit-path alignment

**Metadata per candidate**:
- `name`
- `strategy_cluster` (descriptive, evocative, compound, coined, acronym, etc.)
- `rationale`
- `semantic_tags[]`
- `risks[]` (confusion risk, narrowness risk, legal-risk-unknown)
- `scores{criterion}`
- `weighted_score`

### 5. Domain & Trademark: Include or Defer?

- **Defer real checks** to later validation/legal ops.
- In Stage 10, include:
  - `domain_check_status: "not_checked"`
  - `trademark_check_status: "not_checked"`
  - `legal_risk_note` (heuristic warning only)

This preserves flow while avoiding false confidence from weak early checks.

### 6. Visual Identity: Include or Defer?

- **Defer full visual identity** (colors, fonts, brand guidelines).
- Include only `visual_direction`:
  - 1 chosen style direction
  - optional palette mood words (not production palette)

Enough for GTM tone continuity; full system belongs in blueprint/build phases.

### 7. Scoring Criteria Design

Use a hybrid:
- Keep fully flexible user-defined criteria/weights (current CLI strength)
- Provide default starter rubric users can accept/edit:
  - audience_fit (20)
  - differentiation (20)
  - memorability (15)
  - clarity_of_value_signal (15)
  - scalability (15)
  - exit_alignment (15)
- Still enforce weights sum to 100.

### 8. Stage 9 → 10 Consumption Mapping

- `exit_type` and `buyer_types` from Stage 9 should explicitly influence naming strategy:
  - Enterprise-acquisition bias → trust, clarity, category legibility
  - IPO/consumer expansion bias → memorability, broad emotional resonance
- Valuation narrative informs ambition posture (category-defining vs niche utility)
- Reality Gate context should temper over-aspirational branding claims

### 9. CLI Superiorities (Preserve These)

- Strict weighted scoring math
- Criterion flexibility instead of hardcoded GUI rubric
- Clear stage boundary (no technical review contamination)
- Deterministic structure suited for pipeline handoffs
- Simpler CLI artifact model (easier automation/testability)

### 10. Recommended Stage 10 Schema

Additive schema direction (conceptual):
- `analysis_step`: prompt/version/inputs snapshot
- `brand_genome`:
  - `core` (existing 5)
  - `narrative` (vision/mission/voice/messages/position)
  - `visual_direction` (optional lightweight)
- `naming_pool[]` (12-20 generated)
- `shortlist[]` (5-8 ranked)
- `decision`:
  - `status`: ADVANCE | REVISE
  - `reason_codes[]`
- `checks`:
  - `domain_check_status`
  - `trademark_check_status`
  - `notes`

### 11. Minimum Viable Change (Priority-Ordered)

1. Add `analysisStep` to auto-generate brand genome + candidate pool from Stages 1-9
2. Extend genome with narrative fields (vision/mission/voice/messages/position)
3. Add candidate metadata (`strategy_cluster`, `risks`, `semantic_tags`)
4. Introduce soft `decision.status` (`ADVANCE`/`REVISE`)
5. Add deferred-check placeholders for domain/trademark
6. Add editable default scoring rubric template (while retaining full flexibility)

### 12. Cross-Stage Impact

- **Stage 11 (GTM)** gains structured messaging seed, reducing rework.
- **Stage 12 (Sales)** benefits from clearer positioning language consistency.
- Later legal/launch stages can consume deferred check statuses for explicit closure.
- No required change to technical architecture stages; separation remains clean.

### 13. Dependency Conflicts (with Stages 1-9 decisions)

No hard conflict with settled decisions, but two integration requirements:
- Stage 9 `buyer_types` must be guaranteed in Stage 10 input contract.
- Stage 8 BMC value-prop fields should be normalized enough for prompt consumption.

These are wiring/contract tasks, not conceptual reversals.

### 14. Contrarian Take

Most obvious recommendation is to expand Stage 10 heavily. Risk: over-engineering identity too early and creating "analysis theater" before market traction.

A lean alternative is: keep current 5-key genome + generated names + default scoring + soft decision only. Defer narrative richness until Stage 11, where messaging is directly operationalized.

Tradeoff: less upfront polish, but faster throughput and fewer false-precision artifacts.
