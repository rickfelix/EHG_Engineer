# Brainstorm: Close the Experiment Feedback Loop

## Metadata
- **Date**: 2026-03-12
- **Domain**: Architecture
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: Synthetic ventures (Pipeline-Test, Synthetic-Vertical Specialist, Synthetic-Portfolio Connector, Synthetic-Democratizer)
- **Related Brainstorms**: "Stage Zero Experimentation Framework" (2026-03-10, sd_created), "Automated Pipeline Runner" (2026-03-11, sd_created)

---

## Problem Statement

The automated pipeline generates synthetic ventures and evaluates them through Stage 0 using 14 LLM calls (Gemini). The first live run scored 4 ventures at 90/95/91/73 (avg 87/100) — suspiciously high because the same LLM that generates the ventures also evaluates them ("grading your own homework"). Current A/B experiments only measure prompt variant effectiveness via these self-scores, not whether ventures actually survive downstream kill gates at Stages 3, 5, 13, and 23.

The experiment engine (dual evaluator, Bayesian analyzer, chairman report, prompt promotion, auto-iteration loop) already exists and works — but measures the wrong thing. We need to close the loop so experiments measure real venture survival, not self-assessment scores.

## Discovery Summary

### Pipeline Run Insights (First Live Execution)
- 4-venture batch: scores 90/95/91/73 (avg 87) — self-scoring inflation confirmed
- ~2.5 min/venture, 14 LLM calls each (Gemini), ~$0.03/venture
- Pipeline: generate → DB insert → Stage 0 synthesis (14 components) → gate signal recording
- Baseline: 48 ventures/day (4 per 30min), Burst: 144/day (12 per batch)
- 7 archetypes mapped to 3 discovery strategies

### Existing Infrastructure (Extend, Not Replace)
- `gate-signal-service.js` — exists but not wired to experiment tracking
- `counterfactual-engine.js` — counterfactual analysis for what-if scenarios
- `stage-of-death-predictor.js` with `calibratePredictions()` — predictive model ready for calibration
- `canary-router.js` — routes fraction of ventures through variant paths
- `experiments`, `experiment_assignments`, `experiment_outcomes` tables — already built
- Bayesian analyzer, chairman report generator, prompt promotion module — operational
- Auto-iteration loop (promote winner → create next experiment) — operational
- `eva_stage_gate_results` table — captures gate outcomes
- `evaluation_profiles` table — stores evaluation configurations

### Experiment Dimension Expansion
Beyond prompt A/B testing, candidates for experimentation:
1. **Evaluation criteria weights** — problem clarity vs market size vs team fit
2. **Archetype-specific scoring** — different thresholds per venture type
3. **Discovery strategy effectiveness** — trend_scanner vs democratization_finder vs capability_overhang
4. **Gate threshold calibration** — what score cutoffs maximize predictive accuracy
5. **Multi-model evaluation** — Gemini vs Claude vs GPT for synthesis (cross-grading)

### Architecture Options
- **Option A: Direct wiring** — recordGateSignal() into kill gate execution. Fast, tightly coupled.
- **Option B: Event-driven telemetry** — Kill gates emit events, collector correlates with experiments. Decoupled, more infrastructure.
- **Option C: Materialized view** — Join Stage 0 scores to gate results via SQL view. No code changes to gates.

## Analysis

### Arguments For
1. **Data collection is free and irreversible to skip** — every day without outcome recording is data permanently lost
2. **Self-scoring is a known failure mode** — 87/100 average proves the current metric is meaningless for quality differentiation
3. **Infrastructure already exists** — gate-signal-service.js, experiment tables, Bayesian analyzer just need wiring
4. **Enables archetype-specific calibration** — different venture types need different scoring, and survival data reveals which ones

### Arguments Against
1. **Temporal coupling makes experiments operationally complex** — long-lived overlapping experiments need state machine changes
2. **Causal attribution is genuinely hard** — intermediate stages add confounders that dilute Stage 0's signal
3. **Risk of "confidence laundering"** — multi-stage metrics look more rigorous but may still be circular if kill gates use similar LLMs
4. **Statistical power requires patience** — months of data before meaningful convergence on multi-dimensional experiments

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Temporal coupling between experiment assignment and kill gate outcome — experiments must stay open for weeks, not minutes
  2. Confounding variables between stages make causal attribution nearly impossible — a venture dying at Stage 5 may reflect weak business model, not bad Stage 0 prompt
  3. Schema migration complexity for existing experiment tables designed for immediate results
- **Assumptions at Risk**:
  1. Kill gate outcomes may NOT be reliable ground truth — gates are also LLM-evaluated, potentially just moving the self-grading problem downstream
  2. 48-144 ventures/day may be insufficient for multi-dimensional experiments (243 cells with 5 dimensions × 3 variants)
  3. "Extend not replace" may create adapter-layer debt faster than purpose-built infrastructure
- **Worst Case**: System produces convincing-looking but wrong insights. Bayesian analyzer converges on prompts correlated with easy archetypes. Team trusts the system because it looks rigorous. Becomes a "confidence-laundering machine" — unreliable self-scores wrapped in multi-stage statistical veneer.

### Visionary
- **Opportunities**:
  1. Self-calibrating venture quality system — feedback loop turns Stage 0 into a supervised learning loop where kill gate outcomes are labels
  2. Archetype-aware experimentation — different prompts optimized per archetype, counterfactual engine answers "would this venture survive under different scoring?"
  3. Gate threshold discovery — systematically test gate thresholds using canary-router, turning stage-of-death-predictor into a calibrated instrument
- **Synergies**: Chairman report becomes strategic intelligence brief with survival trend data; unified strategic intelligence pipeline gets cross-stage signal data; multi-model evaluation becomes model selection tool; EVA translation gates share the same score→measure→adjust pattern
- **Upside Scenario**: Within 60 days, system auto-tunes Stage 0 scoring per archetype. Prompt promotion requires zero human judgment. Testing a new thesis costs $0.03 and 12 minutes. System develops institutional self-awareness about its own blind spots (high Stage 0 score, early death → flag for human review).

### Pragmatist
- **Feasibility**: 6/10 — core wiring is straightforward, but long-lived experiment lifecycle is a meaningful architectural shift
- **Resource Requirements**: 2-3 SDs phased. SD 1: outcome collection (50-80 LOC). SD 2: long-lived experiment lifecycle + convergence criteria. SD 3: expanded dimensions. No new infrastructure, all JS/Supabase.
- **Constraints**:
  1. Sample size vs time tradeoff — need "maturity threshold" before scoring an experiment variant
  2. Attribution decay — experiment assignment must be immutable at venture creation, preserved through gate signals
  3. Concurrent long-lived experiments — auto-iteration needs guardrails to prevent dimension collision
- **Recommended Path**: Wire gate-signal-service.js kill/pass events into experiment_outcomes first (ships this week). Analyze later. "You can backfill analysis but you can't backfill data you never collected."

### Synthesis
- **Consensus Points**: Temporal gap is the core challenge; start with data collection; existing infrastructure is extensible
- **Tension Points**: Kill gates as ground truth (Visionary) vs. also LLM-graded (Challenger); sample size sufficiency; extend vs. replace
- **Composite Risk**: Medium — core wiring is low-risk/high-value, risk concentrates in analysis layer

## Open Questions
1. Are kill gates truly independent evaluators, or do they use the same LLM/prompts as Stage 0? (determines if feedback loop adds real signal)
2. What's the minimum sample size for Bayesian convergence on binary survival outcomes per experiment variant?
3. How do we handle ventures that skip stages or take non-linear paths through the lifecycle?
4. Should we A/B test the kill gates themselves (threshold variants via canary-router)?
5. What external validation (market data, human review) can we incorporate as true ground truth beyond LLM-evaluated gates?

## Suggested Next Steps
1. **SD 1 (This Week)**: Wire gate-signal-service.js outcomes into experiment_outcomes — pure data collection, no analysis changes
2. **SD 2 (Week 2-3)**: Long-lived experiment lifecycle with convergence criteria and maturity thresholds
3. **SD 3 (Week 3-4)**: Expand experiment dimensions (archetype-specific, multi-model, threshold calibration)
4. **Baseline calibration**: Establish predictive accuracy of current Stage 0 scores against historical gate outcomes (can start immediately with existing data)
5. **Cross-grading investigation**: Test whether using a different LLM for evaluation (Claude evaluating Gemini-generated ventures) reduces self-scoring bias
