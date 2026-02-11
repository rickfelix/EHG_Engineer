# Stage 1 "Draft Idea" — Claude Response

> Independent response to the Stage 1 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Downstream Impact (Stages 2-5) | Verdict |
|-----|---------|---------|--------------------------------|---------|
| Problem Statement field | Separate textarea for explicit pain point | Nothing (implicit in `description`) | Medium — Stage 3 kill gate scores `customerNeed` which benefits from explicit problem framing | CLOSE |
| Category classification | Dropdown to categorize venture | Nothing | Low — useful for portfolio analytics but not consumed by Stages 2-5 | ADAPT (derive from Stage 0 archetype) |
| Key Assumptions | Textarea, one per line | Nothing | High — Stage 3 validates market assumptions; Stage 5 kill gate needs testable hypotheses | CLOSE |
| Tags | Required tag input (≥1) | Nothing | Low — organizational metadata, not consumed by analysis stages | ELIMINATE (not needed for CLI engine) |
| Strategic Focus Areas | Multi-select from 8 themes | Nothing | Medium — informs strategic alignment scoring in later stages | ADAPT (derive from Stage 0 chairman-constraints + portfolio-evaluation) |
| Venture Archetype selection | Optional dropdown | Stage 0 `archetype-profile-matrix.js` already detects this | None — CLI already has this, just in Stage 0 not Stage 1 | ELIMINATE (already covered by Stage 0) |
| Success Criteria | Optional free-form field | Nothing | Medium — provides measurable targets for Stages 13 (Exit Design) and 23 (Growth Gate) | ADAPT (add as optional field, low priority) |
| "Enhance with AI" button | AI enrichment of idea text | Nothing in Stage 1, but Stage 0 has full synthesis pipeline | Medium — Stage 0's synthesis is more thorough than a single enrichment button | ADAPT (wire Stage 0 output rather than adding a new AI step) |
| AI Opportunities browsing | Browse pre-generated ventures | Stage 0 Discovery Mode + Blueprint Browse | None — CLI already has equivalent capability | ELIMINATE (already covered) |
| Company association | Link venture to company entity | Nothing explicit in Stage 1 schema | Medium — needed for multi-company portfolio views | CLOSE (add to ventures table linkage, not Stage 1 template) |
| Idea Completeness indicator | Visual percentage | Nothing | None — UX convenience, not analytical | ELIMINATE |
| `valueProp` field | Not present (uses Description + Problem Statement) | Explicit field (≥20 chars) | Note: this is a GUI gap. CLI's explicit valueProp is better for downstream scoring | PRESERVE (CLI is superior here) |

### 2. CLI Superiorities (preserve these)

- **Stage 0 Synthesis Pipeline** (8 modules) — Produces problem-reframing, moat-architecture, archetypes, build-cost, time-horizon, chairman-constraints, cross-reference, portfolio-evaluation. Far richer than GUI's 3-path selection.
- **Counterfactual Engine** — What-if analysis on venture parameters. No GUI equivalent.
- **Stage-of-Death Predictor** — Mortality curve prediction. No GUI equivalent.
- **Venture Nursery** — Park/reactivate ventures with feedback tracking. No GUI equivalent.
- **Portfolio Allocation** — Portfolio-level venture allocation logic. No GUI equivalent.
- **Sensitivity Analysis** — Parameter sensitivity testing. No GUI equivalent.
- **Decision Filter Engine** — Deterministic risk evaluation with chairman preferences at every stage boundary. GUI has no comparable gating.
- **Devil's Advocate** — GPT-4o adversarial review. No GUI equivalent.
- **Idempotent artifact persistence** — Dedup via idempotency keys prevents duplicate data.
- **Gate infrastructure** — Stage gates + reality gates, fail-closed by default. GUI has soft pass/fail only.

### 3. Stage 0 → Stage 1 Pipeline Recommendation

**Problem**: Stage 0 produces a `venture_brief` with `problem_statement`, `solution`, `target_market`, `archetype`, `moat_strategy`, `build_estimate`. Stage 1 only reads 3 fields (`description`, `valueProp`, `targetMarket`). Rich synthesis output is available but not consumed.

**Recommendation**:
1. Add an `analysisStep` to Stage 1's DB template (`venture_stage_templates` for lifecycle_stage=1) that loads the `venture_briefs` record and auto-maps fields into the Stage 1 schema.
2. Mapping: `venture_briefs.problem_statement` → `problemStatement`, `venture_briefs.archetype` → `archetype`, `venture_briefs.moat_strategy` → carry forward as artifact metadata, `venture_briefs.build_estimate` → carry forward for Stage 8 (Technology Blueprint).
3. This step should be **non-destructive** — if Chairman has manually provided data, it takes precedence over Stage 0 defaults.
4. The `analysisStep` produces an enriched `idea_brief` artifact that downstream stages can consume.

### 4. Recommended Field Set

For a CLI-native Stage 1 that serves downstream stages well:

| Field | Source | Required | Downstream Consumer |
|-------|--------|----------|-------------------|
| `description` | Chairman or Stage 0 | Yes (≥50 chars) | Stage 2 (AI Review context) |
| `valueProp` | Chairman or Stage 0 | Yes (≥20 chars) | Stage 2, Stage 3 (marketFit scoring) |
| `targetMarket` | Chairman or Stage 0 | Yes (≥10 chars) | Stage 3 (customerNeed), Stage 4 (competitive intel) |
| `problemStatement` | Chairman or Stage 0 | Yes (≥20 chars) | Stage 3 (customerNeed scoring) |
| `assumptions` | Chairman or Stage 0 | No (recommended) | Stage 3 (validation targets), Stage 5 (kill gate hypotheses) |
| `archetype` | Stage 0 auto-detect | No | Stage 9 (Brand Genome), Stage 11 (Strategic Naming) |
| `strategicFocusAreas` | Stage 0 chairman-constraints | No | Stage 13 (Exit Design alignment) |
| `successCriteria` | Chairman | No | Stage 23 (Growth Gate measurable targets) |

This gives 8 fields (vs GUI's 12 and current CLI's 3). The 4 new required/recommended fields all serve specific downstream stages.

### 5. Minimum Viable Change

Ranked by priority:

1. **P0: Wire Stage 0 → Stage 1 data pipeline** — Add `analysisStep` to Stage 1 DB template that loads `venture_briefs` and maps fields. This closes the critical internal gap with zero new infrastructure.

2. **P1: Add `problemStatement` field** — Extend `stage-01.js` schema. Stage 3's `customerNeed` metric directly benefits from an explicit pain point separate from the general description.

3. **P1: Add `assumptions` field** — Array of testable hypotheses. Stage 3 and Stage 5 kill gates need something to validate against.

4. **P2: Add `strategicFocusAreas` field** — Derive from Stage 0's `chairman-constraints` output. Feeds alignment scoring in later stages.

5. **P2: Add `successCriteria` field** — Optional. Provides measurable targets for Stage 23 Growth Gate.

6. **P3: Do NOT add Tags, Idea Completeness indicator, or Company association to Stage 1 template** — Tags are organizational metadata (handle at ventures table level). Completeness indicator is UX. Company is a ventures table concern, not a stage template concern.

### 6. Cross-Stage Impact

| Change | Stage 2 (AI Review) | Stage 3 (Market Validation) | Stage 4 (Competitive Intel) | Stage 5 (Kill Gate) |
|--------|---------------------|----------------------------|---------------------------|-------------------|
| Wire Stage 0 output | Richer context for AI critiques | More data for 6-metric scoring | Target market + archetype inform competitor search | More assumptions to test |
| Add problemStatement | Better problem-focused critiques | Direct input to `customerNeed` metric | Pain point informs competitive positioning | Testable hypothesis |
| Add assumptions | AI can challenge assumptions | Assumptions become validation targets | Competitive assumptions testable | Kill/continue decision informed by assumption validity |
| Add strategicFocusAreas | Context for strategic fit critique | Feeds `executionFeasibility` via alignment | Strategic positioning context | Strategic alignment assessment |

**Stage 3 kill gate specifically**: The biggest impact is wiring `problemStatement` and `assumptions` — these provide the structured data that Stage 3's 6-metric scoring currently lacks. Without explicit problem framing and testable assumptions, Stage 3 has to infer `customerNeed` and `momentum` from an unstructured description field, which is unreliable.
