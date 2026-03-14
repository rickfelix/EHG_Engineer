# Post-Implementation Triangulation: Stage Zero Experimentation Framework

> **Type**: Ground-Truth Audit + Design Critique
> **Date**: 2026-03-11
> **System**: EHG Stage Zero Experimentation Framework
> **Status**: Built and merged. No real experiments run yet.

---

## Your Role

You are an independent technical reviewer performing two tasks:

1. **Ground-Truth Audit** — Verify the implementation status of every claimed component. Classify each as WORKS, DISCONNECTED, STUBBED, PLANNED, or MISSING based on the evidence provided.
2. **Design Critique** — Evaluate the statistical methodology, architecture decisions, and overall approach. Propose specific improvements before the first real experiment runs.

Be direct. Point out flaws, gaps, and risks. We're looking for genuine critique, not validation.

---

## CRITICAL: Multi-Repository Architecture

This system spans two repositories. You must account for both when assessing completeness.

| Repository | Purpose | Contains |
|------------|---------|----------|
| **EHG** | Frontend (React + Vite + TypeScript) | UI components, pages, routes, hooks |
| **EHG_Engineer** | Backend/Tooling (Node.js) | CLI tools, scripts, lib modules, database |

**Failure mode to avoid**: Do NOT claim something is MISSING if it might live in the other repo.

---

## System Context: What EHG Does

EHG is an AI-powered venture incubation platform. When a startup idea enters the pipeline, AI ("EVA") evaluates it through a 25-stage workflow:

- **Stage 0 (Intake)**: EVA runs ~14 LLM-based analyses producing a composite venture score
- **Kill gates** at Stages 3, 5, 13, 23: Binary PASS/KILL decisions
- **The Chairman** (human decision-maker) reviews EVA's recommendations and can override
- **Volume**: ~5-20 ventures per month
- **Stack**: Node.js, Supabase (PostgreSQL), Claude API for LLM evaluations

### The 14 Stage 0 Scoring Dimensions

These are the synthesis components that produce the composite venture score:

| # | Component | Source File (EHG_Engineer) |
|---|-----------|--------------------------|
| 1 | Acquirability | `lib/eva/stage-templates/analysis-steps/stage-00-acquirability.js` |
| 2 | Moat Architecture | `lib/eva/stage-zero/synthesis/moat-architecture.js` |
| 3 | Problem Reframing | `lib/eva/stage-zero/synthesis/problem-reframing.js` |
| 4 | Portfolio Evaluation | `lib/eva/stage-zero/synthesis/portfolio-evaluation.js` |
| 5 | Cross Reference | `lib/eva/stage-zero/synthesis/cross-reference.js` |
| 6 | Design Evaluation | `lib/eva/stage-zero/synthesis/design-evaluation.js` |
| 7 | Archetypes | `lib/eva/stage-zero/synthesis/archetypes.js` |
| 8 | Attention Capital | `lib/eva/stage-zero/synthesis/attention-capital.js` |
| 9 | Build Cost Estimation | `lib/eva/stage-zero/synthesis/build-cost-estimation.js` |
| 10 | Narrative Risk | `lib/eva/stage-zero/synthesis/narrative-risk.js` |
| 11 | Tech Trajectory | `lib/eva/stage-zero/synthesis/tech-trajectory.js` |
| 12 | Time Horizon | `lib/eva/stage-zero/synthesis/time-horizon.js` |
| 13 | Virality | `lib/eva/stage-zero/synthesis/virality.js` |
| 14 | Capability Score | `lib/eva/stage-zero/capability-score/score-stage.js` |

---

## The Problem This Framework Solves

Stage 0 scores were fire-and-forget:
- No feedback loop between Stage 0 predictions and actual kill gate outcomes
- No way to measure if a score of 75 predicted survival better than 60
- No mechanism to test alternative scoring prompts (all hardcoded JavaScript constants)
- `calibratePredictions()` existed but was never wired into live pipeline

**Goal**: A scoring oracle where a Stage 0 score of 75 means "78% probability of surviving to Stage 13" — calibrated with empirical evidence and continuously improved through prompt experimentation.

---

## Implementation Evidence (Ground-Truth Data)

Below is what was actually built, with file paths and code evidence. Use this section to classify each component.

### Phase A: Telemetry & Baseline

**Component A1: Gate Signal Recording**

Kill gate evaluations now emit telemetry signals via `recordGateSignal()`.

**Integration point** — `lib/agents/modules/venture-state-machine/stage-gates.js:185-190`:
```javascript
// SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-A: Emit telemetry signal
const signalType = filterResult.auto_proceed ? 'pass' : 'fail';
recordGateSignal({ supabase, logger }, {
  ventureId, gateBoundary: `stage_${toStage}`, signalType,
  outcome: { evaluatedThresholds, recommendation: filterResult.recommendation },
}).catch(err => logger.warn(`   Gate signal emission failed (non-blocking): ${err.message}`));
```

**Service implementation** — `lib/eva/stage-zero/gate-signal-service.js:39-72`:
```javascript
export async function recordGateSignal(deps, signal) {
  const { supabase, logger = console } = deps;
  const { ventureId, gateBoundary, signalType, outcome = {}, profile = null } = signal;
  // ... validates inputs, inserts to evaluation_profile_outcomes table
  const { data, error } = await supabase
    .from('evaluation_profile_outcomes')
    .insert({
      profile_id: profile?.id || null,
      profile_version: profile?.version || null,
      venture_id: ventureId,
      gate_boundary: gateBoundary,
      signal_type: signalType,
      outcome,
    })
    .select('id, profile_id, venture_id, gate_boundary, signal_type')
    .single();
  // ...
}
```

**Tracked boundaries** (defined at line 19-25):
```javascript
const TRACKED_BOUNDARIES = [
  'stage_3',   // Early signal
  '5->6',      // Ideation → Validation
  '12->13',    // Planning → Build
  '20->21',    // Launch → Scale
  'graduation', // Full completion
];
```

**Note**: The stage-gates integration uses `stage_${toStage}` format (e.g., `stage_3`), but `TRACKED_BOUNDARIES` also includes different formats like `5->6`. The `recordGateSignal` function does NOT check against `TRACKED_BOUNDARIES` — it records any signal regardless. The `isTrackedBoundary()` check function exists but is not called by the recording path.

**Component A2: Materialized View**

Claimed: `stage_zero_experiment_telemetry` materialized view joining `evaluation_profile_outcomes` with `stage_of_death_predictions`.

Evidence: Referenced in `scripts/experiment-baseline.js:129`:
```javascript
const { error } = await supabase.rpc('refresh_stage_zero_telemetry');
```

**Note**: The RPC function `refresh_stage_zero_telemetry` is called but the SQL migration creating the view was not provided as evidence. It may exist in the database but cannot be verified from code alone.

**Component A3: Baseline Script**

File: `scripts/experiment-baseline.js` (202 lines)

3-step process:
1. **Backfill** — Queries `evaluation_profile_outcomes` for `signal_type = 'fail'`, extracts stage numbers from `gate_boundary` via regex, updates `stage_of_death_predictions.actual_death_stage`
2. **Calibrate** — Fetches predictions with actual outcomes, calls `calibratePredictions()` from `stage-of-death-predictor.js`
3. **Refresh view** — Calls `refresh_stage_zero_telemetry` RPC
4. **Report** — Outputs go/no-go JSON with accuracy score, MAE, directional accuracy, per-archetype breakdown, confidence intervals, and configurable threshold (default 60%)

Supports `--dry-run` and `--threshold=N` flags. Entry point: `main().catch(...)` (runs directly).

---

### Phase B: Prompt Versioning

**Component B1: PromptLoader Service**

File: `lib/eva/prompt-loader.js` (103 lines)

```javascript
export async function getPrompt(name) {
  // Check cache first
  const cached = cache.get(name);
  if (cached && Date.now() < cached.expiry) {
    return cached.value;
  }
  // Query: SELECT prompt_text FROM leo_prompts WHERE name=$1 AND status='active' ORDER BY version DESC LIMIT 1
  // Cache with 5-min TTL
  // Return null on ANY error (never throws)
}
```

Features:
- 5-minute in-memory TTL cache (`Map<string, { value, expiry }>`)
- `clearCache()` and `getCacheSize()` exports for testing
- Returns `null` on missing Supabase client, query errors, or no results
- Single-process, non-distributed cache

**Component B2: Prompt Migration CLI**

File: `scripts/migrate-prompts.js` (177 lines)

**CRITICAL FINDING**: The `PROMPT_SOURCES` array contains only **1 entry** (acquirability), not the claimed 14:
```javascript
const PROMPT_SOURCES = [
  {
    name: 'stage-00-acquirability',
    file: 'lib/eva/stage-templates/analysis-steps/stage-00-acquirability.js',
    extract: 'const_system_prompt',
  },
];
```

The extraction logic exists and works (regex for `const SYSTEM_PROMPT = \`...\`` and string literal variants), but only 1 source file is registered.

**Component B3: Stage 0 File Wiring**

**CRITICAL FINDING**: Only **1 of 14** Stage 0 files is wired to use `getPrompt()`.

**Wired** (WORKS):
- `lib/eva/stage-templates/analysis-steps/stage-00-acquirability.js:18,89`:
```javascript
import { getPrompt } from '../../prompt-loader.js';
// ...
const dbPrompt = await getPrompt('stage-00-acquirability');
const systemPrompt = dbPrompt || SYSTEM_PROMPT;
```

**NOT wired** (no `getPrompt` import or call found):
- `lib/eva/stage-zero/synthesis/moat-architecture.js`
- `lib/eva/stage-zero/synthesis/problem-reframing.js`
- `lib/eva/stage-zero/synthesis/portfolio-evaluation.js`
- `lib/eva/stage-zero/synthesis/cross-reference.js`
- `lib/eva/stage-zero/synthesis/design-evaluation.js`
- `lib/eva/stage-zero/synthesis/archetypes.js`
- `lib/eva/stage-zero/synthesis/attention-capital.js`
- `lib/eva/stage-zero/synthesis/build-cost-estimation.js`
- `lib/eva/stage-zero/synthesis/narrative-risk.js`
- `lib/eva/stage-zero/synthesis/tech-trajectory.js`
- `lib/eva/stage-zero/synthesis/time-horizon.js`
- `lib/eva/stage-zero/synthesis/virality.js`
- `lib/eva/stage-zero/capability-score/score-stage.js`

**This means**: Prompt A/B testing currently can only experiment on the acquirability analysis. The other 13 dimensions still use hardcoded prompts and cannot be swapped via database.

---

### Phase C: Experiment Engine

**Component C1: Database Tables**

Three tables claimed: `experiments`, `experiment_assignments`, `experiment_outcomes`.

Evidence: Referenced across all module files and CLI scripts. The CRUD operations target these tables via Supabase client. Cannot verify schema directly from code, but the insert/select patterns reveal expected columns:

- `experiments`: `id, name, hypothesis, variants (JSONB), config, status (enum: draft/running/stopped/archived), created_at, started_at, ended_at`
- `experiment_assignments`: `id, experiment_id (FK), venture_id, variant_key, assigned_at` + UNIQUE on (experiment_id, venture_id)
- `experiment_outcomes`: `id, assignment_id (FK), variant_key, scores (JSONB), metadata (JSONB), evaluated_at`

**Component C2: Experiment Manager**

File: `lib/eva/experiments/experiment-manager.js` (167 lines)

Exports: `createExperiment`, `getExperiment`, `listExperiments`, `startExperiment`, `stopExperiment`, `archiveExperiment`, `getActiveExperiment`

State machine: `draft → running → stopped → archived` (validated at each transition).

Weight normalization on creation:
```javascript
const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
const normalizedVariants = variants.map(v => ({
  key: v.key,
  label: v.label || v.key,
  weight: (v.weight || 1) / totalWeight,
}));
```

**Component C3: Experiment Assignment**

File: `lib/eva/experiments/experiment-assignment.js` (114 lines)

Deterministic hash bucketing:
```javascript
export function hashBucket(ventureId, experimentId, variants) {
  const hash = createHash('sha256')
    .update(`${ventureId}:${experimentId}`)
    .digest('hex');
  // Convert first 8 hex chars to [0, 1)
  const hashValue = parseInt(hash.slice(0, 8), 16) / 0xFFFFFFFF;
  // Walk cumulative weights to find bucket
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (hashValue < cumulative) return variant.key;
  }
  return variants[variants.length - 1].key;
}
```

Race condition handling: catches unique constraint violation (`error.code === '23505'`), re-fetches existing assignment.

**Component C4: Dual Evaluator**

File: `lib/eva/experiments/dual-evaluator.js` (139 lines)

Runs all variants in parallel via `Promise.allSettled` with 60s timeout per variant. Records outcomes to `experiment_outcomes` table. Accepts custom `evaluateFn` or falls back to `defaultEvaluator` (extracts `venture_score`, `chairman_confidence`, `synthesis_quality` from synthesis metadata).

**Component C5: Bayesian Analyzer**

File: `lib/eva/experiments/bayesian-analyzer.js` (391 lines)

Full implementation, no external dependencies. Key details:

- **Model**: Beta-Binomial with uniform prior Beta(1,1)
- **Binary conversion**: `venture_score > 50` = success, else failure
- **P(A > B)**: 10,000 Monte Carlo samples from Beta distributions
- **Credible intervals**: 95% CI via bisection (50 iterations) on regularized incomplete beta function (Lentz continued fraction, 200 iterations max)
- **Stopping rules**: min 20 samples, max 200, stop when P(winner) >= 0.95
- **Statistical functions implemented from scratch**:
  - `gammaSample()` — Marsaglia & Tsang method
  - `normalSample()` — Box-Muller transform
  - `betaSample()` — via gamma ratio
  - `betaQuantile()` — bisection on `regularizedBeta()`
  - `regularizedBeta()` — Lentz continued fraction
  - `lnGamma()` — Lanczos approximation (g=7, 9 coefficients)
- Report generator: formatted ASCII output with per-variant stats, comparisons, and recommendation

**Component C6: Stage 0 Orchestrator Integration**

File: `lib/eva/stage-zero/stage-zero-orchestrator.js:20-22,113-143`

The experiment hook is wired into the main Stage 0 flow (non-blocking):
```javascript
import { getActiveExperiment } from '../experiments/experiment-manager.js';
import { assignVariant } from '../experiments/experiment-assignment.js';
import { evaluateDual, defaultEvaluator } from '../experiments/dual-evaluator.js';

// Step 2c: Experiment hook (non-blocking)
if (!options.skipExperiments) {
  const activeExperiment = await getActiveExperiment(enrichedDeps);
  if (activeExperiment && pathOutput.venture_id) {
    const { variant_key, assignment } = await assignVariant(enrichedDeps, {
      ventureId: pathOutput.venture_id,
      experiment: activeExperiment,
    });
    // Run dual evaluation in background (non-blocking)
    evaluateDual(enrichedDeps, {
      assignment,
      experiment: activeExperiment,
      synthesisResult,
      evaluateFn: deps.experimentEvaluator || defaultEvaluator,
    }).then(result => { /* log */ }).catch(err => { /* warn, non-blocking */ });
  }
}
```

**Note**: The `evaluateDual` runs in the background (fire-and-forget `.then().catch()`). If the Stage 0 orchestrator completes and the process exits before the dual evaluation finishes, outcomes may not be recorded.

**Component C7: CLI Scripts**

| Script | File | Lines | Entry Point | Status |
|--------|------|-------|-------------|--------|
| Create | `scripts/experiment-create.js` | 66 | `main().catch(...)` | Has `--name`, `--hypothesis`, `--variants`, `--start` flags |
| Baseline | `scripts/experiment-baseline.js` | 202 | `main().catch(...)` | Has `--dry-run`, `--threshold=N` flags |
| Status | `scripts/experiment-status.js` | 85 | `main().catch(...)` | Has `--status`, `--id` flags |
| Results | `scripts/experiment-results.js` | 73 | `main().catch(...)` | Has `--id`, `--stop`, `--json` flags |

**Component C8: Frontend Experiment View**

File (EHG repo): `src/components/agents/ABTestingTab/ABTestingTab.tsx`

**FINDING**: This component exists but uses a DIFFERENT schema (`prompt_ab_tests` table with `variant_a_content`/`variant_b_content`/etc columns, `success_metric` enum). It does NOT connect to the `experiments`/`experiment_assignments`/`experiment_outcomes` tables built in Phase C. This appears to be a pre-existing, separate A/B testing UI for the agents dashboard, not the Stage Zero experiment framework.

---

### Phase D: Semantic Memory & Analytics Dashboard (DEFERRED)

Scoped but NOT built:
- pgvector embeddings of venture profiles for semantic similarity queries
- Analytics dashboard: experiment results, calibration curves, archetype accuracy trends
- Pattern detection: "hardware ventures with moat score < 40 always die at Stage 5"

---

## Pre-Build Design Decisions (From Prior Triangulation)

These were validated before implementation:
1. **Bayesian over frequentist** — At 5-20 ventures/month, frequentist needs ~400/arm; Bayesian reduces by ~75%
2. **Three-signal Chairman tracking** — Algorithmic recommendation, Chairman decision, Override flag (blind evaluation)
3. **Shadow testing** — Both variants scored for every venture (within-subject); assigned variant used for progression, other logged
4. **3x repetition per prompt** — Establish intra-prompt variance baseline
5. **JSONB-first data layer** — pgvector deferred to Phase 4
6. **Tiered telemetry** — P0 (scores + gates) through P3 (semantic metadata)

---

## End-to-End Flow

```
1. Run experiment-baseline.js → accuracy baseline + go/no-go decision
2. Create experiment: { name: "acquirability-v2", hypothesis: "Structured rubric improves Stage 3 prediction", variants: [{key: "control"}, {key: "rubric-v2"}] }
3. Start experiment → status: running
4. New venture enters Stage 0 → orchestrator checks for active experiment
5. Hash bucketing assigns venture to control or treatment
6. Dual evaluator runs both prompts → scores recorded (background, non-blocking)
7. Venture progresses through pipeline → at kill gates, recordGateSignal emits telemetry
8. Periodically: experiment-results.js → Bayesian analysis → P(better), credible intervals, stopping recommendation
9. When P(winner) >= 0.95 or max 200 samples → stop, promote winner to active prompt in leo_prompts
```

---

## Part 1: Ground-Truth Audit

Classify each component using these categories:

| Status | Definition |
|--------|-----------|
| **WORKS** | Code exists + integrated into production paths + has user/system entry point |
| **DISCONNECTED** | Code exists but not called by production code or missing integration |
| **STUBBED** | Function exists but returns placeholder / incomplete |
| **PLANNED** | In docs only, no implementation |
| **MISSING** | Not found in either repository |

### Audit Table

Fill in your classification for each component based on the evidence provided:

| # | Component | Claimed Status | Evidence Provided | Your Classification | Issues Found |
|---|-----------|---------------|-------------------|--------------------|----|
| A1 | Gate signal recording (stage-gates.js) | Wired into kill gates | Code at stage-gates.js:185-190 | ? | ? |
| A2 | Materialized view (stage_zero_experiment_telemetry) | Created in database | RPC call in baseline script | ? | ? |
| A3 | Baseline script (experiment-baseline.js) | Complete, runnable | 202-line script with CLI flags | ? | ? |
| B1 | PromptLoader service | Complete | 103-line module | ? | ? |
| B2 | Prompt migration CLI | Migrates 14 prompts | 177-line script, BUT only 1 source registered | ? | ? |
| B3 | Stage 0 file wiring (14 files) | All 14 wired to getPrompt() | Only 1 of 14 has getPrompt import/call | ? | ? |
| C1 | Experiment DB tables (3) | Created | Referenced in CRUD operations | ? | ? |
| C2 | Experiment manager | CRUD lifecycle | 167-line module, 7 exports | ? | ? |
| C3 | Experiment assignment | Deterministic bucketing | 114-line module, SHA-256 hash | ? | ? |
| C4 | Dual evaluator | Parallel variant evaluation | 139-line module, Promise.allSettled | ? | ? |
| C5 | Bayesian analyzer | Full statistical engine | 391-line module, all math from scratch | ? | ? |
| C6 | Stage 0 orchestrator integration | Experiment hook wired | Code at stage-zero-orchestrator.js:113-143 | ? | ? |
| C7 | CLI scripts (4) | Complete, runnable | 4 scripts with flag parsing | ? | ? |
| C8 | Frontend experiment view | Connected to framework | ABTestingTab uses DIFFERENT schema | ? | ? |
| D1 | Semantic memory (pgvector) | Deferred | No code | ? | ? |
| D2 | Analytics dashboard | Deferred | No code | ? | ? |

### Specific Audit Questions

1. Component B2/B3: The migration script registers 1 prompt source but the PRD claimed 14. The wiring only exists in 1 file. Is Phase B fundamentally incomplete, or is this a reasonable MVP that demonstrates the pattern?

2. Component A1: `recordGateSignal` does not check `isTrackedBoundary()`. It records all signals regardless of boundary. The `TRACKED_BOUNDARIES` array and `isTrackedBoundary()` function are dead code in the recording path. Is this a bug or a feature?

3. Component C6: The dual evaluation runs as fire-and-forget (`evaluateDual(...).then().catch()`). If the Node process exits before completion, outcomes are lost. Is this acceptable for a background enrichment step, or does it need a queue?

4. Component C8: The EHG frontend has an ABTestingTab that uses a completely different schema (`prompt_ab_tests`). Should this be flagged as a DISCONNECTED UI that needs to be rewired to the new `experiments` tables?

---

## Part 2: Design Critique

### Statistical Methodology

5. **Binary conversion**: Score > 50 = success, ≤ 50 = failure. A venture scoring 51 is statistically identical to one scoring 99. What information is lost? Should the analyzer use continuous distributions (e.g., Beta regression on raw scores, Gaussian process) instead of or in addition to the binary model?

6. **Sample size reality**: At 5-20 ventures/month with min 20 per arm (40 total), one experiment takes 2-8 months. Is this framework over-engineered for the data volume? Would a simpler approach (historical before/after, expert review) capture 80% of the value?

7. **Stopping rules**: Min 20, max 200, P >= 0.95. What happens at 200 samples with P = 0.80 (inconclusive)? The code returns status "conclusive" only when `shouldStop=true` — an inconclusive result with max samples would show `STOP: Maximum samples reached (200)` without declaring a winner. Is this sufficient?

8. **3x repetition gap**: The pre-build triangulation recommended 3x repetition per prompt to measure intra-prompt variance (LLMs are stochastic). The dual evaluator runs each variant ONCE per venture. This was a validated design decision that appears unimplemented. How significant is this gap?

9. **Prior sensitivity**: Uniform Beta(1,1) prior. With 20 observations, the prior accounts for ~10% of the posterior. Should Phase A's baseline calibration inform the prior (empirical Bayes)?

10. **Monte Carlo precision**: 10,000 samples for P(A > B). Standard error ≈ 0.005. Is this sufficient? What's the cost/benefit of 100K?

### Architecture & Implementation

11. **Hand-rolled statistics**: Every distribution function (gamma, beta, normal, incomplete beta) implemented from scratch (391 lines). Zero external dependencies. What's the bug risk compared to a validated library like `jstat`? Is there a principled reason to avoid the dependency?

12. **Hash bucketing uniformity**: 32 bits (8 hex chars) mapped to [0,1) for populations of 20-200. Is the distribution uniform enough at these sizes? Expected imbalance?

13. **PromptLoader cache**: 5-min TTL, in-memory, single-process. In multi-process or serverless environments, each process has its own cache. Is this a real concern for this system?

14. **No "paused" state**: Experiment lifecycle is draft → running → stopped → archived. What if you need to pause mid-experiment (holiday, system migration) without losing the ability to resume?

15. **Outcome recording resilience**: Dual evaluator records outcomes but has no retry or dead-letter mechanism. Combined with fire-and-forget integration, outcomes could be silently lost. How should this be hardened?

### Missing Capabilities

16. **Chairman override tracking**: The pre-triangulation emphasized 3-signal tracking (algorithmic recommendation, Chairman decision, override flag) with blind evaluation. The gate signal records pass/fail but doesn't separately track Chairman overrides. How well is this actually implemented?

17. **Experiment conflict**: What prevents two experiments from running simultaneously on overlapping components? If Experiment A tests acquirability prompts and Experiment B tests moat prompts, `getActiveExperiment()` returns only the first running experiment. Is multi-experiment support needed?

18. **Winner promotion**: When an experiment concludes with a winner, `experiment-results.js` prints "Consider updating the default prompt configuration." There's no automated promotion to `leo_prompts`. Should there be?

19. **Rollback mechanism**: If a promoted prompt performs worse after deployment (winner's curse, distribution shift), how would this be detected and rolled back?

### Phase D Recommendations

20. What should Phase D (Semantic Memory + Analytics Dashboard) actually contain? Prioritize the components by value.

21. Is pgvector the right tool for semantic memory given Supabase is already in the stack? Or would a dedicated vector DB be better?

22. What's the minimum viable dashboard? What 3-5 visualizations would be most actionable for the Chairman?

23. Should the system proactively alert when experiments reach significance, or only respond to manual status checks?

### Strategic

24. The pre-triangulation recommended testing "different scoring architectures (chain-of-thought vs. rubric vs. multi-agent)" not just prompt variants. Does the current framework support architecture-level experiments, or only prompt text swaps?

25. Stage 0 scores are generated instantly but kill gate outcomes arrive weeks/months later. How does this temporal gap affect experiment design and the usefulness of real-time stopping rules?

---

## Deliverable Format

Please provide:

1. **Ground-Truth Audit Table** — Your classification for each component (WORKS/DISCONNECTED/STUBBED/PLANNED/MISSING) with justification
2. **Overall Score** (1-10) — Implementation quality and production-readiness
3. **Top 3 Strengths** — What's genuinely well done
4. **Top 5 Critical Issues** — Ranked by severity, with specific fix recommendations
5. **Statistical Methodology Verdict** — Is the Bayesian Beta-Binomial approach sound? What would you change?
6. **Phase D Blueprint** — Prioritized scope for semantic memory + dashboard
7. **Recommended First Experiment** — Specific hypothesis, variants, sample size, expected duration, success criteria
8. **Alternative Approaches** — Fundamentally different approaches to consider
