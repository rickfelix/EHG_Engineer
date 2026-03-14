# Brainstorm: Automated Pipeline Runner for Experiment-Scale Venture Generation

## Metadata
- **Date**: 2026-03-11
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (4/3 perspectives — 2 Challengers, 1 Visionary, 1 Pragmatist)
- **Related Ventures**: All active ventures (ListingLens AI, MindStack AI, Pipeline-Test)
- **Parent Brainstorm**: "Close the Experiment Feedback Loop" (2026-03-11) — Phase 3 deferred as separate SD
- **Related**: "Stage Zero Experimentation Framework" (2026-03-10)

---

## Problem Statement

The EHG experimentation framework (Phases 1+2) has built complete measurement infrastructure — gate signal bridge, Thompson Sampling, survival-mode Bayesian analysis, prompt promotion — but has no data flowing through it. The system measures nothing because there aren't enough ventures passing through kill gates to achieve statistical significance. At organic venture volume (10-20/month), Thompson Sampling would take months to converge and prompt promotion decisions would lack statistical power.

Phase 3 solves this by building an automated pipeline runner that programmatically creates synthetic ventures and runs them through the full Stage 0 → kill gate pipeline, generating 48-144 data points per day. This transforms experiment cycles from months to days.

## Discovery Summary

### Implementation Options Evaluated

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Batch scheduler (cron-driven) | Simple, predictable, easy to monitor | Fixed throughput, can't adapt to experiment needs |
| B | Event-driven (experiment demands trigger) | Generates only when experiments need data | More complex, requires demand estimation |
| C | Hybrid (scheduled baseline + on-demand burst) | Flexible, self-regulating | Most complex to build |

**Decision**: Start with Option A. The architecture should be queue-ready (publish/consume interface) so Option C is a configuration change, not a rewrite.

### Key Technical Dependencies
- `conductChairmanReview()` must support non-interactive mode (go/no-go gate)
- `is_synthetic` column needed on ventures table with query-level enforcement
- Existing infrastructure to leverage: gate-signal-service.js, counterfactual-engine.js, stage-of-death-predictor.js, canary-router.js, experiment tables, Bayesian analyzer, prompt promotion, meta-optimizer

### Downstream Systems Affected
- `ventures` table (new synthetic rows)
- Stage 0 evaluation pipeline (increased throughput)
- Gate signal service (more gate outcomes)
- Experiment assignment/analysis (more data points)
- Bayesian analyzer (faster convergence)
- Prompt promotion (more frequent decisions)

## Analysis

### Arguments For
1. **Unlocks the entire experimentation investment** — Phases 1+2 built measurement infrastructure with no data. The pipeline runner is the demand side that makes experiments statistically meaningful.
2. **Compounding moat** — 12 months of calibrated evaluation data creates a scoring oracle that competitors cannot replicate without the same execution history.
3. **Low engineering risk** — existing dependency-injected architecture, no new technologies, rollback is trivially stopping the scheduler.
4. **Composable primitives** — stage runners become reusable units for portfolio screening, acquisition evaluation, and profile stress-testing.

### Arguments Against
1. **Statistical validity is unproven** — correlated synthetic ventures may produce confident wrong answers that corrupt real prompt decisions.
2. **Isolation is harder than it looks** — every downstream query, view, and model needs synthetic-aware filtering. Missing one creates silent data contamination.
3. **Kill gates aren't truly enforced** — synthetic ventures advance regardless of gate outcome, so the "survival signal" is hypothetical, not real.
4. **Operational footprint is underestimated** — monitoring, pruning, circuit breakers, and cost caps add significant ongoing maintenance.

## Team Perspectives

### Challenger (2 agents, aligned)
- **Blind Spots**:
  - Pipeline infrastructure isn't designed for burst load (shared compute, connection pools, LLM rate limits)
  - Synthetic venture generation quality is underspecified — this is a sampling problem, not a data entry problem
  - Kill gates don't actually enforce in auto mode — measuring hypothetical outcomes, not real ones
  - Schema coupling: every migration becomes a potential breaking change for the synthetic runner
- **Assumptions at Risk**:
  - 10 min/venture throughput may be 25-40 min under real load with queue contention and LLM clustering
  - LLM-generated synthetic ventures will be correlated, violating Thompson Sampling's independence assumption
  - Operational footprint (retry logic, dead-letter queuing, data pruning, experiment boundary management) is larger than scoped
- **Worst Case**: High-throughput machine producing confident wrong answers from correlated synthetic data. Promoted prompts perform worse on real ventures. Three promotion cycles propagate bad weights before drift is detected. Trust in the entire experimentation layer is destroyed.

### Visionary
- **Opportunities**:
  - "Ventures as unit tests for your strategy" — every prompt variant, evaluation weight, kill gate threshold becomes a measurable hypothesis
  - Self-improving kill gate calibration compounds over time — Month 6 has calibrated Stage 5 curves, Month 12 has a scoring oracle
  - Composable venture factory primitives: each stage becomes a callable unit for new workflows
- **Synergies**:
  - Unified Strategic Intelligence Pipeline: statistically meaningful baseline data for management reviews
  - Experimentation Framework (Phases 1+2): provides the demand side for existing supply-side infrastructure
  - EVA Meta-Optimizer: activates the auto-iterate loop (currently has no data to iterate on)
  - Chairman Report Generator: goes from "3 organic ventures" to "847 synthetic runs this month, here's what changed"
- **Upside Scenario**: 12-month scoring oracle that can predict "73% probability of surviving to Stage 13." Human judgment becomes exception handling rather than primary decision-making. Kill gate automation becomes trustworthy. The venture factory becomes literal.

### Pragmatist
- **Feasibility**: 5/10 (moderate — engineering straightforward, data integrity is hard)
- **Resource Requirements**: 2-3 weeks (1 developer). No new services. LLM costs manageable under Max plan with daily cap.
- **Constraints**:
  - `conductChairmanReview()` interactive dependency is the go/no-go gate
  - `is_synthetic` filtering not yet enforced in existing production queries — requires systematic audit
  - Start with batch (Option A), not hybrid — event-driven adds unjustified complexity at this volume
- **Recommended Path**: Audit conductChairmanReview() first → add is_synthetic column → build SyntheticVentureFactory from archetype-profile-matrix.js → batch scheduler calling executeStageZero with { nonInteractive: true }

### Synthesis
- **Consensus Points**:
  - Engineering is feasible — existing infrastructure provides 80% of what's needed
  - Data isolation is the critical risk — is_synthetic flag is necessary but not sufficient
  - Start with Option A (batch scheduler)
  - Chairman review non-interactive mode is the go/no-go prerequisite
- **Tension Points**:
  - Synthetic representativeness: Challenger warns of correlation → confident wrong answers; Visionary says it's the only path to statistical power. Resolution: diversity strategy + correlation detection.
  - Throughput estimates: Challenger says optimistic; Pragmatist says achievable. Resolution: bottleneck analysis before committing targets.
  - Scope: Challenger says operational footprint underestimated; Pragmatist says 3 weeks for first batch. Resolution: phase the operational hardening.
- **Composite Risk**: Medium-High

## Open Questions
1. Does `conductChairmanReview()` actually support non-interactive auto-resolution? (go/no-go gate)
2. What diversity strategy prevents correlated synthetic venture generation from violating independence assumptions?
3. Which existing queries/views/materialized views touch venture data without is_synthetic filtering?
4. What is the actual per-venture pipeline latency under concurrent load (not single-venture estimate)?
5. Should synthetic ventures be partitioned into a separate table rather than flagged in the main ventures table?

## Suggested Next Steps
1. Create SD for Automated Pipeline Runner (Phase 3)
2. First task: audit `conductChairmanReview()` for interactive dependencies (go/no-go)
3. Second task: add `is_synthetic` column and audit all downstream queries
4. Third task: build SyntheticVentureFactory with archetype-based diversity strategy
5. Fourth task: batch scheduler with circuit breakers and daily cost caps
6. Future: correlation detection, Option C hybrid mode, data pruning strategy
