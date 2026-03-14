# Addendum: Cold Start Problem — Stage Zero Experimentation Framework

> **Type**: Design Critique (Addendum to Post-Implementation Triangulation)
> **Date**: 2026-03-11
> **Context**: All three reviewers (Claude, OpenAI, AntiGravity) recommended "historical replay" and "run the baseline first." This addendum reveals that neither is currently possible.

---

## Prior Consensus (What Was Recommended)

In the post-implementation triangulation, all three reviewers converged on:

1. **Run `experiment-baseline.js` first** — establish prediction accuracy before experimenting
2. **Historical replay / "Time Machine"** — take 50-100 ventures with known outcomes, re-run with new prompts, compare immediately
3. **First live experiment** after baseline validates predictive power

All three assumed a meaningful backlog of ventures with known kill gate outcomes existed. **It does not.**

---

## Ground-Truth: What Data Actually Exists

We queried the production database. Here is the complete inventory:

### Ventures

| Venture | Status | Current Stage | Created | Kill Reason | Archetype |
|---------|--------|--------------|---------|-------------|-----------|
| Pipeline-Test-1773160402094 | active | 3 | 2026-03-10 | none | none |
| ListingLens AI | active | 13 | 2026-03-10 | none | none |
| MindStack AI | active | 3 | 2026-03-10 | none | none |

**Total ventures ever created: 3.** All created yesterday. All active. None killed.

### Telemetry Tables

| Table | Row Count | Notes |
|-------|-----------|-------|
| `evaluation_profile_outcomes` | **0** | Gate signal telemetry was wired yesterday — no signals recorded yet |
| `stage_of_death_predictions` | **0** | Empty — no predictions have ever been made |
| `venture_briefs` | 2 | Chairman review output from Stage 0 |
| `opportunity_blueprints` | 8 | But schema has `opportunity_score` and `confidence_score` only — no per-component scores (acquirability, moat, etc.) |

### Stage Progression

| Venture | Stages Completed | Kill Gates Encountered | Kill Gate Outcomes |
|---------|-----------------|----------------------|-------------------|
| ListingLens AI | 1-13, up to 21 | Stage 3 (passed), Stage 5 (passed), Stage 13 (passed) | All passed |
| MindStack AI | 1-2, Stage 3 in progress | Stage 3 (in progress) | Pending |
| Pipeline-Test | 1-2, some stages up to 21 | Stage 3 (in progress) | Pending |

**No venture has ever been killed at a gate.** Zero negative outcomes exist.

### What This Means

1. **`experiment-baseline.js` will return `INSUFFICIENT_DATA`** — there are no predictions with actual outcomes to calibrate against
2. **Historical replay is impossible** — there are no historical ventures with known outcomes to replay
3. **The Bayesian analyzer has nothing to analyze** — zero experiment outcomes exist
4. **The gate signal telemetry (Phase A) is recording from now forward** — but the first useful signal requires a venture to reach and fail a kill gate

---

## The Cold Start Problem

The experimentation framework is **infrastructure-ahead-of-data**. The architecture is sound, the modules are built, but the system is dormant because:

1. The pipeline has only processed 3 ventures, all yesterday
2. No venture has failed a kill gate (zero negative outcomes)
3. Per-component scores (the 14 synthesis dimensions) aren't stored in `opportunity_blueprints` — only composite scores
4. At 5-20 ventures/month, accumulating 40+ ventures with kill gate outcomes (including some failures) could take 6-12 months organically

This creates a chicken-and-egg problem: we can't validate the framework without data, and we can't justify waiting 6-12 months for organic data to accumulate.

---

## Proposed Solution: Synthetic Data Simulation

Rather than waiting for organic data, we could simulate the venture pipeline to:
- Validate that the experiment engine works end-to-end
- Test the Bayesian analyzer with realistic data distributions
- Identify bugs in the statistical pipeline before real data arrives
- Establish baseline expectations for what "good" looks like

### Simulation Design Questions

We need your critique on the following simulation approaches:

#### Approach A: Pure Synthetic Ventures

Generate 100-200 synthetic ventures with:
- Randomized Stage 0 component scores (14 dimensions) drawn from realistic distributions
- Simulated kill gate outcomes based on a known ground-truth function (e.g., "ventures with composite score > 70 have 80% Stage 3 survival")
- Some ventures killed at Stage 3, some at Stage 5, some surviving to Stage 13+
- Chairman overrides on ~15% of decisions

**Advantage**: Full control over ground truth — we know the exact relationship between scores and outcomes, so we can measure calibration accuracy precisely.
**Risk**: Synthetic data may not reflect real score distributions, creating false confidence.

#### Approach B: Replay With Prompt Variations

Take the 3 existing ventures' raw input data (the idea descriptions that entered Stage 0) and:
- Re-run each through all 14 analysis steps multiple times with the current prompts (establishes variance baseline)
- Re-run with a variant prompt (e.g., structured rubric for acquirability)
- Record all scores as experiment outcomes
- Simulate kill gate decisions based on score thresholds

**Advantage**: Uses real venture ideas and real LLM evaluations — more realistic than pure synthetic.
**Risk**: Only 3 data points. Repeated evaluation of the same 3 ideas doesn't prove much about generalization.

#### Approach C: Imported Startup Dataset

Source a public dataset of startup descriptions with known outcomes (e.g., Crunchbase data on startups that succeeded/failed), feed them through Stage 0 as if they were new ventures, and record scores:
- 100-500 startup descriptions with known survival/failure outcomes
- Run through Stage 0 analysis pipeline
- Compare Stage 0 scores against known outcomes
- Provides real calibration data

**Advantage**: Large sample with real outcomes. True test of whether the scoring dimensions predict anything.
**Risk**: External startups may not match EHG's specific evaluation context. High LLM token cost. Crunchbase outcomes are "company survived 5 years" not "passed Stage 3 kill gate" — different success criteria.

#### Approach D: Hybrid — Synthetic Structure + Real Scoring

Generate 50-100 synthetic venture ideas spanning different archetypes and quality levels, then:
- Run each through the real Stage 0 pipeline (real LLM evaluation)
- Manually assign ground-truth kill gate outcomes based on idea quality (Chairman reviews each and decides "would I kill this at Stage 3?")
- Use these as the calibration dataset

**Advantage**: Real LLM scoring on controlled inputs with human-judged outcomes.
**Risk**: Chairman time investment. Subjective ground truth.

---

## Questions for Your Critique

### On the Cold Start Problem

1. Is synthetic data simulation the right approach, or should we simply wait for organic data to accumulate while fixing the C4/C6 structural issues?

2. If we simulate, which approach (A, B, C, D, or a combination) provides the most useful validation with the least risk of false confidence?

3. What's the minimum synthetic dataset size needed to meaningfully test the Bayesian analyzer and the full experiment pipeline?

4. Should the synthetic data be persisted in the production database (treating it as real calibration data) or kept in a separate test environment? If production, how do we mark synthetic vs organic data to avoid contamination?

### On the Simulation Design

5. For Approach A (pure synthetic): What probability function should generate kill gate outcomes from scores? A logistic function (`P(survive) = sigmoid(a * score + b)`) seems natural, but what parameters would be realistic?

6. For Approach C (imported dataset): Is there a publicly available dataset of startup descriptions with outcome data that would be appropriate? What mapping from "startup survived/failed" to "would pass EHG kill gate" makes sense?

7. Should the simulation include Chairman overrides? If so, what override rate and pattern (random, contrarian, quality-aware) would be most useful for testing the 3-signal tracking?

8. The pre-build triangulation recommended testing intra-prompt variance (3x repetition). Should the simulation explicitly model LLM stochasticity (e.g., adding noise to scores on repeated evaluations)?

### On Pipeline Maturity

9. Given that only 3 ventures have ever entered the pipeline, is the experimentation framework premature? Should the team focus entirely on running more ventures through the pipeline before investing in experiment infrastructure improvements?

10. What's the fastest path to getting useful calibration data? Is it (a) running more real ventures, (b) synthetic simulation, (c) imported datasets, or (d) Chairman retrospective judgment on hypothetical ventures?

11. The 14 per-component scores aren't stored in `opportunity_blueprints` (only composite scores). For the experiment framework to work, should each component score be persisted separately? Where?

### On Framework Modifications

12. Should the experiment framework be modified to work without kill gate outcome data? For example, could experiments compare prompt variants purely on score consistency (variance reduction), Chairman agreement rate, or inter-component coherence — metrics that don't require waiting months for kill gate outcomes?

13. Could the system use "proxy outcomes" instead of kill gate survival? For example: Chairman confidence score at Stage 0, time-to-Stage-3 completion, or manual quality ratings?

---

## Deliverable Format

Please provide:

1. **Cold start verdict** — Is this a blocking problem or a timing issue? Should we simulate, wait, or do something else entirely?
2. **Recommended simulation approach** — Which of A/B/C/D (or a hybrid) and why
3. **Proxy metrics** — What can we measure NOW without kill gate outcome data?
4. **Minimum viable dataset** — Size and composition for meaningful validation
5. **Data contamination strategy** — How to handle synthetic vs organic data in production
6. **Revised roadmap** — Updated sequencing given the cold start reality
