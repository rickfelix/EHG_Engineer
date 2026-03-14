# Brainstorm: Economic Lens as Operations Module in EHG

## Metadata
- **Date**: 2026-03-11
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives — Challenger, Visionary, Pragmatist)
- **Related Ventures**: All (platform-wide feature: ListingLens AI, MindStack AI, future ventures)
- **Prerequisite Triangulation**: Phase 1 Microeconomics & Game Theory (3-model consensus: PARTIALLY)

---

## Problem Statement

EVA's 25-stage venture pipeline evaluates ideas through competitive landscape, financial modeling, and risk assessment — but does so without formal economic structure. A 3-model triangulation (Claude, OpenAI, Gemini) confirmed 6 economic concepts are genuine analytical blind spots: Market Structure, Network Effects, Unit Economics/Marginal Analysis, Market Timing, Entry Barriers, and Scale Economics. The question is where and how to integrate these into EHG.

The original triangulation consensus recommended stage-level enrichments (modifying Stages 0, 3, 4, 5, 7, 16). The Chairman's insight was that the **operations module** is a better architectural home — opt-in, cross-cutting, and doesn't clutter the 25-stage pipeline.

## Discovery Summary

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Placement** | Both venture-level (new Economics tab) + portfolio-level (radar chart in chairman operations) | Per-venture detail + cross-venture comparison. Operations is the Chairman's analytical workspace. |
| **Trigger** | Auto-generate at Stage 5, manual refresh on-demand | Stage 5 has enough context (validation, competitive, financial). Auto-generation ensures kill gate badges always have data. Chairman can refresh anytime. |
| **Kill gate integration** | Yes — lightweight badges at kill gates linking to full analysis | Small economic risk badges (e.g., "Unit Economics: Warning") at Stage 3/5/13/23. Links to full analysis in operations. |
| **Portfolio comparison** | Radar/spider chart with overlays | 6-axis radar (Market Structure, Network Effects, Unit Economics, Timing, Barriers, Scale). Visual comparison across ventures. |
| **Caching** | Store to database with timestamp + manual "Refresh" button | Avoids redundant LLM calls. Shows "Generated: Mar 11, 2026" with refresh. Enables longitudinal tracking. |
| **IntelligenceDrawer** | Confirmed legacy — separate cleanup SD. Not a factor. | Was in venture creation wizard, not operations. ~40 files to remove in separate effort. |

### The 6 Economic Axes (from Triangulation Consensus)

| Axis | Classification Type | Source Stage Data |
|------|-------------------|-------------------|
| **Market Structure** | MONOPOLY / TIGHT_OLIGOPOLY / LOOSE_OLIGOPOLY / MONOPOLISTIC_COMPETITION / NEAR_PERFECT_COMPETITION / EMERGING | Stage 4 competitive landscape |
| **Network Effects** | DIRECT_STRONG / DIRECT_WEAK / INDIRECT_STRONG / INDIRECT_WEAK / DATA_NETWORK / LOCAL_NETWORK / NONE | Stage 0 moat score, Stage 4 |
| **Unit Economics** | STRONG / MODERATE / WEAK / NEGATIVE + cost curve: DECREASING / CONSTANT / INCREASING | Stage 5 financial model |
| **Market Timing** | TOO_EARLY / EARLY_BUT_VIABLE / RIGHT_ON_TIME / LATE_BUT_DIFFERENTIATED / TOO_LATE | Stage 3 validation, Stage 4 |
| **Entry Barriers** | Per-barrier severity (LOW / MODERATE / HIGH / PROHIBITIVE) for 8 barrier types | Stage 4 competitive, Stage 6 risk |
| **Scale Economics** | STRONG_ECONOMIES / MODERATE / LINEAR / DISECONOMIES | Stage 5 financial, Stage 16 projections |

### Key Design Principle
**Classifications, not computations.** LLMs produce structured classifications with evidence and rationale — never fabricated numeric values (no elasticity coefficients, no surplus calculations, no equilibrium points). Every axis outputs a categorical classification + confidence + rationale string.

## Analysis

### Arguments For
1. **Fills a real analytical blind spot** — 3-model triangulation unanimously confirmed market structure, network effects, and unit economics at scale are genuine gaps
2. **Operations module is the right home** — opt-in, cross-cutting, doesn't clutter the 25-stage pipeline
3. **Portfolio comparison is unique value** — no existing EHG feature lets the Chairman compare venture economic profiles side-by-side
4. **Caching creates a learning dataset** — stored analyses become the foundation for economic archetype pattern recognition over time
5. **All building blocks exist** — Recharts RadarChart, venture_artifacts table, edge function patterns, Shadcn Tabs — zero new infrastructure

### Arguments Against
1. **Radar chart normalization is non-trivial** — mixing categorical, ordinal, and quantitative axes requires a scoring rubric (maintenance burden)
2. **LLM cost per analysis** — each "Run" or auto-generation fires an LLM call; portfolio comparison of 5 ventures = 5 calls if uncached
3. **Stage 5 overlap** — financial model template already computes unit economics; Economic Lens must consume Stage 5 output, not re-derive
4. **Solo operator cognitive load** — another analytical view competes for the Chairman's attention alongside stage reviews and kill gate decisions

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Radar chart axes are incommensurable — categorical vs ordinal vs temporal can't be meaningfully overlaid without arbitrary normalization. (2) Auto-generation at Stage 5 means analysis at kill gate Stage 3 won't have data (only timing from Stage 3 validation). (3) Economic analysis may not change kill/pass decisions that health scores and EVA recommendations already drive.
- **Assumptions at Risk**: (1) "On-demand refresh is sufficient" — cached analysis goes stale by stage progression, not just time. (2) Fixed 6 axes don't fit all venture types (network effects irrelevant for consulting services).
- **Worst Case**: Abandonment through neglect — Chairman stops using it because the classifications don't change decisions. Feature accumulates stale data and becomes a permanent placeholder.

### Visionary
- **Opportunities**: (1) Portfolio-level radar transforms the operations dashboard from status board to strategic capital allocation instrument. (2) Cached economic analyses create longitudinal economic identity — EVA can reference across stages. (3) Kill gate badges shift decisions from "is this healthy enough?" to "is this economically positioned correctly?"
- **Synergies**: Stage 0 experiment engine could A/B test economic classifications. Revenue tab cross-reference ("unit economics says negative but MRR improving"). KillGateOKRDashboard gets complementary lens.
- **Upside Scenario**: After 20-30 ventures, pattern recognition emerges — economic archetype library predicts which configurations succeed. EHG becomes a portfolio intelligence system that learns.

### Pragmatist
- **Feasibility**: 4/10 (moderate — well-patterned, no novel infrastructure)
- **Resource Requirements**: ~415 LOC total. Backend: ~150 LOC (LLM template + 2 API endpoints). Frontend: ~265 LOC (hook + Economics tab + portfolio radar + operations wiring).
- **Constraints**: (1) 7-tab grid breaks on mobile — need scrollable TabsList. (2) LLM cost per analysis — cache aggressively, never batch auto-fire. (3) Stage 5 financial model overlap — must consume upstream artifacts, not re-derive.
- **Recommended Path**: Phase 1: Venture Economics tab (~300 LOC). Phase 2: Portfolio radar (~120 LOC). Phase 3: Kill gate badges (~40 LOC quick fix).

### Synthesis
- **Consensus Points**: All building blocks exist. Stage 5 overlap must be handled. Phased rollout is correct.
- **Tension Points**: Radar chart validity (Visionary sees transformation, Challenger sees misleading normalization). On-demand vs auto-generation resolved by hybrid (auto at Stage 5 + manual refresh).
- **Composite Risk**: MEDIUM — architectural risk is in normalization/scoring rubric, not in implementation feasibility.

## Out of Scope
- Formal quantitative economic computations (elasticity coefficients, surplus calculations, Nash equilibria)
- New pipeline stages — economic analysis is an overlay, not a stage
- IntelligenceDrawer integration (confirmed legacy, separate cleanup)
- Venture-type-adaptive axis selection (future enhancement — fixed 6 axes for v1)
- Stage 0 experiment engine integration (future — depends on data accumulation)

## Open Questions
1. **Radar chart scoring rubric**: How to normalize categorical classifications (MONOPOLY, OLIGOPOLY...) to numeric 1-10 scale for radar visualization? Should the LLM output both classification + numeric score, or should a deterministic mapping handle it?
2. **Stage 3 kill gate badge**: Auto-generation triggers at Stage 5, but Stage 3 is an earlier kill gate. Should a partial analysis (timing + market structure only, from Stages 3-4 data) be available at Stage 3?
3. **Venture-type adaptation**: Should "Network Effects" axis be suppressed for venture types where it's irrelevant (e.g., services, consulting)? Or always show with "NONE" classification?

## Suggested Next Steps
1. Create vision and architecture documents (Step 9.5)
2. Register in EVA for HEAL tracking
3. Create SD via LEO Protocol (LEAD → PLAN → EXEC)
4. Separate SD for IntelligenceDrawer legacy cleanup (~40 files)
