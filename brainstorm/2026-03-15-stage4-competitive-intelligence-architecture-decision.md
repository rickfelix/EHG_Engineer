# Brainstorm: Stage 4 Competitive Intelligence Architecture Decision

## Metadata
- **Date**: 2026-03-15
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Board of Directors (6/6 seats)
- **Related Ventures**: All active ventures
- **Part of**: Venture Stage Integration Master Plan (Area 1 of 8)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement

Stage 4 (Competitive Intelligence) produces competitor data as flat advisory_data JSONB in venture_stage_work, but a purpose-built `competitors` table exists with proper schema, indexes, and venture-scoped RLS. The table has 0 rows because nothing writes to it. Stage 4 also fails to create venture_artifacts rows, breaking the artifact pipeline. The Stage 4→5 handoff contract is undocumented.

This is a follow-up to the Explore-phase brainstorm (`brainstorm/2026-03-15-stage4-competitive-intelligence-integration.md`) which identified 3 options and mapped table schemas.

## Critical Correction from Board Deliberation

The Explore-phase agent incorrectly reported both `competitors` and `intelligence_analysis` as "phantom FK registry entries that were never migrated." The CTO and CISO independently verified that **both tables DO exist**:

- `competitors`: Created in `20251201_venture_origin_tracking.sql`. 12 columns, 4 indexes, proper venture-scoped RLS, updated_at trigger. 0 rows.
- `intelligence_analysis`: Exists with 9 columns. FK to ventures. But has overly permissive RLS (UPDATE/DELETE use USING(true)).

This simplifies the architecture — we're wiring existing tables, not creating new ones.

## Discovery Summary

### Architecture Decision: Option B (Wire `competitors`, skip `intelligence_analysis`)

Chairman selected wiring the `competitors` table as primary storage for Stage 4 output. `intelligence_analysis` is left as-is (RLS fix via separate QF). Intelligence accumulation uses existing `domain_knowledge` table.

### CTO Discovery: Table Exists, Needs Only 5 New Columns

The `competitors` table already has most of what Stage 4 produces:
- Existing: id, venture_id, name, website, description, strengths[], weaknesses[], analysis_data JSONB, source_url, analyzed_at, created_at, updated_at
- Missing: threat_level, pricing_model, market_position, swot JSONB, lifecycle_stage

Stage 4 output schema (from stage-04-competitive-landscape.js):
```
competitors[]: { name, position, threat (H/M/L), strengths[], weaknesses[],
                 swot: {strengths[], weaknesses[], opportunities[], threats[]},
                 pricingModel: enum }
stage5Handoff: { avgMarketPrice, pricingModels[], priceRange: {low, high}, competitiveDensity }
```

### Existing Infrastructure (Reusable)

| Component | LOC | Status |
|-----------|-----|--------|
| Stage 4 template + analysis step | 363 | Fully operational |
| `competitors` table | — | Deployed, 0 rows, needs 5 columns |
| `competitive_baselines` table + service | 212 | Operational (independent) |
| `domain_knowledge` table | — | Deployed, handles knowledge accumulation |
| `competitor-intelligence.js` | 406 | Website analysis engine, not wired (future) |
| `CompetitiveIntelligenceService` | 255 | Broken frontend port (leaving as-is) |
| Stage contracts (JS + YAML) | — | YAML correct, JS out of sync |

### CISO Findings

1. **competitors table**: Correct venture-scoped RLS. No changes needed.
2. **intelligence_analysis**: P1 — UPDATE/DELETE use USING(true). Fix via separate QF.
3. **domain_knowledge**: P1 — RLS policy applies to ALL roles (not just service_role). Fix via separate QF.
4. **competitors.venture_id**: Nullable — should be NOT NULL. Fix in migration.

## Analysis

### Arguments For
- Competitors table exists with good schema — just 5 new columns needed
- Stage 4 already produces structured data that maps cleanly to the table
- Cross-venture competitor queries become SQL-native
- ~89 LOC total — trivially low cost
- Zero production data = zero migration risk, cheapest possible time to wire
- Fixes undocumented Stage 4→5 contract (preventing silent drift)

### Arguments Against
- CFO: no ventures have run yet — flat JSONB works fine for first venture
- CRO: schema designed without real data validation — may need rework after first ventures
- Dual-write to competitors + venture_artifacts adds sync complexity (mitigated by designating competitors as source of truth)

## Board of Directors Deliberation

### Round 1: Board Positions

| Seat | Standing Question | Position Summary |
|------|------------------|-----------------|
| CSO | Does this move EHG forward or sideways? | **Forward.** Portfolio-level competitive intelligence is a board-level capability. Structured competitor data compounds across ventures. Use CHECK constraints (not ENUMs) for flexibility. |
| CRO | What's the blast radius if this fails? | **Low.** Zero production data = zero blast radius. Schema-reality mismatch is the main risk. Keep SWOT/pricing flexible (JSONB escape hatch). Fix undocumented contract — non-negotiable. |
| CTO | What do we already have? What's the real build cost? | **Table exists, needs 5 columns.** ALTER TABLE ~15 LOC. Stage wiring ~40 LOC. Contract fix ~8 LOC. Total ~89 LOC, 1 SD. intelligence_analysis RLS fix as separate QF. |
| CISO | What attack surface does this create? | **competitors table has CORRECT RLS.** But intelligence_analysis and domain_knowledge both have wide-open policies (USING(true)). Two P1 security findings — fix as separate QFs. Data classified CONFIDENTIAL. |
| COO | Can we actually deliver this given current load? | **Yes.** 1 SD, runs in parallel with Area 2. Don't batch — different tables, different stages. Available worker capacity exists. |
| CFO | What does this cost and what's the return? | **Approve, low priority.** 1-2 days, trivial cost. Break-even after 3+ ventures. Suggests running a venture first, but acknowledges cost is too low to justify waiting. |

### Board Consensus
1. Wire existing `competitors` table — ALTER TABLE, don't CREATE (all 6 agree)
2. Fix undocumented Stage 4→5 contract in stage-contracts.js (all 6 agree)
3. intelligence_analysis and domain_knowledge RLS fixes as separate QFs (CISO + all)
4. Use CHECK constraints for new columns, not native ENUMs (CSO, CRO)
5. competitive_baselines stays independent (all agree)

### Key Tensions
- **Timing**: CFO says run venture first vs CSO says build now (resolved: cost too low to debate)
- **Schema flexibility**: CRO wants JSONB-only vs CTO wants typed columns + JSONB escape hatch (resolved: CTO approach gives both)
- **intelligence_analysis fate**: Leave for now, fix RLS via QF (consensus)

### Expertise Gaps
- CISO: domain_knowledge RLS is pre-existing vulnerability — needs fixing regardless of this SD
- CRO: Schema designed without real data — may need rework (mitigated by CHECK constraints + analysis_data JSONB escape hatch)

## Phase 1 SD Scope (Decided)

1. **ALTER TABLE**: Add 5 columns to `competitors` (threat_level, pricing_model, market_position, swot JSONB, lifecycle_stage) + add NOT NULL to venture_id
2. **Stage 4 integration**: After analysis, upsert competitors to `competitors` table + write venture_artifacts ref
3. **Stage contract fix**: Register Stage 4→5 handoff in stage-contracts.js (~8 LOC)
4. **Backward compatible**: advisory_data JSONB continues to be written

### Key Integration Points
- Modify `analyzeStage04` in `lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js`
- Use `persistArtifact()` pattern from `lib/eva/stage-execution-engine.js`
- Application-level write (not trigger) — same pattern as Area 2

### Separate QFs (Not in SD scope)
- QF: Fix `intelligence_analysis` RLS (replace USING(true) UPDATE/DELETE with venture-scoped)
- QF: Fix `domain_knowledge` RLS (restrict to service_role, add authenticated venture-scoped read)

## Open Questions
- Should `intelligence_analysis` eventually be dropped entirely? (Defer until post-first-venture)
- Should `competitor-intelligence.js` (406 LOC website analysis) be wired as Stage 4 enrichment? (Future SD)
- What cross-venture competitor queries will be most valuable? (Discover after 3+ ventures)

## Suggested Next Steps
- Create vision document and architecture plan
- Generate 1 SD for Phase 1 scope
- Execute through LEO LEAD → PLAN → EXEC
