# Brainstorm: Close the Experiment Feedback Loop

## Metadata
- **Date**: 2026-03-11
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ListingLens AI, MindStack AI (all ventures flow through Stage 0)
- **Related Past Brainstorms**: Stage Zero Experimentation Framework (2026-03-10), Unified Strategic Intelligence Pipeline (2026-03-10)

---

## Problem Statement

The Stage Zero Experimentation Framework was built out of order: Phase 3 (experiment engine — dual evaluator, Bayesian analyzer, chairman report, prompt promotion) was implemented, but Phase 1 (the feedback loop from kill gates back to experiments) was skipped. The result: experiments measure "which prompt produces better Stage 0 synthesis scores" instead of "which prompt produces ventures that survive downstream kill gates." The experiment engine is a closed loop measuring LLM opinions about LLM outputs — circular and ungrounded.

Additionally, two disconnected gate tracking systems exist:
1. `evaluation_profile_outcomes` — written to by `recordGateSignal()`, but nothing reads it
2. `eva_stage_gate_results` — has enforcement triggers but zero code writes to it (orphaned, 0 rows)

Kill gates execute on real ventures at Stages 3, 5, and 13, but outcomes are orphaned — no downstream system consumes them for learning or enforcement.

## Discovery Summary

### Constraints
- Must be fully automated (zero manual intervention for the entire loop)
- Must preserve existing experiment infrastructure (extend, not replace)
- Pipeline throughput is NOT limited to 10-20 ventures/month — if the system is fully automated, Stage 0 through kill gates can process ventures programmatically at much higher volume (dozens/day), eliminating the statistical power bottleneck
- Kill gates at Stages 3, 5, and 13 are measurement points. Stage 23 excluded (too far downstream, signal decay)

### Current State
- **Experiment engine (built)**: experiments, experiment_assignments, experiment_outcomes tables; dual-evaluator, Bayesian analyzer, chairman-report, prompt-promotion, proxy-metric-engine modules
- **Gate signal service (built, partially wired)**: `recordGateSignal()` in `gate-signal-service.js` IS called from `stage-gates.js` at kill gate execution, writes to `evaluation_profile_outcomes` (fire-and-forget with `.catch()`)
- **Orphaned table**: `eva_stage_gate_results` has a BEFORE INSERT trigger (`enforce_kill_gate_threshold`) that validates kill gates must score >= 70 to pass, but nothing writes to it
- **Stage transitions ignore gate outcomes**: Ventures advance regardless of gate pass/fail when auto_proceed=true
- **Existing unused tools**: `counterfactual-engine.js` (batch re-scoring), `stage-of-death-predictor.js` (`calibratePredictions()`), `sensitivity-analysis.js` (OAT perturbation)

### Key Reframe: Automated Throughput Eliminates the Volume Problem
The original brainstorm and team analysis assumed 5-20 ventures/month (human-initiated creation rate). But the system is designed for full automation — Stage 0 entry paths can run programmatically, and downstream stages are EVA-orchestrated. Real-world pipeline processing time is ~10 minutes per venture through all stages (Stage 0 → kill gates). This means:
- **6 ventures/hour** = 144/day (24/7) or 48/day (8hr)
- **~1,400-4,300 ventures/month** achievable with batch processing
- Thompson Sampling converges in **days**, not months — a single experiment can complete in 1-2 days
- Multiple experiment iterations per week are feasible
- The constraint shifts from "human velocity" to "compute cost" (LLM calls per stage), which is covered by the Claude Max plan

### Research: Auto-Iteration Approach
Web research identified the recommended architecture as a 4-layer system:

**Layer 1 — Thompson Sampling Bandit** for traffic allocation between champion and challenger prompts. Beta posterior updates with every observation. Decision threshold: P(champion > challenger) > 0.85 after minimum 8 observations.

**Layer 2 — LLM Meta-Optimizer** for generating next challenger prompt. Analyzes winning/losing prompts + scored examples + score distributions, selects perturbation operators (rephrase, add constraint, remove section, reorder, specificity shift, decompose), generates challenger + falsifiable hypothesis.

**Layer 3 — Informative Priors** carried between experiments. Winner's posterior becomes next experiment's champion prior. Challenger starts with weakly informative Beta(2,2).

**Layer 4 — Safety Rails**: drift detection, diversity enforcement (must differ from last 3 failed challengers), diminishing returns detection (3 consecutive failures → switch perturbation strategy), prompt length budget.

Key references: PromptBreeder (DeepMind 2023), EvoPrompt (2023), TextGrad (Nature 2025), DSPy MIPROv2, Netflix sequential A/B testing.

## Analysis

### Arguments For
1. **Zero downside as observation** — even before statistical conclusions, seeing "ventures scored X at Stage 0 survived/died at Stage 3" is valuable intelligence that doesn't exist today
2. **Infrastructure already exists** — gate-signal-service.js, experiment tables, Bayesian analyzer, chairman report all built. This is wiring + extension, not greenfield
3. **Automated throughput solves the volume problem** — programmatic venture creation through the full pipeline can produce 100+ data points/month, making statistical convergence fast
4. **LLM Meta-Optimizer is institutional learning** — the system literally learns "what makes a good venture hypothesis" from empirical outcomes, encoding EHG's investment thesis as a living, tested prompt population
5. **Every month of delay is data you'll never get back** — the sooner the loop starts accumulating, the sooner conclusions emerge

### Arguments Against
1. **Signal decay between stages** — 12 stages of transformation between Stage 0 and Stage 13 may overwhelm any Stage 0 prompt effect. Even Stage 0 → Stage 3 has independent scoring
2. **Chairman override confounding** — a single human judge who overrides gate decisions introduces noise that can't be controlled for without blinding or high volume
3. **False confidence risk** — automated promotion based on statistically weak results could degrade scoring quality. The system must have safeguards against promoting noise as signal
4. **Schema migration complexity** — `experiment_outcomes` stores synthesis scores, not binary kill gate pass/fail. Retrofitting requires changing outcome schema, Bayesian analyzer success definition, and reporting layer

## Architecture Tradeoff Matrix

| Dimension | Weight | (A) Observation Bridge | (B) Full Feedback Loop | (C) Full Loop + Auto-Iteration |
|-----------|--------|:-:|:-:|:-:|
| Complexity | 20% | 9 | 6 | 4 |
| Maintainability | 25% | 8 | 7 | 5 |
| Performance (value) | 20% | 4 | 7 | 9 |
| Migration effort | 15% | 9 | 6 | 4 |
| Future flexibility | 20% | 5 | 8 | 9 |
| **Weighted Total** | | **7.00** | **6.85** | **6.35** |

**Critical Weakness Flags:**
- Option A: Performance value = 4 (observation without action has limited ROI long-term)
- Option C: Complexity = 4, Migration effort = 4 (two critical weaknesses)

**Recommendation**: Option B (Full Feedback Loop) is the sweet spot — but designed so Option C (auto-iteration) can be layered on later without rework. Option A (observation only) is the Phase 1 deliverable within Option B.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Two-table problem is a symptom of undefined data ownership — must pick ONE canonical gate source before wiring anything. (2) Experiment engine currently measures itself via proxy scores, not real outcomes — schema migration is deeper than "just wiring." (3) Chairman override creates unmeasurable confounding at low volume.
- **Assumptions at Risk**: (1) Stage 0 prompt changes have a detectable causal effect at Stage 13 — likely wrong due to 12 stages of confounding. (2) Thompson Sampling can converge at low volume — minSamples: 20 is aggressively low. (3) Informative priors between experiments assume successive prompts are similar — LLM-generated novel variants may invalidate prior beliefs.
- **Worst Case**: System produces false confidence — promotes inferior prompts based on statistical artifacts from small samples with confounding. Secondary: opportunity cost vs. simply running `calibratePredictions()` on existing data.

### Visionary
- **Opportunities**: (1) Self-calibrating venture scoring oracle — transforms Stage 0 from "LLM opinion" to "calibrated predictor." (2) Composable gate-signal bus — unified event source for future systems (portfolio optimization, resource allocation, coaching triggers). (3) LLM Meta-Optimizer as institutional learning engine — encodes EHG's investment thesis as an evolving, empirically-tested prompt population.
- **Synergies**: Unified Strategic Intelligence Pipeline (needs calibrated foundation), EVA Intake Redesign (surface survival patterns during intake), Chairman Reports (shift from "scored higher" to "survived longer"), Counterfactual Engine (validate predictions against real outcomes).
- **Upside Scenario**: Within 12-18 months, 3-5 prompt strategies producing 40%+ Stage 5 survival rates. Stage 0 score becomes calibrated probability. The venture factory gets smarter with every bet.

### Pragmatist
- **Feasibility**: 6/10 (moderate — achievable but hidden integration complexity)
- **Resource Requirements**: 8-12 files modified, 1-2 new modules (adapter bridge + venture lifecycle tracker), 1 database migration extending experiment_outcomes
- **Constraints**: (1) Volume is binding limit for statistical confidence — mitigated by automated throughput. (2) eva_stage_gate_results is orphaned — decide: adopt it or ignore it. (3) Stage transitions ignore gate outcomes — feedback loop must be passive observer initially, not inline enforcer.
- **Recommended Path**: Phase 1 (2-3 days) — observation bridge wiring gate data into experiment_outcomes. Phase 2 (3-5 days) — statistical integration with Thompson Sampling. Phase 3 (separate SD) — enforcement and auto-iteration.

### Synthesis
- **Consensus Points**: Pick one canonical gate table. Low volume is the binding constraint (mitigated by automation). Start with observation before optimization. Schema migration is unavoidable.
- **Tension Points**: Challenger says causal attribution impossible at Stage 13 — Visionary says start accumulating data now. Challenger says spreadsheet + quarterly review beats automation for years — countered by automated throughput argument. Pragmatist says observe first — Visionary wants the full loop.
- **Composite Risk**: Medium-High (mitigated by phased approach and automated throughput)

## Out of Scope
- Stage 23 kill gate (excluded — too far downstream, signal decay)
- Gate enforcement (blocking ventures from advancing) — separate SD
- Multi-model LLM comparison (use existing Claude setup)
- Scoring changes to Stages 1-25 (kill gates are measurement points, not experiment targets)
- Chairman decision automation (experiments inform decisions, not replace them)
- Analytics dashboard (Phase 5, future)

## Key Telemetry to Capture
1. Stage 0 composite score + per-component breakdown (all 14 synthesis components)
2. Evaluation profile used (which weight set)
3. Prompt version (which variant was active)
4. Kill gate outcomes at Stages 3, 5, 13 (raw score + pass/fail + Chairman override flag)
5. Time-to-gate (latency from Stage 0 to each kill gate)
6. Venture archetype (from archetype-profile-matrix classification)
7. Chairman override events (when and why)
8. Score stability (multiple evaluations of same input for intra-prompt variance measurement)

## Open Questions
1. Should we adopt `eva_stage_gate_results` as the canonical gate table (it has enforcement triggers) or stick with `evaluation_profile_outcomes` (it has actual data flow)?
2. Can `calibratePredictions()` run on existing `evaluation_profile_outcomes` data to establish baseline accuracy before building the full loop?
3. What is the realistic automated pipeline throughput (ventures/day) given LLM call costs and stage processing time?
4. Should the feedback loop use a composite survival metric (survived 2 of 3 gates) or per-gate binary signals?
5. How to handle Chairman overrides — separate tracking dimension? Exclude from experiment analysis? Both?

## Suggested Next Steps
1. **Create SD** — Implement the full feedback loop as a phased SD (observation bridge → statistical integration → auto-iteration)
2. **Run `calibratePredictions()`** on existing `evaluation_profile_outcomes` data to establish baseline predictive accuracy
3. **Resolve the two-table problem** — decide canonical gate data source as part of the SD's Phase 1
4. **Design automated throughput** — determine how to programmatically generate ventures through the full pipeline for experimentation
