# lib/eva — EVA (Enterprise Venture Analysis) Module

Core orchestration library for the Venture Lifecycle Infrastructure. Manages venture stage execution, decision filtering, artifact persistence, and cross-venture learning.

---

## Entry Point

```js
import { processStage, run } from './eva-orchestrator.js';
// or via barrel:
import { processStage, VentureContextManager } from '../eva/index.js';
```

---

## Key Modules

### Orchestration

| File | Purpose |
|------|---------|
| `eva-orchestrator.js` | Core orchestration loop: load context → execute stage → filter decision → persist artifacts → advance stage |
| `eva-orchestrator-helpers.js` | Extracted helpers: result building, artifact persistence, idempotency checks, artifact merging, stage template loading |
| `orchestrator-state-machine.js` | State machine for orchestrator lifecycle (IDLE → PROCESSING → COMPLETED/FAILED) |
| `stage-execution-engine.js` | Executes sub-agents within a stage |
| `eva-master-scheduler.js` | Schedules stage execution across ventures |

### Decision Filtering

| File | Purpose |
|------|---------|
| `decision-filter-engine.js` | DFE: routes ventures to AUTO_PROCEED, REQUIRE_REVIEW, or STOP based on confidence |
| `dfe-context-adapter.js` | Adapts stage context to DFE input format |
| `filter-calibration.js` | Calibrates DFE thresholds over time |
| `autonomy-model.js` | Pre-checks whether autonomous execution is allowed |
| `devils-advocate.js` | Devil's advocate review at gated boundaries |

### Context & State

| File | Purpose |
|------|---------|
| `venture-context-manager.js` | Loads and caches venture context from database |
| `chairman-preference-store.js` | Loads chairman auto-proceed preferences |
| `chairman-decision-watcher.js` | Creates/polls `chairman_decisions` records; supports advisory-only notifications |
| `chairman-decision-timeout.js` | Timeout handling for pending chairman decisions |
| `chairman-dashboard-scope.js` | Defines what appears in the chairman dashboard |

### Gates & Recovery

| File | Purpose |
|------|---------|
| `reality-gates.js` | Stage boundary validation (gated boundaries require chairman approval) |
| `gate-failure-recovery.js` | Recovery strategies for failed stage gates |
| `constraint-drift-detector.js` | Detects when venture constraints drift from original plan |

### Artifacts & Persistence

| File | Purpose |
|------|---------|
| `template-applier.js` | Applies stage templates to produce structured artifacts |
| `template-extractor.js` | Extracts structured data from stage artifacts |
| `inline-analysis-adapter.js` | Adapts analysis results for inline artifact storage |

### Learning & Optimization

| File | Purpose |
|------|---------|
| `cross-venture-learning.js` | Propagates learnings across ventures |
| `historical-pattern-matcher.js` | Matches current venture against historical patterns |
| `intelligence-loader.js` | Loads intelligence context for stage execution |
| `portfolio-optimizer.js` | Cross-portfolio venture prioritization |
| `feedback-dimension-classifier.js` | Classifies feedback along structured dimensions |
| `feedback-dimension-aggregator.js` | Aggregates classified feedback |

### Lifecycle & Coordination

| File | Purpose |
|------|---------|
| `lifecycle-sd-bridge.js` | Converts sprint outputs to Strategic Directives |
| `post-lifecycle-decisions.js` | Handles decisions after the final lifecycle stage |
| `saga-coordinator.js` | Saga pattern: compensating transactions for rollback |
| `concurrent-venture-orchestrator.js` | Orchestrates multiple ventures in parallel |
| `expand-spinoff-evaluator.js` | Evaluates venture expansion and spinoff opportunities |

### Supporting

| File | Purpose |
|------|---------|
| `observability.js` | `OrchestratorTracer` for distributed tracing |
| `shared-services.js` | Shared event emitter and service registry |
| `rounds-scheduler.js` | Manages analysis round scheduling |
| `ops-cadence-mapper.js` | Maps operational cadence to venture stages |
| `dependency-manager.js` | Checks venture dependencies before stage execution |
| `mitigation-generator.js` | Generates risk mitigations from DFE analysis |
| `escalation-event-persister.js` | Persists escalation events to the database |
| `corrective-priority-calculator.js` | Calculates priority for corrective SDs |
| `contract-validator.js` | Validates stage input/output contracts |
| `venture-monitor.js` | Health monitoring for active ventures |
| `vision-governance-service.js` | Enforces vision governance rules |

---

## Analysis Depth Scaling

The orchestrator scales analysis depth based on remaining token budget (defined in `eva-orchestrator-helpers.js`):

| Budget Remaining | Depth | Behavior |
|-----------------|-------|---------|
| ≥ 60% | `DEEP` | Full analysis, all sub-agents |
| 30–59% | `STANDARD` | Standard analysis |
| < 30% | `SHALLOW` | Minimum viable analysis, prevents BudgetExhaustedError |

---

## Recent Changes

- **SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-020**: Extracted `eva-orchestrator-helpers.js` from `eva-orchestrator.js` to reduce main module size. STATUS, FILTER_ACTION, ANALYSIS_DEPTH constants, and helper functions now live in the helpers module.
- **SD-MAN-FEAT-CORRECTIVE-VISION-GAP-070**: Added advisory DFE mode and budget-aware analysis depth scaling.

---

*Part of LEO Protocol v4.3.3 — EVA (Enterprise Venture Analysis) Infrastructure*
