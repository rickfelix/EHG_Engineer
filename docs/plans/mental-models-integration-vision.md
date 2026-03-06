# Vision: Mental Models Repository — Automated Integration Across the 25-Stage Venture Workflow

## Executive Summary

The Mental Models Repository is a fully automated system that embeds structured decision-making frameworks into every stage of the EHG 25-Stage Venture Workflow. Today, Stage 0's analytical quality varies wildly by entry path — Competitor Teardown applies First Principles Thinking via a hardcoded prompt, Discovery Mode applies nothing, and Blueprint Browse has no LLM calls at all. Beyond Stage 0, the remaining 25 stages and Operations have zero structured decision frameworks.

This vision introduces a 3-layer integration architecture that injects relevant mental models at three levels: (1) inside existing LLM prompts during venture conception (Layer 1), (2) as a new synthesis component that runs parallel evaluations (Layer 2), and (3) through stage progression hooks that carry analytical context forward through the entire lifecycle (Layer 3). The system starts with 43 cataloged models spanning decision/reasoning, market/strategy, psychology/behavior, and growth/resilience categories, and self-improves by correlating model application with venture outcomes at kill gates.

The entire integration requires zero new UI elements, zero new screens, and zero modifications to the Stage 0 orchestrator's control flow. It follows established patterns already proven in the codebase — context block injection, `deps.synthesize` wrapper, and `onBeforeAnalysis` hooks — ensuring Stage 0's existing behavior is preserved while enriching every venture with structured analytical rigor.

## Problem Statement

The EHG 25-Stage Venture Workflow makes hundreds of decisions per venture, from initial opportunity identification through launch and ongoing operations. These decisions currently rely on implicit mental models that are:

1. **Hardcoded into specific prompts** — Stage 0's `deconstructToFirstPrinciples` applies First Principles Thinking as a baked-in prompt string, invisible to operators and untracked for effectiveness.
2. **Inconsistently applied across paths** — Competitor Teardown applies first-principles deconstruction; Discovery Mode does not; Blueprint Browse applies nothing. Path choice determines analytical quality.
3. **Not tracked for effectiveness** — When a venture succeeds at Stage 3's Kill Gate or fails at Stage 5's Profitability Kill Gate, there is no linkage to which analytical frameworks were used during conception.
4. **Missing from critical downstream stages** — Branding (Stages 10-12), marketing material planning (Stages 13-16), and post-launch operations have no structured decision frameworks at all.

The core user — Rick, as the primary EHG operator and Chairman — needs ventures to be analyzed through consistent, evolving frameworks that compound institutional learning over time. The system must be fully automated (no manual model selection), work within the current application design (no new UI), and integrate without regressing Stage 0's existing behavior.

## Personas

### Rick (EHG Chairman / Primary Operator)
- **Goals**: Evaluate more ventures with higher analytical rigor; build institutional knowledge about what frameworks drive success; scale from managing 3-4 concurrent ventures to 8-10.
- **Mindset**: Strategic, systems-oriented, efficiency-focused. Wants the AI to bring structured thinking, not just raw analysis. Values automation that compounds.
- **Key Activities**: Initiates Stage 0 explorations, reviews venture briefs, makes kill gate decisions, manages portfolio operations. Interacts with the system through existing "Explore Opportunities" flows — Competitor Teardown, Discovery Mode, Blueprint Browse.

### The AI System (Stage 0 + Stage Templates)
- **Goals**: Produce higher-quality venture analyses by applying relevant mental models automatically; learn which models correlate with venture success; suggest increasingly effective model combinations over time.
- **Mindset**: Deterministic selection (archetype + path + effectiveness score), non-deterministic execution (LLM-based exercises). Fail-safe: never block existing pipeline.
- **Key Activities**: Injects model context into LLM prompts (Layer 1), runs model exercises in synthesis (Layer 2), provides stage-appropriate model context via hooks (Layer 3), logs applications for effectiveness tracking.

### Future Operators / Venture Managers
- **Goals**: Benefit from accumulated model effectiveness data without needing to understand the underlying frameworks. The system suggests what works.
- **Mindset**: Results-oriented, may not have deep knowledge of decision science frameworks.
- **Key Activities**: Launch ventures through Stage 0, progress through stages, review model-grounded insights in venture briefs and stage outputs.

## Information Architecture

### Views and Routes (No New UI Required)

The mental models system is **invisible to the frontend** — it operates entirely within existing backend flows:

| Existing View | Mental Models Integration |
|---------------|--------------------------|
| Explore Opportunities → Competitor Teardown | Layer 1: Model context injected into LLM prompts for `analyzeCompetitor()`, `deconstructToFirstPrinciples()`, `runGapAnalysis()` |
| Explore Opportunities → Find Me Opportunities | Layer 1: Model context injected into Discovery Mode strategy LLM prompts (all 4 strategies) |
| Explore Opportunities → Blueprint Browse | Layer 2 only: Models applied during synthesis (no LLM calls in path) |
| Venture Brief (post-Stage 0) | Layer 2: `metadata.synthesis.advisory.mental_model_analysis` contains model exercise results |
| Stage 1-25 Analysis Outputs | Layer 3: `onBeforeAnalysis` hooks inject stage-appropriate model context |
| Operations Dashboard (future) | Layer 3: Portfolio-level model effectiveness analytics |

### Data Sources

| Source | Purpose |
|--------|---------|
| `mental_models` table | Model definitions, exercise templates, prompt context blocks |
| `mental_model_applications` table | Track which models applied to which ventures at which stages |
| `mental_model_effectiveness` table | Aggregate effectiveness scores correlated with outcomes |
| `model_archetype_affinity` table | Which models work best for which venture archetypes |
| `venture_briefs` (existing) | Venture metadata enriched with model application records |
| `chairman_decisions` (existing) | Kill gate outcomes for effectiveness correlation |

### Navigation Structure

No navigation changes. Mental models are accessed through:
1. **Implicit**: Richer venture briefs (model-grounded analysis in advisory section)
2. **Explicit (future)**: Operations dashboard with model effectiveness analytics
3. **API (future)**: `getMentalModelContextBlock()` callable from any stage template

## Key Decision Points

These are the critical junctions where mental models add the most value:

1. **Stage 0 — Venture Conception**: Which analytical frameworks shape how the AI evaluates an opportunity? (Layer 1 injection)
2. **Stage 0 — Synthesis Evaluation**: After path analysis, what additional structured exercises reveal blind spots? (Layer 2 Component 14)
3. **Stage 3 — Kill Gate**: Did the models applied during conception correlate with survival? (Effectiveness tracking)
4. **Stage 5 — Profitability Kill Gate**: Stronger signal — revenue viability linked to model applications (Effectiveness tracking)
5. **Stages 10-12 — Brand Identity**: Are branding decisions grounded in positioning frameworks (Law of Contrast, Reflexivity) or ad hoc? (Layer 3 hooks)
6. **Stages 13-16 — Marketing Material**: Are channel selections backed by Pareto analysis? Are creative briefs JTBD-framed? (Layer 3 hooks)
7. **Operations — Portfolio Review**: Which models drive success across the portfolio? Which should be retired? (Cross-venture analytics)

## Integration Patterns

### Pattern 1: Context Block Injection (Layer 1)
- **Existing example**: `strategicContext.formattedPromptBlock` and `getCapabilityContextBlock()` in Discovery Mode
- **Mental models follow**: `getMentalModelContextBlock(stage, path, strategy, archetype?)` returns a formatted string block
- **Files affected**: `competitor-teardown.js` (~15 lines), `discovery-mode.js` (~10 lines)

### Pattern 2: Synthesis Wrapper (Layer 2)
- **Existing example**: `deps.synthesize` injectable function in orchestrator
- **Mental models follow**: Wrap `runSynthesis()` to add Component 14 (advisory namespace)
- **Files affected**: New `synthesis/mental-model-analysis.js`, wrapper in dependency injection
- **Orchestrator changes**: Zero — wrapper pattern

### Pattern 3: Stage Hook (Layer 3)
- **Existing example**: Stage 1's `onBeforeAnalysis` → `recommendTemplates()`
- **Mental models follow**: `onBeforeAnalysis` reads `venture.metadata` for applied models, injects stage-appropriate context
- **Files affected**: ~10 lines per stage template

### Pattern 4: Event-Driven Tracking
- **Existing example**: `venture.created` event in post-persist flow
- **Mental models follow**: Handler writes model-attribution records; kill gate outcomes update effectiveness
- **Files affected**: New event handler registration

### Pattern 5: Supabase Tables + RLS
- **Existing example**: All EHG data tables follow UUID PK + `created_at` pattern
- **Mental models follow**: 4 new tables with standard RLS policies
- **Files affected**: Migration file, seed data file

## Evolution Plan

### Phase 1: Stage 0 Foundation (3-4 weeks)
**Ships first.** The minimum viable integration that proves the architecture.
- DB migrations (4 tables) + seed 15-20 core models
- `getMentalModelContextBlock()` function
- Layer 1: Inject into Competitor Teardown (3 LLM calls) and Discovery Mode (4 strategies)
- Layer 2: Component 14 via `deps.synthesize` wrapper
- `venture.created` event handler for attribution
- Basic effectiveness logging (no scoring yet)
- **LOC**: ~800-1,000 new + ~50 modifying existing

### Phase 2: Stage Progression + Scoring (2-3 weeks)
- Layer 3: `onBeforeAnalysis` hooks for Stages 1-5 (THE TRUTH)
- Effectiveness scoring algorithm (correlate with Kill Gate outcomes at Stages 3, 5)
- Model auto-selection based on archetype affinity + effectiveness
- Expand catalog to full 43 models
- **LOC**: ~400-600

### Phase 3: Branding, Marketing, Full Lifecycle (3-4 weeks)
- Stages 6-9 (THE ENGINE) hooks
- Stages 10-12 (THE IDENTITY) — branding/design model integration with exercise templates
- Stages 13-16 (THE BUILD) — marketing material planning models
- Scored evaluations and structured artifact output types
- **LOC**: ~500-700

### Phase 4: Operations + Cross-Venture Analytics (2-3 weeks)
- Post-Stage 25 Operations framework (6 areas: portfolio management, operational optimization, venture health, strategic pivots, marketing refresh, brand evolution)
- Cross-venture model effectiveness comparison
- Model retirement/deprioritization logic
- Operations dashboard integration
- **LOC**: ~300-500

### Total: ~2,000-2,800 LOC across 10-14 weeks

## Out of Scope

- **New UI screens or buttons** — The entire system operates within existing backend flows
- **LEO Protocol integration** — Mental models apply to ventures only, not to LEO's LEAD/PLAN/EXEC workflow
- **Manual model selection** — Operators do not pick models; the AI auto-selects based on context
- **ML infrastructure** — Effectiveness tracking uses correlation analysis, not trained ML models
- **Real-time model editing** — Models are seeded via migration/scripts, not a CMS
- **External API exposure** — No public API for mental model data

## UI/UX Wireframes

N/A — no new UI components. Mental models are injected into existing LLM prompts (invisible to UI) and stored in venture metadata (readable in existing venture brief views via the `advisory` section).

The only future UI addition (Phase 4) would be an Operations dashboard widget showing model effectiveness analytics, which would follow the existing Chairman dashboard component patterns.

## Success Criteria

1. **Analytical consistency**: All 3 entry paths (Competitor Teardown, Discovery Mode, Blueprint Browse) produce ventures enriched with relevant mental model analysis — measured by `mental_model_applications` records per venture (target: ≥3 models applied per venture).

2. **Zero regression**: Stage 0 P95 latency increases by <500ms after Layer 1 + Layer 2 integration. Existing 13 synthesis components produce identical output with or without Component 14.

3. **Self-improvement signal**: After 10+ ventures, `mental_model_effectiveness` scores show measurable differentiation between models (variance > 0.1 in composite score) — indicating the system is learning, not just recording.

4. **Kill gate correlation**: By Phase 2, ventures that pass Stage 3's Kill Gate have statistically higher model effectiveness scores than those that fail (measured by `stage_progression_correlation`).

5. **Lifecycle coverage**: By Phase 3, mental models are applied at Stages 0, 1-5, 6-9, 10-12, and 13-16 — covering THE TRUTH, THE ENGINE, THE IDENTITY, and THE BUILD.

6. **Operator value**: Operator ratings (1-5 scale on `mental_model_applications.operator_rating`) average ≥3.5 across the first 20 ventures, indicating the models add perceived value.

7. **Branding coherence**: Ventures that reach Stage 12 with mental model integration produce brand guidelines that reference model-grounded rationale (measurable by `artifact_data` presence in Stages 10-12 applications).

8. **Marketing effectiveness**: Stages 13-16 produce channel priority matrices and marketing asset specs with model-backed constraints (measurable by `artifact_data` presence and structure).

9. **Operations readiness**: By Phase 4, portfolio review process uses model-based rubrics with cross-venture effectiveness data.

10. **Content quality**: Exercise templates authored for seed models (first 15-20) are reviewed and rated ≥4/5 by the operator before deployment.
