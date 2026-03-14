# Brainstorm: Stage Zero Experimentation Framework

## Metadata
- **Date**: 2026-03-10
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: ListingLens AI, MindStack AI (all ventures flow through Stage 0)
- **Related Past Brainstorms**: 25-Stage Venture Workflow Remediation Strategy (2026-03-10), EHG Venture Factory + Shared Service Platform (2026-03-09)

---

## Problem Statement

Stage 0 currently scores opportunity blueprints on acquirability, IP potential, market desirability, and separability — but operates as a "fire and forget" system. There is no feedback loop connecting Stage 0 predictions to actual venture outcomes at kill gates (Stages 3, 5, 13, 23). Scoring prompts are hardcoded and static with no mechanism for A/B testing alternative evaluation approaches. The system cannot learn from its own history.

The goal is to build a formal experimentation framework with scientific rigor (control groups, statistical significance, pre-registered hypotheses) that enables Stage 0 to self-improve by measuring its predictive accuracy against kill gate survival outcomes.

## Discovery Summary

### Constraints
- Use existing LLMs (Claude via Max plan) — model variation deferred to later
- Not budget-constrained — priority is learning quality
- Async/batch execution acceptable
- Data stored in Supabase (PostgreSQL)
- Need to study what telemetry to capture for self-improvement
- Scope includes ALL Phase 0 processes, not just Stage 0 in isolation

### Current Gaps
- **No feedback loop**: Stage 0 scores don't track to downstream kill gate outcomes
- **No prompt experimentation**: Scoring prompts are hardcoded (`SYSTEM_PROMPT` const in analysis steps), no A/B testing capability

### Scope & Success Metric
- **Scope**: Stage 0 intake scoring + all 4 kill gates (Stages 3, 5, 13, 23) as measurement points
- **Success metric**: Kill gate survival (binary pass/fail at each gate)
- **Rigor**: Formal A/B testing with control groups, p-values, pre-registered hypotheses

### Existing Infrastructure (discovered by Challenger)
- `evaluation_profiles` table with configurable weights, versioning, active/inactive toggling
- `gate-signal-service.js` records pass/fail signals at tracked boundaries
- `counterfactual-engine.js` with batch re-scoring and Kendall's tau concordance
- `stage-of-death-predictor.js` with mortality curves and `calibratePredictions()` function
- `sensitivity-analysis.js` with OAT perturbation and key driver identification
- `profile-service.js` with seeded profiles (balanced, aggressive_growth, capital_efficient)
- `canary-router.js` with deterministic bucket-based traffic splitting (reusable for experiment assignment)
- `leo_prompts` table with versioned, checksummed prompts
- `eva_stage_gate_results` table with structured pass/fail and `gate_criteria` JSONB

## Analysis

### Arguments For
1. **No feedback loop exists today** — Stage 0 scores go into a void; closing this loop reveals whether scoring works at all
2. **Existing building blocks reduce effort** — canary-router (A/B traffic splitting), leo_prompts (versioned prompts), evaluation_profile_outcomes (outcome tracking) already exist
3. **Self-calibrating scoring is transformative** — Moving from static weights to empirically-tuned weights changes Stage 0 from "opinion" to "evidence"
4. **Semantic memory layer compounds over time** — Every evaluation becomes training data, creating an EHG-specific competitive advantage

### Arguments Against
1. **Statistical power problem** — Need 30+ observations per experiment arm; at current volume, a single experiment takes months
2. **Signal decay** — Stage 0 evaluates a raw idea; by Stage 13, the venture has been transformed by 12 stages of new information
3. **Chairman override = confounding variable** — Every kill gate passes through the same human judge who can override
4. **Existing infrastructure gap may be small** — Wiring `recordGateSignal` + running `calibratePredictions()` might answer most questions without new infra

## Architecture Tradeoff Matrix

| Dimension | Weight | (A) Wire Existing | (B) Phased Telemetry-First | (C) Full Framework |
|-----------|--------|:-:|:-:|:-:|
| Complexity | 20% | 9 | 7 | 3 |
| Maintainability | 25% | 9 | 7 | 4 |
| Performance (value) | 20% | 4 | 7 | 9 |
| Migration effort | 15% | 10 | 7 | 3 |
| Future flexibility | 20% | 3 | 8 | 9 |
| **Weighted Total** | | **6.95** | **7.20** | **5.65** |

**Recommendation: Option B (Phased Telemetry-First)** — Highest weighted score. Each phase validates the next.

### Critical Weakness Flags
- Option A: Future flexibility = 3 (dead end if experimentation justified)
- Option C: Complexity (3), Maintainability (4), Migration effort (3) — three critical weaknesses at current volume

## Recommended Phased Implementation

### Phase 1: Close the Feedback Loop (Week 1-2)
- Wire `recordGateSignal` into every kill gate execution path in `stage-gates.js`
- Create `stage_zero_experiment_telemetry` materialized view joining Stage 0 scores → kill gate outcomes
- Backfill `actual_death_stage` in `stage_of_death_predictions`
- Run `calibratePredictions()` to establish baseline predictive accuracy
- **Go/No-Go**: If accuracy > 0.7, experiment value is lower. If < 0.5, strong justification for Phase 2.

### Phase 2: Prompt Versioning Infrastructure (Week 2-3)
- Migrate Stage 0 analysis step prompts from hardcoded `SYSTEM_PROMPT` consts to `leo_prompts` table lookups
- Pattern: load by name + status='active', fallback to hardcoded
- Scope: 4-5 Stage 0 analysis steps only (not all 25 stages)
- Enables hot-swappable prompts with audit trail (independently valuable)

### Phase 3: Experiment Assignment & Dual-Evaluation (Week 3-4)
- Create `experiments` and `experiment_assignments` tables
- Adapt canary-router's bucket-hashing for venture-to-variant assignment
- Dual-evaluation: run both prompt variants for each venture, store both scores
- Use assigned variant's score for progression
- **Paired observations solve the sample size problem** — no split arms needed

### Phase 4: Semantic Memory Layer (Future, when volume justifies)
- Cross-venture pattern recognition from accumulated experiment data
- Archetype-specific survival models grounded in actual portfolio data
- Automatic profile weight evolution via gradient-like optimization
- Integration with Unified Strategic Intelligence Pipeline

### Phase 5: Analytics Dashboard (Future)
- Experiment results visualization
- Predictive accuracy trends over time
- Profile comparison and weight sensitivity
- Chairman override impact analysis

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Existing infrastructure already partially built — risk of duplication. (2) Kill gate outcomes are Chairman decisions, not statistical events. (3) The acquirability score is soft/advisory and not part of the 10-component weighted composite.
- **Assumptions at Risk**: (1) Enough ventures for statistical significance (need 400+ per arm for 5% effect). (2) Stage 0 scores have predictive power over late-stage gates. (3) LLM prompt variation produces meaningfully different outcomes vs intra-prompt stochastic variance.
- **Worst Case**: Build 3-6 months of infra, accumulate 18 months of data, discover Chairman overrode 40% of decisions, venture-to-venture variation dwarfs prompt variation, and counterfactual-engine already could have answered the questions retrospectively.

### Visionary
- **Opportunities**: (1) Self-calibrating scoring system with automatic profile weight evolution. (2) Prompt variant registry with semantic versioning for production A/B testing. (3) Cross-venture predictive intelligence network for portfolio pattern recognition.
- **Synergies**: Unified Strategic Intelligence Pipeline (predictive gate calibration), Capability Gap Analyzer (quantitative investment prioritization), Gate Signal Service (experimentally interpretable outcomes), Profile Blending Engine (empirical blend ratios).
- **Upside Scenario**: Within 6-12 months, a calibrated venture scoring oracle where a Stage 0 score of 75 means "78% probability of surviving to Stage 13." Kill gate automation becomes trustworthy. Stage 0 becomes a portfolio construction tool. Semantic memory becomes a competitive moat encoding EHG's specific execution history.

### Pragmatist
- **Feasibility**: 6/10 (moderate-high difficulty)
- **Resource Requirements**: 3-4 weeks (1 developer), 2 new tables, 8-12 modified files, ~2x LLM cost during experiments (covered by Max plan)
- **Constraints**: (1) Sample size is binding, not engineering. (2) Feedback loop crosses ownership boundaries (automated scoring → Chairman decisions). (3) Prompt versioning requires migration from hardcoded to database-driven.
- **Recommended Path**: Telemetry-first → prompt versioning → experiment assignment. 4 weeks to first results, 3+ months to statistical significance. Use Bayesian stopping rules instead of frequentist fixed-N tests.

### Synthesis
- **Consensus Points**: Sample size is fundamental challenge; leverage existing infra; telemetry first; Chairman override must be tracked separately
- **Tension Points**: "Don't build new infra" (Challenger) vs "This is transformative" (Visionary) — resolved by phased approach that validates premise before investing
- **Composite Risk**: Medium-High (mitigated by phased approach with go/no-go gates)

## Key Telemetry to Capture
Based on team analysis, the experimentation framework should track:
1. **Stage 0 composite score** + per-component breakdown (all 14 synthesis components)
2. **Evaluation profile used** (which weight set produced the score)
3. **Prompt version** (which prompt variant was active)
4. **Kill gate outcomes** at Stages 3, 5, 13, 23 (raw score + pass/fail + Chairman override flag)
5. **Time-to-gate** (latency from Stage 0 to each kill gate — for decay analysis)
6. **Venture archetype** (from archetype-profile-matrix classification)
7. **Chairman override events** (when and why the Chairman overrode a gate recommendation)
8. **Score stability** (multiple evaluations of same input to measure intra-prompt variance)

## Open Questions
1. What is the current baseline predictive accuracy of Stage 0 scores? (Phase 1 answers this)
2. Is intra-prompt score variance greater than inter-prompt variance? (Must establish before A/B testing prompts)
3. Should Bayesian stopping rules replace frequentist tests given low sample volume?
4. How to isolate Chairman override effects from scoring accuracy measurement?
5. Can synthetic experiments (re-running historical blueprints through new prompts) supplement organic volume?
6. Should the semantic memory layer use vector embeddings (pgvector) or structured JSONB pattern matching?

## Suggested Next Steps
1. **Create SD for Phase 1** — Wire feedback loop, establish baseline (highest priority, lowest risk)
2. **Run `calibratePredictions()`** on existing data to see if there's any signal to optimize
3. **Audit `recordGateSignal` wiring** — Is it actually being called at kill gate execution points?
4. **Design experiment schema** — `experiments` + `experiment_assignments` table design for Phase 3
5. **Investigate Bayesian A/B testing** libraries for Node.js to handle low-volume scenarios
