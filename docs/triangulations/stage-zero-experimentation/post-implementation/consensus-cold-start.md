# Consensus: Cold Start Problem — Stage Zero Experimentation Framework

> **Date**: 2026-03-11
> **Type**: Addendum Consensus (Post-Implementation Triangulation)
> **Reviewers**: Claude (Opus 4.6), OpenAI, AntiGravity
> **Prompt**: `prompt-addendum-cold-start.md`

---

## Reviewer Scores & Framing

| Reviewer | Verdict | Framing |
|----------|---------|---------|
| **Claude** | Timing issue, not a blocker — act now | "Redefine what success looks like" — pivot from kill gate prediction to proxy metrics |
| **OpenAI** | Timing problem with one blocking implication | Cannot claim predictive validity yet; simulate for plumbing, not calibration evidence |
| **AntiGravity** | Blocking for outcome-based calibration, not for the framework itself | Dual-tracked: simulate for engineering validation, proxy metrics for immediate value |

**Consensus**: All three agree the cold start is **not a reason to stop or wait**. The framework is infrastructure-ahead-of-data. The fix is **not** more data — it's redefining near-term success criteria away from kill gate prediction toward measurable proxy signals.

---

## Consensus Table

| Question | Claude | OpenAI | AntiGravity | **Consensus** |
|----------|--------|--------|-------------|---------------|
| **1. Simulate or wait?** | Simulate + proxy pivot | Simulate for plumbing only | Simulate + proxy pivot | **Simulate for validation, proxy metrics for real value** |
| **2. Which approach?** | D-lite (15-25) + proxy pivot | A+D hybrid, B for variance, C later | D + B supplement | **D primary (Chairman-labeled), B for variance, A for stress testing** |
| **3. Minimum dataset size** | 15-25 for plumbing, 40+ per variant for stats | 30-50 synthetic, 20-30 Chairman-labeled | 60-80 with 30-40% kill rate | **40-60 synthetic ventures, 30%+ forced kill rate** |
| **4. Production or separate?** | Separate schema (strong preference) | Production with provenance fields + filtered views | Production with `is_synthetic` flag | **Production with provenance flag + default-filtered views** |
| **5. Logistic function for outcomes?** | `sigmoid(-0.1 * (score - 55))` | Latent quality model preferred over simple sigmoid | Piecewise thresholds with noise | **Chairman labels > any function; use piecewise if automated** |
| **6. Imported datasets (C)?** | Later, mapping problem is fatal | Later, not first; expensive and noisy | Not recommended, doesn't match EHG kill logic | **Defer C entirely — mapping problem unanimously rejected** |
| **7. Chairman overrides?** | Yes, 20%, quality-aware contrarian | Yes, in borderline/high-uncertainty cases | Yes, 10-15%, contrarian | **Yes, 10-20%, concentrated in borderline score bands** |
| **8. Model LLM stochasticity?** | Measure directly (3x runs), don't simulate | Yes, explicitly | Yes, Approach D captures naturally; add Gaussian noise for A | **Measure directly via 3x repetition (Approach B), don't fake it** |
| **9. Framework premature?** | No — pivot success criteria | Premature as calibration engine, not as infrastructure | Premature for outcomes, mature for proxy testing | **Infrastructure: not premature. Calibration claims: premature.** |
| **10. Fastest calibration path?** | Proxy metrics from day 1 | D for judgment-aligned benchmark | D (Chairman Flash Review) | **Approach D with Chairman Flash Review (~1hr investment)** |
| **11. Store 14 component scores?** | Yes, `component_scores JSONB` on `opportunity_blueprints` | Yes, child table or JSONB; favor child table if versioning | CRITICAL MUST-FIX, JSONB on `opportunity_blueprints` | **CRITICAL: Add `component_scores JSONB` immediately** |
| **12. Work without kill gate data?** | Yes — primary operating mode for 6 months | Yes — shift to process quality and decision quality proxies | Yes — variance reduction and coherence testing | **Yes — proxy metrics ARE the near-term success criteria** |
| **13. Proxy outcomes?** | Chairman confidence best; time-to-Stage-3 second | Chairman agreement rate, ranking stability, decision usefulness | Day-Zero Chairman Gut Check (0-100) | **Chairman Day-Zero Confidence rating as primary proxy** |

---

## Full Consensus by Deliverable

### 1. Cold Start Verdict

**UNANIMOUS: Act now. Do not wait.**

The cold start is a timing/sequencing problem, not an architectural flaw. All three reviewers independently arrived at the same two-track solution:

1. **Simulation** — validates that the plumbing works (data flows, Bayesian math, experiment lifecycle)
2. **Proxy metric pivot** — makes the framework immediately useful without kill gate outcomes

The critical insight (OpenAI stated it most sharply): **"The main mistake to avoid is letting synthetic success masquerade as real-world evidence."** Synthetic data validates engineering. Proxy metrics validate quality. Neither pretends to be kill gate calibration.

### 2. Recommended Simulation Approach

**CONSENSUS: Approach D (Chairman-labeled hybrid), supplemented by B (variance), with A for stress testing. Defer C.**

| Phase | Approach | Purpose | Size |
|-------|----------|---------|------|
| 1 | **A (synthetic)** | Stress-test pipeline mechanics, edge cases, failure modes | 30-50 ventures |
| 2 | **D (hybrid + Chairman)** | Create judgment-aligned benchmark with real LLM scores | 20-30 ventures |
| 3 | **B (replay)** | Quantify intra-prompt variance on real + synthetic ideas | 10-15 items × 3 runs |
| — | ~~C (imported)~~ | **Deferred unanimously** — mapping "survived 5 years" to "passed Stage 3" is theoretically unsound | — |

**Key design choices:**
- Generate venture ideas across quality tiers: ~30% clearly strong, ~40% ambiguous/borderline, ~30% clearly weak
- Chairman "Flash Review" (~1 hour): reviews each D-phase venture and assigns pass/kill judgment
- Force a **30-35% kill rate** in Chairman labels to ensure enough negative examples
- Multiple archetypes represented

**Disagreement resolved**: Claude recommended 15-25 ventures (D-lite), AntiGravity recommended 60-80. OpenAI split the difference at 30-50 for synthetic + 20-30 for Chairman-labeled. **Consensus: 40-60 total** — enough to test the full pipeline and Bayesian analyzer behavior without excessive Chairman burden.

### 3. Proxy Metrics

**UNANIMOUS: The framework must work without kill gate data. Proxy metrics are the near-term success criteria.**

All three reviewers converged on essentially the same proxy metric set, organized by availability:

#### Tier 1: Measure Immediately (Zero Code Changes)

| Metric | Description | All Three Agree? |
|--------|-------------|:---:|
| **Intra-Prompt Variance** | Same venture, same prompt, 3x runs — lower σ = better | Yes |
| **Inter-Component Coherence** | Do the 14 dimensions logically agree? (Moat 90, Market 20 = incoherent) | Yes |
| **Score Distribution / Dispersion** | Does the prompt use the full 0-100 range, or compress into 70-85? | Yes |

#### Tier 2: Requires C4/C6 Fix

| Metric | Description | All Three Agree? |
|--------|-------------|:---:|
| **Cross-Variant Score Delta** | Do different prompts produce meaningfully different scores? | Yes |
| **Ranking Stability** | Do variants preserve the same venture ordering? (Spearman correlation) | Claude + OpenAI |
| **Chairman Agreement Rate** | How often does the AI recommendation match Chairman judgment? | Yes |

#### Tier 3: New Data Collection

| Metric | Description | All Three Agree? |
|--------|-------------|:---:|
| **Day-Zero Chairman Confidence** | Chairman rates each venture 0-100 at Stage 0 intake — primary proxy outcome | OpenAI + AntiGravity (Claude had "Chairman confidence" second) |
| **Dimension Sensitivity** | Which of the 14 dimensions changes most with prompt variations? | Claude |
| **Decision Usefulness** | Are outputs actionable, specific, and legible for gate decisions? | OpenAI |
| **Time-to-Decision** | Latency and operator burden per evaluated venture | OpenAI |
| **Coverage/Completeness** | Are all 14 dimensions consistently produced and stored? | OpenAI |

**Consensus primary proxy**: **Day-Zero Chairman Confidence rating** — a 0-100 score the Chairman provides at Stage 0 intake. This requires minimal process change (one number per venture), is immediately available, and directly measures what matters: does the AI evaluation help the Chairman make better decisions?

**Implementation note (Claude)**: Modify the Bayesian analyzer to support a **continuous mode** (Normal-InverseGamma posterior for mean comparison) alongside the existing binary mode (`score > 50`).

### 4. Minimum Viable Dataset

| Purpose | Size | Composition |
|---------|------|-------------|
| Pipeline validation (smoke test) | 30-50 synthetic | Cover edge cases, failure modes, all archetypes |
| Chairman-labeled benchmark | 20-30 with labels | Balanced quality tiers, forced 30%+ kill rate |
| Variance baseline | 10-15 items × 3 runs | Mix of real and synthetic, multiple prompt variants |
| Bayesian analyzer shakedown | 40-60 total observations | 2-3 variants, 10-15 per variant minimum |
| **Kill gate calibration (deferred)** | **100+ with 30+ failures** | **6-12 months organic accumulation** |

### 5. Data Contamination Strategy

**Consensus: Production tables with provenance marking + default-filtered views.**

Claude preferred separate schema; OpenAI and AntiGravity preferred production with flags. The pragmatic consensus:

1. **Add provenance columns** to experiment-related tables:
   - `data_origin`: `organic` | `synthetic` | `imported` | `retrospective`
   - `is_synthetic BOOLEAN DEFAULT false` (simpler query filter)

2. **Create filtered views**:
   - `experiment_outcomes_organic` (default for all dashboards and real analysis)
   - `experiment_outcomes_all` (includes synthetic, for pipeline debugging)

3. **Hard rule**: Synthetic data **never** influences headline calibration metrics. All production queries default to `WHERE is_synthetic = false`.

4. **Synthetic venture ideas** stored in a separate `simulation_venture_ideas` table — these are test fixtures, not pipeline artifacts.

### 6. Revised Roadmap

All three reviewers produced nearly identical sequencing. Merged:

#### Phase 0: Critical Schema Fix (Week 1)

**UNANIMOUS PRIORITY #1**: Persist the 14 per-component scores.

- Add `component_scores JSONB` column to `opportunity_blueprints`
- Structure: `{ "acquirability": { "score": 72, "rationale": "..." }, "moat_architecture": { ... }, ... }`
- Include `prompt_version`, `model_version`, `run_id` in the JSONB
- Without this, the experiment framework is "essentially DOA" (AntiGravity)

#### Phase 1: C4/C6 Structural Fixes (Weeks 1-2)

- **Fix C4 (Dual Evaluator)**: Make `evaluateDual()` re-run analysis with variant-specific prompts
- **Fix C6 (PromptLoader wiring)**: Wire 3-5 highest-impact synthesis files to `getPrompt()`
- Add `data_origin` / `is_synthetic` columns to experiment tables

#### Phase 2: Proxy Metric Implementation (Week 3)

- Add continuous metric mode to Bayesian analyzer
- Implement Tier 1 proxy metrics (variance, coherence, distribution)
- Add Chairman Day-Zero Confidence field to Stage 0 review flow
- Run first proxy experiment on acquirability dimension

#### Phase 3: Simulation Validation (Week 4)

- Generate 40-60 synthetic venture ideas across quality tiers
- Run through real Stage 0 pipeline (Approach D)
- Chairman Flash Review: assign pass/kill labels (~1 hour)
- End-to-end pipeline test: create experiment → assign → dual evaluate → analyze → report
- 3x repetition on 10-15 items for variance baseline (Approach B)

#### Phase 4: Organic Accumulation (Month 2+)

- Every real venture automatically feeds proxy metric data
- Monthly experiment reviews after 10-15 real ventures
- Transition from proxy to kill gate metrics when 40+ organic ventures with outcomes exist

#### Phase 5: Dashboard + Semantic Memory (Month 6+)

- Phase D deferred until meaningful organic data exists
- Dashboard meaningless without data to display

---

## Key Disagreements Resolved

| Topic | Claude | OpenAI | AntiGravity | Resolution |
|-------|--------|--------|-------------|------------|
| **Dataset size** | 15-25 (minimal) | 30-50 + 20-30 labeled | 60-80 | 40-60 total — balances validation rigor vs Chairman burden |
| **Data separation** | Separate schema | Provenance fields + views | Production with flag | Production with flag + views (pragmatic majority) |
| **Primary proxy** | Score variance | Chairman agreement + ranking stability | Day-Zero Chairman Gut Check | Day-Zero Chairman Confidence (easiest to collect, most decision-relevant) |
| **Approach C timing** | "Mapping problem is fatal" | "Later, not first" | "Theoretically unsound" | Deferred indefinitely — unanimous rejection of near-term use |

## No Disagreements On

- The cold start is real but not blocking
- Approach D is the best simulation approach
- Proxy metrics must replace kill gate outcomes as near-term success criteria
- Per-component score storage is a critical prerequisite
- C4/C6 fixes are prerequisites for any real experimentation
- Chairman overrides should be modeled (10-20%, quality-aware, borderline-concentrated)
- LLM stochasticity should be measured directly (3x runs), not simulated with noise
- Synthetic data must never contaminate real calibration metrics

---

## Actionable Next Steps

1. **Create SD for component score schema migration** — Add `component_scores JSONB` to `opportunity_blueprints`
2. **Prioritize C4/C6 fixes** — These were already identified in the post-implementation consensus; cold start analysis reinforces urgency
3. **Add Chairman Day-Zero Confidence** to Stage 0 review flow — single most impactful proxy metric
4. **Design the D-lite simulation** — 40-60 venture ideas across quality tiers, ready for Chairman Flash Review
5. **Modify Bayesian analyzer** — Add continuous metric mode for proxy outcomes

---

*Synthesized from three independent reviews of `prompt-addendum-cold-start.md`. All reviewers had access to the same ground-truth database inventory and framework code evidence.*
