# Brainstorm: Adaptive Discovery Strategy Evolution

## Metadata
- **Date**: 2026-03-13
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active discovery-origin ventures (Shortform Sage, Elysian, MindStack AI, ListingLens AI, CodeShift, LegacyAI, LexiGuard)

---

## Problem Statement
The EHG venture factory uses 4 hardcoded discovery strategies (Trend Scanner, Democratization Finder, Capability Overhang, Nursery Re-eval) to find venture opportunities. The star ratings SD (SD-LEO-FEAT-DISCOVERY-STRATEGY-PERFORMANCE-001) will reveal which strategies produce the highest-quality ventures via gate outcome data. But once you know which strategies perform best, there's no mechanism to act on that knowledge — no way to experiment with new approaches, evolve winning traits, or retire persistent underperformers. The discovery pipeline discovers ventures but doesn't discover better ways to discover.

## Discovery Summary

### Current State
- 4 strategies hardcoded in `discovery-mode.js` with `VALID_STRATEGIES` whitelist
- `discovery_strategies` table exists with `prompt_template`, `scoring_criteria`, `times_used` columns
- 7 real ventures across 3 strategies: capability_overhang leads (100% pass, 7.4 avg), trend_scanner lags (67% pass, 4.3 avg)
- Star ratings SD will display per-strategy performance from gate outcomes
- Experiment framework, calibration pipeline, and gate outcome tracking already built

### User Requirements
- Fully automated strategy experimentation — EVA analyzes patterns and generates new candidate strategies
- Cold start: 5 ventures per strategy minimum for individual ratings
- Total threshold: 20 scored ventures before strategy evolution activates
- New strategies compete against immutable baselines (original 4)

### Key Infrastructure
- `discovery_strategies` table with `prompt_template` column — the lever for dynamic strategies
- `evaluation_profile_outcomes` — gate pass/fail + scores by venture and strategy
- `tmp-fast-experiment.mjs` — experiment runner for batch venture generation
- `run-calibration.js` — calibration pipeline for scoring accuracy
- `lib/eva/stage-zero/paths/discovery-mode.js` — strategy runner (currently hardcoded)

## Analysis

### Arguments For
- **Closes the meta-learning loop**: Every venture scored simultaneously trains the discovery system — compounding returns at zero marginal cost
- **Infrastructure is 60-70% built**: Experiment framework, calibration pipeline, discovery_strategies table all exist
- **Creates defensible institutional knowledge**: Strategy genealogy tree becomes proprietary IP that compounds over time
- **Low cost**: ~$20-50/month in LLM costs for continuous experimentation; solo developer delivery

### Arguments Against
- **Goodhart's Law risk**: Optimizing for gate scores ≠ optimizing for real venture quality; no downstream market signal yet
- **Convergence monoculture**: Auto-generated strategies may cluster around current leader, killing diversity
- **Thin data creates false precision**: At n=5 per strategy, score variance from evaluator/prompt/domain noise swamps strategy-level signal

## Team Perspectives

### Challenger
- **Blind Spots**: Survivorship bias in strategy scoring (only measures ventures that made it through gates, not missed opportunities); strategy correlation leading to monoculture (auto-generated strategies become capability_overhang variants); no feedback from downstream reality (no actual market validation signal)
- **Assumptions at Risk**: 20 ventures / 5 per strategy is statistically insufficient for meaningful comparison; EVA may find correlations in scores and mistake them for causes; fully automated may be premature at this data volume
- **Worst Case**: System converges on a single archetype that scores well on rubrics but misses actual opportunity space — Goodhart's Law in an automated loop producing a well-optimized local maximum

### Visionary
- **Opportunities**: Portfolio alpha through discovery optimization (algorithmic advantage in deal flow); strategy genealogy as defensible IP (institutional learning that compounds); dynamic portfolio rebalancing via strategy performance signals (leading indicators for pipeline health)
- **Synergies**: Experiment framework provides infrastructure backbone; stage-weighted scoring feeds the system at zero marginal data cost; star ratings SD is direct upstream dependency forming closed feedback loop; unified strategic intelligence pipeline gains "discovery health" dimension
- **Upside Scenario**: After 3-4 evolution cycles (~60-80 ventures), EVA discovers a novel hybrid strategy archetype no human would have designed, producing 90%+ gate pass rates and creating an accelerating advantage gap

### Pragmatist
- **Feasibility**: 6/10 — infrastructure exists but automation loop is genuinely novel (AI-generating-AI-prompts problem)
- **Resource Requirements**: 2-3 SDs over 2-3 weeks; ~$20-50/month LLM costs; solo developer; no new infrastructure
- **Constraints**: Data accumulation timeline (~2-3 months at current discovery rate); prompt quality evaluation requires downstream signal that takes months to materialize; `discovery-mode.js` needs refactor (~200 LOC) to support dynamic strategies from `prompt_template` column
- **Recommended Path**: Phase 1 (star ratings, already planned) → Phase 2 (pattern analyzer script) → Phase 3 (refactor discovery-mode.js for dynamic strategies + generation loop). Keep original 4 strategies as immutable baselines.

### Synthesis
- **Consensus Points**: Data threshold is the real bottleneck; convergence/monoculture is the primary danger; infrastructure is largely built (60-70%)
- **Tension Points**: Automation level (Challenger wants human oversight vs Visionary wants full automation — resolved by phased graduation); Goodhart's Law vs Portfolio Alpha (resolved by acknowledging limitation, planning downstream signal integration in Phase 2)
- **Composite Risk**: Medium

## Out of Scope
- Actual market outcome integration (revenue, customer validation) — future phase
- Modifying the 4 original baseline strategies
- Multi-LLM strategy comparison (using different LLMs for different strategies)
- Cross-venture strategy optimization (per-sector strategy tuning)
- Strategy-as-a-service productization

## Open Questions
- Should strategy evolution produce entirely new prompts or recombine dimensions from existing high-performers?
- What diversity constraint prevents convergence? (e.g., minimum Hamming distance between strategy prompts)
- When should an underperforming auto-generated strategy be retired? (N trials? Confidence interval?)
- Should the system track "strategy lineage" (which parent strategies contributed to a child)?

## Suggested Next Steps
- Create vision and architecture documents
- Create SD with dependency on SD-LEO-FEAT-DISCOVERY-STRATEGY-PERFORMANCE-001 (star ratings)
- Ship in phases: pattern analyzer first, then dynamic strategy runner, then generation loop
