# Brainstorm: Discovery Strategy Performance Scoring

## Metadata
- **Date**: 2026-03-13
- **Domain**: Venture
- **Phase**: MVP
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active discovery-origin ventures (Shortform Sage, Elysian, MindStack AI, ListingLens AI, CodeShift, LegacyAI, LexiGuard)

---

## Problem Statement
The Chairman selects from 4 discovery strategies (Trend Scanner, Democratization Finder, Capability Overhang, Nursery Re-eval) when exploring venture opportunities, but has no empirical data on which strategies produce the highest-quality ventures. Strategy selection is currently intuition-based. Gate outcome tracking infrastructure now exists (evaluation_profile_outcomes with discovery_strategy, score, and pass/fail per gate), but this data is not surfaced in the UI.

## Discovery Summary

### Data Infrastructure (Just Built)
- `evaluation_profile_outcomes` records gate pass/fail + scores + discovery_strategy per venture
- `ventures.metadata.stage_zero.origin_metadata.discovery_strategy` tags each venture with its source strategy
- `ventures.metadata.stage_zero.rubric_scores` and `venture_score` now persisted at creation time
- 14 gate outcomes across 7 real ventures, 3 strategies represented

### Current Data (N=7, early signal only)
| Strategy | Ventures | Gate Outcomes | Pass Rate | Avg Score |
|----------|----------|---------------|-----------|-----------|
| capability_overhang | 2 | 4 | 100% | 7.4 |
| democratization_finder | 2 | 4 | 100% | 6.3 |
| trend_scanner | 3 | 6 | 67% | 4.3 |
| nursery_reeval | 0 | 0 | N/A | N/A |

### UI Surface
- `DiscoveryModeDialog.tsx` in ehg repo — clean 117-line component with static `strategies` array
- Uses Shadcn UI + Tailwind + Lucide icons

## Analysis

### Arguments For
- **Low cost, high leverage**: Infrastructure is built; feature is ~50 LOC across two repos
- **Evidence-based strategy selection**: Replaces gut feel with empirical data
- **Compounds over time**: Each new venture improves rating accuracy
- **Natural consumer of existing investment**: Gate tracking, experiment framework, calibration all feed this

### Arguments Against
- **Small sample size risk**: N=2-3 per strategy creates false precision; one outlier swings ratings significantly
- **Survivorship bias**: Only scored ventures contribute; strategies with high candidate-kill rates look artificially good
- **Exploration-killing risk**: Low-rated strategies may never recover if the Chairman avoids them
- **Strategy performance is confounded**: Market domain, not strategy type, may be the real driver of score differences

## Team Perspectives

### Challenger
- **Blind Spots**: Survivorship bias in scoring data; strategy performance confounded by market selection; no cost/time dimension in ratings
- **Assumptions at Risk**: 7 ventures is not enough for meaningful ratings; users will treat precise-looking stars as gospel; LLM rubric may systematically favor certain strategy types
- **Worst Case**: Strategic narrowing — team converges on highest-rated strategy (likely due to small-sample luck), kills exploration diversity, makes pipeline fragile to market shifts

### Visionary
- **Opportunities**: Data-driven strategy allocation as competitive moat; strategy-as-a-service platform play; adaptive strategy weighting / auto-pilot discovery
- **Synergies**: Leverages EVA experiment framework, gate infrastructure investment, unified strategic intelligence pipeline, and cold start resolution work
- **Upside Scenario**: 50-100 scored ventures reveal "strategy alpha" — quantified evidence of which methods work best, becoming a defensible dataset and potential SaaS product

### Pragmatist
- **Feasibility**: 3/10 difficulty — straightforward query + small UI change
- **Resource Requirements**: Half-day, single developer. Backend RPC function (~1h) + frontend UI change (~1h) + testing (30m)
- **Constraints**: Cold start display, cross-repo coordination (2 PRs), scoring formula ambiguity
- **Recommended Path**: Simple RPC function aggregating pass rate + avg score by strategy, star icons with "Not enough data" for strategies below minimum threshold

### Synthesis
- **Consensus Points**: Cold start is primary risk; infrastructure is ready; minimum data threshold required before showing stars
- **Tension Points**: Challenger's exploration-killing concern vs Visionary's auto-optimization vision — resolved by confidence indicators + minimum sample size. Pragmatist's "quick fix" framing vs Challenger's formula design concerns — resolved by shipping simple formula, iterating later.
- **Composite Risk**: Low

## Out of Scope
- Auto-pilot strategy rotation (future — requires 50+ ventures per strategy)
- Cost/time tracking per strategy execution
- Strategy-as-a-service productization
- Rubric bias correction across strategy types
- Per-sector or per-market strategy ratings

## Open Questions
- What minimum sample size before showing star ratings? (Suggested: 5 ventures)
- Should the formula weight gate pass rate vs average score vs both?
- Should stars update in real-time or be cached (materialized view)?

## Suggested Next Steps
- Create vision and architecture documents
- Create SD for implementation
- Ship backend RPC function first, then frontend UI change
