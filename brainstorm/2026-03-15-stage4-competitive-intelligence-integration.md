# Brainstorm: Stage 4 Competitive Intelligence Integration

## Metadata
- **Date**: 2026-03-15
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Needs Triage
- **Team Analysis**: Skipped (discovery phase — not enough crystallization for team analysis yet)
- **Related Ventures**: All active ventures
- **Part of**: Venture Stage Integration Master Plan (Area 1 of 8)

---

## Problem Statement

Stage 4 (Competitive Intelligence) produces competitor data as flat advisory_data JSONB in venture_stage_work, but purpose-built tables (`competitors`, `intelligence_analysis`) exist with proper schema, indexes, and RLS. Neither table has ever been used (0 rows each). The stage also fails to create venture_artifacts rows, breaking the artifact pipeline.

## Discovery Summary

### What exists today

**`competitors` table** (well-structured):
- Columns: id, venture_id, name, website, description, strengths[], weaknesses[], analysis_data JSONB, source_url, analyzed_at
- 4 indexes, proper RLS (venture-scoped), updated_at trigger
- **0 rows** — never used

**`intelligence_analysis` table** (generic):
- Columns: id, venture_id, agent_type, status, results JSONB, error_message, completed_at
- Minimal indexes, overly permissive RLS (UPDATE/DELETE allow any authenticated user)
- Missing updated_at trigger, no status CHECK constraint
- **0 rows** — never used

**Stage 4 current output** (from ListingLens deep assessment):
- 3 competitors with threat levels (HIGH/MEDIUM), pricing, SWOT analysis
- Stored only in advisory_data JSONB — no venture_artifacts row, no competitors table rows
- Stage5 handoff data includes pricing range and competitive density

### Security gaps found
- `intelligence_analysis` UPDATE policy: `true` (any user can update any row)
- `intelligence_analysis` DELETE policy: `true` (any user can delete any row)
- Both should be scoped to venture ownership like the `competitors` table

## Chairman Direction

**Open to full architecture rewrite** — not just wiring existing tables in, but redesigning the competitive intelligence data architecture from scratch if needed. This should be explored in a dedicated brainstorm with proper depth.

## Analysis

### Arguments For structured table integration
- Cross-venture competitor querying (impossible with flat JSONB)
- Schema enforcement (typed fields vs unstructured JSON)
- Tables are production-ready (schema, indexes, RLS all in place)

### Arguments Against
- `intelligence_analysis` is too generic — may not be worth keeping
- Dual-write complexity if both competitors + venture_artifacts need data
- 0 rows means the schema is untested in production

### Options identified (not yet decided)
1. **Structured tables as primary** — stage 4 writes to `competitors`, view/trigger populates venture_artifacts
2. **venture_artifacts as primary** — trigger syncs to `competitors` for cross-venture queries
3. **Full rewrite** — redesign the competitive intelligence architecture (chairman's preference direction)

## Open Questions
- Should `intelligence_analysis` be kept, repurposed, or dropped?
- What cross-venture queries do we actually need for competitive intelligence?
- Should competitor data be shared across ventures (same competitor referenced by multiple ventures)?
- How does competitive intelligence evolve during operations mode (post-25)?

## Suggested Next Steps
- **Continue this brainstorm in a fresh session** with the architecture decision phase
- The brainstorm command: `/brainstorm Stage 4 Competitive Intelligence architecture redesign — full rewrite option, cross-venture competitor sharing, intelligence_analysis table fate --domain architecture --structured`
- After architecture is decided: vision doc → arch plan → SD
