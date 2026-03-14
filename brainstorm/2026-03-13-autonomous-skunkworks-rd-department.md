# Brainstorm: Autonomous Skunkworks R&D Department

## Metadata
- **Date**: 2026-03-13
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (Shortform Sage, Elysian, MindStack AI, ListingLens AI, CodeShift, LegacyAI, LexiGuard)
- **Related Brainstorms**:
  - "Stage Zero Experimentation Framework" (2026-03-10, sd_created)
  - "Close the Experiment Feedback Loop" (2026-03-11, needs_triage)
  - "Automated Pipeline Runner" (2026-03-11, sd_created)
- **Source Material**: Greg Isenberg / Karpathy auto-research video analysis

---

## Problem Statement

EHG has a proven experimentation pattern (gate 3/5 weight tuning that calibrated venture scoring and fed into prompting strategy) but it remains manually orchestrated and narrowly scoped. The system also has an Anthropic release monitor that detects new Claude Code features but only notifies — it doesn't act. The opportunity is to build a fully autonomous R&D department that continuously generates, evaluates, promotes, and kills experiments across the entire EHG ecosystem: LEO protocol, EHG app, and individual ventures.

The core risk: experiments could have significant negative codebase impact if applied without proper evaluation and containment.

## Discovery Summary

### Constraint: Full Automation Required
The primary constraint isn't compute, safety, or review bandwidth in isolation — the user requires full automation. No human review bottleneck. The system must be trustworthy enough to operate autonomously.

### Scope: Full Spectrum, Tied to Target Applications
- Experiments on EHG_Engineer (LEO protocol optimization)
- Experiments on EHG app (venture creation process)
- Experiments on individual ventures (each venture has its own experiment surface)
- All experiments tied to target applications
- Agents brainstorm → rank → score → kill bad ideas autonomously

### Ground Truth: Progressive Trust with Multi-Metric Consensus
Recommended approach: new experiment types start in "sandbox" mode (propose only). After track record of N successes with zero regressions, earn "auto-apply" privileges. All experiments must pass multi-metric consensus — primary metric improved AND no degradation in safety basket (test pass rate, gate scores, downstream metrics).

### Cadence: Scheduled Batches (with Event Hooks)
Nightly/weekly batch runs for exploratory R&D. Event-triggered experiments for urgent signals (Anthropic releases, gate score drops).

### Anthropic Integration: Auto-Experiment on New Features
When release monitor detects new Claude Code features, auto-create experiments to test impact on EHG workflows. Extends existing monitor→analyze→notify→approve→route pipeline.

### Gate 3/5 Precedent
User confirmed the gate weight tuning experiments worked well — proved the concept of automated calibration loops that feed back into prompting strategy. This is the foundation to build on.

## Analysis

### Arguments For
1. **Proven pattern** — Gate 3/5 weight tuning demonstrated the experiment loop works for scoring calibration
2. **70% of infrastructure exists** — Bayesian analyzer, meta-optimizer, experiment lifecycle, auto-iteration, prompt promotion all built
3. **Compounding returns** — Each venture becomes an experiment surface for discoveries in sibling ventures (8 active ventures = combinatorial discovery potential)
4. **Anthropic release pipeline becomes generative** — Passive monitoring transforms into active capability absorption
5. **Solo founder force multiplier** — Autonomous R&D adds a "team" that works 24/7 without management overhead

### Arguments Against
1. **Observer-is-the-subject paradox** — Experimenting on LEO protocol modifies the evaluation engine that judges experiments (circular trust problem)
2. **Sample size bottleneck** — Low venture volume means experiments wait weeks for statistical significance (min_observations_per_variant enforcement)
3. **Maintenance scales linearly** — Every new experiment type requires metric definitions, safety baskets, and kill criteria
4. **Interaction effects** — Multiple concurrent experiments that individually pass but jointly regress require multi-variate tracking (not yet built)

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. **Experiment isolation**: LEO protocol experiments could mutate the orchestration layer that manages all other experiments — the observer IS the subject
  2. **State explosion from concurrent experiments**: No concept of experiment partitioning or multi-variate interaction tracking in current schema
  3. **Kill/promote metric curation**: Every new experiment type needs bespoke metric definitions — this work scales linearly and resists automation
- **Assumptions at Risk**:
  1. Progressive trust assumes stable codebase — but with 30+ modified files per session, the trust baseline keeps shifting
  2. Nightly batch cadence may produce stale experiments during bursty SD periods
  3. Anthropic release monitor's narrow pipeline doesn't generalize to "brainstorm experiments from any signal" without category-level changes
- **Worst Case**: Auto-promoted experiments that individually pass metrics but collectively degrade system behavior. No interaction tracking means manual audit of every promoted experiment to find the combination that caused regression. More human review work than the system was designed to eliminate.

### Visionary
- **Opportunities**:
  1. **Experiment-as-a-Primitive**: Elevate "experiment" from workflow concept to composable infrastructure primitive with a standard interface contract (hypothesis, target, metric bindings, kill/promote criteria, sandboxed execution). Any agent/pipeline/venture can spawn experiments.
  2. **Trust Gradient Engine**: Progressive trust becomes a universal promotion/demotion mechanism — not just for experiments but for agents, ventures, models. Bayesian prior per entity, updated on evidence.
  3. **Cross-Venture Pollination**: Successful experiments auto-generalize into parameterized templates, matched against venture capability profiles. 8 ventures = experiment surface multiplier.
- **Synergies**:
  - Anthropic release monitor emits experiment primitives instead of notifications
  - Stage Zero scoring + EVA gates become both consumer and producer of experiments
  - LEO protocol becomes execution substrate — successful experiments decompose into SDs
  - Fleet/multi-session architecture distributes experiment execution via existing claim system
- **Upside Scenario**: By month 9, the system predicts which experiment categories will succeed before running them. Infrastructure has its own learning rate. Adding ventures accelerates returns across the entire portfolio — a self-improving venture engine.

### Pragmatist
- **Feasibility**: 7/10 (High difficulty, but 70% of foundation exists)
- **Resource Requirements**:
  - Time: 11-16 weeks of focused development across 4 phases
  - Money: ~$200-400/month incremental LLM costs if volume scales significantly
  - People: Solo founder + parallel Claude Code sessions (existing fleet coordination handles this)
- **Constraints**:
  1. **Sample size is structural**: Experiments need 20+ observations per variant arm; venture volume is low. System must be designed around experiment queues, not rapid iteration.
  2. **Code-modifying experiments need blast radius containment**: Current framework only modifies prompts/weights (config experiments). Code experiments need worktree isolation + test gates + auto-rollback — none of which exist yet.
  3. **Cross-repo coordination has no pattern**: Experiments targeting EHG app or ventures need cross-repo tracking, unified outcome measurement, and consistent rollback semantics.
- **Recommended Path**:
  - **Phase 1 (Weeks 1-3)**: Generalize experiment framework + build proposal agent
  - **Phase 2 (Weeks 4-6)**: Scheduled autonomous execution loop (nightly batch)
  - **Phase 3 (Weeks 7-9)**: Progressive trust system + multi-metric consensus guard
  - **Phase 4 (Weeks 10-12)**: Cross-repo experiment support (EHG app)
  - **Phase 5 (Weeks 13-16)**: Code-modifying experiments with worktree isolation + test gates
  - **Go/No-Go at Week 6**: Has the autonomous proposal agent generated at least 3 experiments with actionable calibration improvements?

### Synthesis
- **Consensus Points**:
  1. Start with config experiments (prompts, weights, thresholds), defer code-modifying experiments
  2. Progressive trust is the right governance model — reusable as an architectural primitive
  3. Cross-venture pollination is the real month 6+ value unlock
- **Tension Points**:
  1. Batch cadence vs event-driven (resolve: hybrid approach)
  2. Scope ambition vs complexity (resolve: phase by target application)
  3. Full automation vs observer-is-the-subject (resolve: immutable evaluation path for protocol-level experiments)
- **Composite Risk**: Medium

## Key Architectural Decisions

### 1. Experiment Domain Hierarchy
```
experiment_domain:
  - scoring_prompt      (Phase 1 — proven with gate 3/5)
  - gate_threshold      (Phase 1 — config-level)
  - config_parameter    (Phase 1 — database rows)
  - workflow_rule       (Phase 3 — handoff/routing rules)
  - code_change         (Phase 5 — requires worktree isolation)
```

### 2. Observer Protection Rule
Protocol-level experiments (anything touching `lib/eva/`, gate logic, or experiment infrastructure) must be evaluated by an immutable evaluation path that is NOT itself subject to experimentation. This prevents the circular trust problem.

### 3. Experiment Interface Contract
Standard envelope for all experiments regardless of source:
```json
{
  "hypothesis": "string",
  "target_application": "ehg_engineer | ehg_app | venture:<id>",
  "experiment_domain": "scoring_prompt | gate_threshold | ...",
  "primary_metric": { "name": "string", "direction": "higher | lower" },
  "safety_basket": [{ "name": "string", "threshold": "number" }],
  "kill_criteria": { "max_duration_days": 14, "min_observations": 20 },
  "trust_level": "sandbox | monitored | auto_apply"
}
```

### 4. Progressive Trust Thresholds
| Level | Requirements | Permissions |
|-------|-------------|-------------|
| Sandbox | New experiment type, no track record | Propose only, no apply |
| Monitored | 3+ successes, 0 regressions | Auto-apply with rollback window |
| Auto-Apply | 5+ successes, 0 regressions, 30+ days | Full autonomy |

## Existing Infrastructure (Key Files)
- `lib/eva/experiments/experiment-manager.js` — CRUD lifecycle
- `lib/eva/experiments/experiment-lifecycle.js` — Bayesian stopping rules, maturity checks
- `lib/eva/experiments/experiment-assignment.js` — Thompson Sampling + hash bucketing
- `lib/eva/experiments/auto-iteration.js` — Auto-iteration loop with safety limits
- `lib/eva/experiments/meta-optimizer.js` — LLM-guided prompt perturbation
- `lib/eva/experiments/prompt-promotion.js` — Confidence-gated promotion
- `lib/eva/experiments/calibration-report.js` — FPR/FNR, threshold analysis
- `lib/eva/experiments/gate-outcome-bridge.js` — Kill gate signal interception
- `lib/eva/stage-zero/stage-zero-orchestrator.js` — Experiment assignment + dual evaluation
- `lib/integrations/claude-code/release-monitor.js` — Anthropic release detection
- `lib/integrations/claude-code/release-analyzer.js` — Relevance scoring + classification
- `lib/plugins/anthropic-scanner.js` — Plugin discovery + fitness scoring

## Open Questions
1. How should multi-variate interaction effects be detected? (Two individually-beneficial experiments that jointly regress)
2. What is the immutable evaluation path for protocol-level experiments? (Separate scoring service? Snapshot-based comparison?)
3. How does the trust gradient engine handle model changes from Anthropic? (Does a new Claude model reset all trust levels?)
4. Should experiment templates be versioned in the database or in code?

## Suggested Next Steps
1. **Create vision document** — Formalize the Skunkworks R&D architecture with all sections
2. **Register in EVA** — Vision + architecture plan for HEAL scoring
3. **Create SD** — Orchestrator SD with phased children (config experiments → scheduled loop → trust system → cross-repo → code experiments)
