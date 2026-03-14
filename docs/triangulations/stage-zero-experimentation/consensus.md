# Triangulation Consensus: Stage Zero Experimentation Framework

**Date**: 2026-03-10
**Vision**: VISION-STAGE0-EXPERIMENT-L2-001
**Architecture**: ARCH-STAGE0-EXPERIMENT-001
**Brainstorm Session**: 146c3acd-1367-4185-9792-7d116b13aed5

## Sources
- Academic research on startup success prediction (ML models, 35K+ startups)
- Stage-gate innovation process literature
- Bayesian A/B testing frameworks (Statsig, Towards Data Science)
- LLM prompt evaluation research (Langfuse, Braintrust, arxiv 2025-2026)
- Human-AI decision-making research (Oxford, Statsig)
- pgvector ecosystem and agent memory architecture (2026 guides)
- Internal team analysis (Challenger, Visionary, Pragmatist perspectives)

## Consensus Table

| Question | Verdict | Confidence | Impact on Architecture |
|----------|---------|------------|----------------------|
| 1. Can Stage 0 predict kill gate outcomes? | Yes for near gates (3,5), weak for far (13,23) | Medium | Phase 1 answers empirically — no architecture change needed |
| 2. Bayesian vs frequentist? | **Bayesian only viable path** at this volume | High | Use Beta priors, credible intervals, Bayesian stopping rules |
| 3. Chairman override handling? | **3 separate signals + blind evaluation** | High | Track algorithmic, actual, override flag independently |
| 4. pgvector vs JSONB? | **JSONB first (Phase 1-3), pgvector Phase 4** | High | No pgvector in initial build; add when semantic queries needed |
| 5. Paired dual-evaluation valid? | **Yes — industry-standard shadow testing** | High | Run both variants per venture + 3x repetition for variance |
| 6. Most predictive telemetry? | **Capture all P0-P3, feature-importance prune** | High | 14 component scores + gate outcomes + profile/prompt version |

## Key Design Decisions Confirmed

### Bayesian Statistical Framework
- Beta priors centered on baseline accuracy from Phase 1
- Credible intervals instead of p-values
- Bayesian stopping rules: stop when P(better) > 0.95 or P(futile) > 0.95
- Can produce actionable (if wide) results with as few as 20 observations per arm
- Rationale: Frequentist needs ~400/arm for 5% effect; Bayesian reduces by 75%

### Three-Signal Chairman Tracking
1. **Algorithmic recommendation** — pure experiment signal for statistical analysis
2. **Chairman decision** — real-world outcome for accuracy measurement
3. **Override flag** — measures human-algorithm disagreement patterns
- Chairman must NOT know experiment variant assignment (blind evaluation)
- Analyze signals independently to separate scoring accuracy from human value-add

### Shadow Testing Pattern for Dual-Evaluation
- Industry standard from Langfuse, Braintrust, PostHog
- Both prompt variants scored for every venture (within-subject design)
- Assigned variant's score used for progression; other logged asynchronously
- 3x repetition per prompt to establish intra-prompt variance baseline
- Absolute scoring (not pairwise ranking) — 9% flip rate vs 35% for pairwise

### JSONB-First Data Layer
- Phase 1-3: Structured JSONB for experiment data, scores, outcomes
- Supports exact queries: "experiments where moat_architecture weight > 0.15"
- Phase 4: Add pgvector for semantic similarity ("ventures like this one")
- Supabase supports both natively; pgvector deferred, not excluded

## Telemetry Priority Tiers

| Tier | Dimensions | When to Capture |
|------|-----------|-----------------|
| P0 | Composite score + 14 component scores, kill gate pass/fail + raw score + override flag | Phase 1 (immediate) |
| P1 | Evaluation profile, prompt version, venture archetype | Phase 2-3 (experiment assignment) |
| P2 | Time-to-gate, score stability (3x repetition variance) | Phase 3 (dual evaluation) |
| P3 | Opportunity blueprint metadata, Chairman override reason | Phase 4 (semantic memory) |

## Risk Assessment Update

| Risk | Pre-Triangulation | Post-Triangulation | Change |
|------|-------------------|-------------------|--------|
| Low sample size | High | **Medium** | Bayesian + paired design reduces required N by ~75% |
| Chairman contamination | High | **Medium** | 3-signal + blind design isolates effect |
| Stage 0 has no predictive power | Unknown | **Unknown (Phase 1 answers)** | No change — this is the critical unknown |
| Dual-evaluation introduces bias | Medium | **Low** | Shadow testing is industry standard; 3x repetition controls variance |
| pgvector complexity premature | Medium | **Resolved** | JSONB first, pgvector deferred to Phase 4 |

## Remaining Unknowns (Cannot Be Triangulated — Must Be Measured)
1. Baseline predictive accuracy of current Stage 0 scores (Phase 1 deliverable)
2. Chairman override frequency and directional accuracy
3. Intra-prompt score variance magnitude (is it > inter-prompt variance?)
4. Actual venture throughput per month through kill gates

## Recommendation
**Proceed with SD creation for Phase 1 (Telemetry & Baseline)**. No open questions block implementation. The single biggest unknown (baseline accuracy) is answered by Phase 1 itself — making it the perfect first investment.
