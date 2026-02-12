# EVA Platform Architecture: Shared Services Model

> **Version**: 1.3
> **Created**: 2026-02-12
> **Status**: Draft
> **Companion**: [EVA Venture Lifecycle Vision v4.6](eva-venture-lifecycle-vision.md) (34 Chairman decisions)
> **Inputs**: Existing EHG database schema, EVA orchestration migrations, LEO Protocol codebase, brainstorming decisions (2026-02-11), Stage 0 CLI implementation (`lib/eva/stage-zero/`), CLI-vs-GUI triangulation analysis (Stages 1-25)
> **v1.1 Changes**: Chairman Decision Interface (Section 9), resequenced implementation phases (Section 11), Saga Management for multi-step operations (Section 13)
> **v1.2 Changes**: Stage 0 Venture Ideation Pipeline (Section 14) documenting existing implementation, Service Registry updated, Phase A test scenario extended to start from Stage 0, Chairman Review interactivity gap identified
> **v1.3 Changes**: Codebase reconciliation — 10 components previously listed as "Needs Building" already exist and are production-ready. Inventory corrected, Phase A resequenced to reflect actual state. Added Devil's Advocate, Constraint Drift Detector, Orchestrator Tracer, and State Machine to inventory. Cross-referenced against CLI-vs-GUI triangulation analysis (Stages 1-25).

---

## 1. System Overview

### Entity Hierarchy

```
EHG (Organization)
  └── Portfolios (investment groupings with ROI targets)
       └── Companies (legal entities)
            └── Ventures (individual products/startups, 25-stage lifecycle)
                 └── Stage Artifacts (per-stage outputs, immutably versioned)
```

**Current database state**: 8 portfolios, 90 companies, 689 ventures, 25 lifecycle stages configured.

### Organizational Model

```
CHAIRMAN (Human - The Only Human)
  Reviews: Brand (Stage 10), Release (Stage 22), Venture Future (Stage 25), DFE escalations
  Interface: Chairman Dashboard (monitoring + decision queue)
  Authority: Absolute. No timeout. Ventures wait indefinitely.

EVA (Orchestration Hub)
  ┌──────────────────────┬────────────────────┬──────────────────────┐
  │ Events (urgent)      │ Rounds (routine)   │ Priority Queue       │
  │ DFE escalations,     │ Ops cycles,        │ (planned work)       │
  │ Reality Gate failures,│ health checks,     │ Stage progressions,  │
  │ metric anomalies     │ portfolio reviews   │ SD creation          │
  └──────────────────────┴────────────────────┴──────────────────────┘

SHARED SERVICES (stateless, context-loaded)
  ┌───────────┬─────────────┬───────────────┬─────────────┬──────────┐
  │ CEO       │ Marketing   │ Finance       │ Legal       │ LEO      │
  │ Service   │ Service     │ Service       │ Service     │ (Eng)    │
  └───────────┴─────────────┴───────────────┴─────────────┴──────────┘
  Each service loads venture context on demand. No dedicated agents per venture.

VENTURE DATA (source of identity)
  ┌──────────┬──────────┬──────────┬──────────┐
  │Venture A │Venture B │Venture C │  ... N   │
  │ stages, artifacts, decisions, metrics,    │
  │ dependencies, health scores, history      │
  └──────────┴──────────┴──────────┴──────────┘
```

### Key Architecture Principles

1. **Agents are stateless services.** Venture identity lives in the database, not in agent instances. Any service can operate on any venture by loading its context.
2. **EVA is the hub, not the brain.** EVA routes work to services, manages the portfolio queue, and enforces scheduling. Individual services contain domain intelligence.
3. **Database is the single source of truth.** All state, all decisions, all artifacts live in Supabase. No markdown files as source of truth. No in-memory state that isn't backed by a database record.
4. **Existing infrastructure first.** The EHG database already has ~70% of the required tables. Architecture builds on what exists rather than replacing it.
5. **AI-only operation.** No human operators, support agents, or manual reviewers. Every operational function is an automated service.

---

## 2. Shared Services Model

### Principle: Stateless Services, Database-Backed Identity

Every service follows the same pattern:

```
Service receives task (venture_id, action, context)
    │
    ├── Load venture context from DB (current_lifecycle_stage, artifacts, history)
    ├── Load portfolio context if needed (inter-venture dependencies, portfolio health)
    ├── Execute domain logic (LLM analysis, deterministic checks, external API calls)
    ├── Write results to DB (artifacts, decisions, metrics)
    └── Emit event to EVA event bus (stage_completed, decision_needed, alert)
```

No service maintains state between invocations. A CEO Service invocation for Venture A and Venture B are identical processes loading different context. This enables unlimited concurrent ventures without scaling agent instances.

### Service Registry

| Service | Domain | Key Responsibilities | Existing Infrastructure |
|---------|--------|---------------------|------------------------|
| **Stage 0 Pipeline** | Venture ideation | 3 entry paths (competitor teardown, blueprint browse, discovery mode), 8-component synthesis engine, evaluation profiles, financial modeling, venture nursery | `lib/eva/stage-zero/` (fully implemented), 15+ database tables |
| **CEO Service** | Strategy & coordination | Stage orchestration, analysisStep execution (Stages 1-25), cross-stage synthesis, advisory generation | `lib/eva/eva-orchestrator.js` (`processStage()`, `run()`), `ai_ceo_agents` table, stage templates (1-25), DFE + Reality Gates + Devil's Advocate integrated |
| **LEO Service** | Engineering execution | SD creation, PRD generation, code implementation, QA, deployment | Full LEO Protocol (EHG_Engineer), SD Bridge at Stage 18 |
| **Finance Service** | Financial analysis | Unit economics (Stage 5), P&L (Stage 16), token budget management, cost tracking | `venture_token_budgets`, `venture_phase_budgets`, `venture_budget_transactions` |
| **Marketing Service** | GTM & growth | GTM strategy (Stage 11), channel analysis, growth optimization (Stage 25 expand) | TBD (flagged for deep research in Step 6) |
| **Legal Service** | Compliance | ToS/privacy generation, GDPR/CCPA compliance, regulatory checks | Template library approach (Vision Decision #22) |
| **Sales Service** | Revenue operations | Sales model (Stage 12), pricing optimization, conversion tracking | Stage 12 template exists |
| **Analytics Service** | Metrics & insights | AARRR metrics (Stage 24), venture health scoring, cross-venture pattern detection | `orchestration_metrics`, health_score columns |
| **Brand Service** | Identity & design | Brand generation (Stage 10), naming, visual direction | `venture_archetypes` (5 defaults), `cultural_design_styles` |

### How Services Load Venture Context

```sql
-- Core context query (every service invocation starts here)
SELECT
  v.id, v.name, v.status, v.current_lifecycle_stage,
  v.problem_statement, v.raw_chairman_intent,
  v.health_score, v.health_status, v.vertical_category,
  v.moat_strategy, v.strategic_context,
  lsc.stage_name, lsc.work_type, lsc.sd_required, lsc.depends_on,
  lp.phase_name
FROM ventures v
JOIN lifecycle_stage_config lsc ON lsc.stage_number = v.current_lifecycle_stage
JOIN lifecycle_phases lp ON lp.id = lsc.phase_number
WHERE v.id = $1;

-- Stage artifacts (consumed by analysisStep)
SELECT artifact_type, content, quality_score, epistemic_classification, version
FROM venture_artifacts
WHERE venture_id = $1 AND is_current = true
ORDER BY lifecycle_stage;

-- Pending decisions (for DFE evaluation)
SELECT * FROM chairman_decisions
WHERE venture_id = $1 AND decision IS NULL
ORDER BY created_at;
```

### CEO Service: The Stage Orchestrator

The CEO Service is the primary executor of the 25-stage lifecycle. For each stage, it:

1. **Loads venture context** (all prior stage artifacts)
2. **Runs the analysisStep** (LLM synthesis consuming prior data)
3. **Evaluates the Decision Filter Engine** (6 triggers against stage output)
4. **Writes stage artifact** to `venture_artifacts` with quality score and epistemic classification
5. **Evaluates Reality Gates** at phase boundaries
6. **Advances the venture** via `fn_advance_venture_stage()` if gates pass
7. **Creates Chairman decisions** if DFE triggers fire or stage is mandatory (10, 22, 25)

The CEO Service does NOT do engineering work. When Stage 18 produces sprint items, it hands off to the LEO Service via the SD Bridge. The CEO Service resumes when the LEO Service reports completion.

---

## 3. EVA Orchestration Hub

### Three Trigger Types

EVA processes work through three channels, each with different urgency and scheduling:

| Channel | Urgency | Examples | Processing |
|---------|---------|---------|------------|
| **Events** | Immediate | DFE escalation, Reality Gate failure, metric anomaly, Chairman decision submitted | Process within seconds. Interrupt current work if needed. |
| **Rounds** | Scheduled | Ops cycles (Stage 24-25), health checks, portfolio reviews, weekly summaries | Process on cadence. Risk-adaptive frequency per venture. |
| **Priority Queue** | Planned | Stage progressions, SD creation, artifact generation, template extraction | Process by priority ranking. Value-based ordering (Decision #27). |

### Event Bus Architecture

**Already built**: `eva_event_log` table, `evaEventBus.ts` TypeScript implementation with pub/sub, retry, circuit breaker, and DLQ integration.

**Event types** (already defined in code):
```
Venture lifecycle:  venture.created, .activated, .paused, .completed, .archived
Stage lifecycle:    stage.entered, .work_started, .work_completed, .review_started,
                    .approved, .rejected, .recursion
Task contracts:     contract.created, .claimed, .started, .completed, .failed, .timeout
EVA advisory:       eva.recommendation, .insight, .alert
Chairman:           chairman.approval, .rejection, .override
System:             system.health_change, .degradation, .recovery
```

**What needs wiring**: Event handlers that subscribe to these events and trigger service invocations. The bus publishes events; nothing currently listens.

### Task Contract System

**Already built**: `agent_task_contracts` table with full lifecycle management (pending → assigned → in_progress → completed/failed/timeout).

A task contract is the unit of work between EVA and a service:

```
EVA creates contract:
  {
    parent_agent: "EVA",
    target_agent: "CEO_SERVICE",
    venture_id: "uuid",
    action: "execute_analysis_step",
    stage: 7,
    token_budget: 50000,
    timeout: "30 minutes",
    priority: 3,
    context: { prior_artifacts: [...] }
  }

Service claims contract → executes → writes result → marks complete
EVA receives completion event → routes next work
```

### Dead Letter Queue

**Already built**: `eva_event_dlq` table for failed events.

Failed events are preserved for analysis and manual replay. The DLQ captures the original event, failure reason, and retry count. EVA monitors DLQ depth as a system health signal.

### Circuit Breaker

**Already built**: `evaCircuitBreaker.ts` with venture-specific circuit breakers.

- **CLOSED** (healthy): Requests pass through normally
- **OPEN** (failing): Requests blocked after 3 consecutive failures. Chairman notified.
- **HALF_OPEN** (recovery): Test requests allowed after 5-minute cooldown

Circuit breakers prevent cascading failures across ventures. If Venture A's CEO Service invocations fail repeatedly, Venture A's circuit opens without affecting Venture B.

### Multi-Venture Coordination

EVA manages the portfolio as a whole, not just individual ventures:

1. **Priority Queue**: Ventures ranked by expected value (Decision #27). Financial projections, market opportunity, health score, and stage maturity determine ordering.
2. **Dependency Graph**: Ventures declare inter-venture dependencies (Decision #32). EVA auto-blocks dependent ventures and boosts providers.
3. **Resource Contention**: When shared resources contend, EVA schedules by priority with DFE escalation for high-priority delays (Decision #28).
4. **Cross-Venture Learning**: Portfolio knowledge base fed by every stage outcome (Decision #26). Templates extracted from successful ventures (Decision #29).

---

## 4. Layered Scheduling

Three scheduling layers coexist, each with different scope and frequency:

### Layer 1: EVA Master Scheduler (Portfolio-Level)

EVA's master scheduler manages portfolio-wide priorities:

| Task | Frequency | Trigger |
|------|-----------|---------|
| Portfolio health scan | Every 6 hours | Timer |
| Venture priority re-ranking | After any stage completion or decision | Event |
| Dependency graph evaluation | After any venture stage change | Event |
| Template extraction | After venture reaches Stage 25 with continue/exit | Event |
| Cross-venture knowledge sync | Daily | Timer |
| Chairman notification batching | Daily digest + immediate for blocking | Timer + Event |

### Layer 2: Service Self-Scheduling (Routine Tasks)

Each service manages its own routine work within its domain:

| Service | Self-Scheduled Tasks | Frequency |
|---------|---------------------|-----------|
| **Finance** | Budget utilization reports, cost anomaly detection | Daily |
| **Analytics** | AARRR metric collection, trend analysis | Per venture health cadence |
| **Legal** | Compliance template updates, regulatory monitoring | Weekly |
| **LEO** | SD queue processing, test suite maintenance | Continuous |

### Layer 3: Venture Config Layer (Per-Venture Cadence)

Each venture has a cadence determined by its stage and risk profile (Decision #6):

| Venture State | Ops Cycle (24-25) | Health Check | Chairman Summary |
|---------------|:-----------------:|:------------:|:----------------:|
| New / high-risk | Weekly | Daily | Weekly |
| Moderate risk | Bi-weekly to monthly | Every 3 days | Bi-weekly |
| Stable / low-risk | Monthly to quarterly | Weekly | Monthly |

Cadence adjusts automatically based on `venture_health` score from Stage 25. The system escalates cadence (more frequent) when health declines and relaxes it when health stabilizes.

### How Layers Coexist

```
EVA Master Scheduler
  │
  ├── Emits "round.portfolio_health_scan" every 6 hours
  │     └── Each service checks its domain health for all ventures
  │
  ├── Emits "round.venture_ops_cycle" per venture cadence
  │     └── CEO Service runs Stages 24-25 for that venture
  │
  └── Processes Priority Queue continuously
        └── Picks highest-priority unblocked venture task
            └── Dispatches to appropriate service via task contract

Service Self-Scheduling
  │
  └── Finance Service internally schedules daily budget reports
      Analytics Service internally schedules metric collection
      (These run independently of EVA's scheduling)

Venture Config Layer
  │
  └── Venture A: weekly ops cycle (new, high-risk)
      Venture B: monthly ops cycle (stable, low-risk)
      Venture C: bi-weekly ops cycle (moderate risk)
      (Config stored in DB, read by EVA master scheduler)
```

---

## 5. Venture Data Model

### Core Tables (Existing)

| Table | Rows | Purpose | Status |
|-------|:----:|---------|:------:|
| `ventures` | 689 | Core venture metadata (74 columns) | Active |
| `lifecycle_stage_config` | 25 | Stage definitions (work_type, dependencies, SD requirements) | Active |
| `lifecycle_phases` | 6 | Phase groupings | Active |
| `venture_stage_work` | 33 | Per-venture stage progress tracking | Active |
| `venture_stage_transitions` | - | Immutable audit trail of stage changes | Active |
| `venture_artifacts` | 5 | Quality-gated stage artifacts with epistemic classification | Active |
| `chairman_decisions` | 0 | Chairman gate decisions (proceed/pivot/kill/pause) | Ready |
| `venture_token_budgets` | 5 | Per-venture token allocation | Active |
| `venture_phase_budgets` | - | Per-phase token breakdown | Ready |

### Orchestration Tables (Existing, Dormant)

| Table | Purpose | Status |
|-------|---------|:------:|
| `eva_orchestration_sessions` | Multi-agent session tracking | Dormant |
| `eva_agent_communications` | Inter-agent messaging | Dormant |
| `eva_actions` | Action execution with rollback | Dormant |
| `orchestration_metrics` | Performance telemetry | Dormant |
| `agent_task_contracts` | EVA-to-service work units | Dormant |
| `eva_event_log` | Event bus persistence | Dormant |
| `eva_event_dlq` | Dead letter queue | Dormant |
| `eva_alerts` | Tiered alert system (P0/P1/P2) | Dormant |
| `eva_automation_rules` | Class A (auto-fix) and Class B (auto-draft) rules | Dormant |

### Stage Artifact Storage

Each stage produces artifacts stored in `venture_artifacts`:

```
venture_artifacts:
  id: UUID
  venture_id: UUID (FK)
  lifecycle_stage: INT (1-25)
  artifact_type: ENUM (28 types defined)
  content: TEXT (inline)
  file_url: TEXT (external storage)
  version: INT (immutable versioning per Decision #34)
  is_current: BOOLEAN (latest version flag)
  quality_score: INT (0-100)
  validation_status: ENUM (pending, validated, rejected, needs_revision)
  epistemic_classification: ENUM (fact, assumption, simulation, unknown)
  epistemic_evidence: JSONB (source linking)
```

**Immutable versioning** (Decision #34): When a stage re-runs (pivot, retry, ops cycle), a new version is created. Prior versions are preserved with `is_current = false`. Stage 24's Assumptions vs Reality comparison references original versions by stage + version number.

### Cross-Stage Data Contracts

Every stage defines what it consumes and produces via `lifecycle_stage_config`:

```yaml
# Example: Stage 7 (Revenue Architecture)
stage_number: 7
depends_on: [4, 5, 6]   # Consumes Stages 4, 5, 6
required_artifacts:
  - competitive_analysis   # From Stage 4
  - financial_model        # From Stage 5
  - risk_matrix           # From Stage 6
produces:
  - pricing_model          # For Stages 8, 16
```

The CEO Service validates that all required upstream artifacts exist (with `is_current = true` and `validation_status = 'validated'`) before running a stage's analysisStep. Missing or rejected artifacts block stage execution.

### Inter-Venture Dependencies (Decision #32)

```sql
-- New table for inter-venture dependencies
CREATE TABLE venture_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dependent_venture_id UUID REFERENCES ventures(id),
  provider_venture_id UUID REFERENCES ventures(id),
  required_stage INT CHECK (required_stage BETWEEN 1 AND 25),
  dependency_type TEXT CHECK (dependency_type IN ('hard', 'soft')),
  status TEXT CHECK (status IN ('pending', 'met', 'broken')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (dependent_venture_id, provider_venture_id, required_stage)
);
```

EVA's master scheduler checks `venture_dependencies` before dispatching work for any venture. Hard dependencies block; soft dependencies generate warnings.

### Versioned Ops Loop (Stages 24-25)

Each ops cycle is a versioned record:

```sql
-- Each cycle creates versioned artifacts
-- Stage 24, venture X, version 1 → First post-launch metrics
-- Stage 24, venture X, version 2 → Second cycle metrics
-- Stage 25, venture X, version 1 → First review decision
-- Stage 25, venture X, version 2 → Second review decision

-- The version chain enables:
-- "How has retention changed across 5 ops cycles?"
-- "When did the Chairman first signal concern about this venture?"
```

---

## 6. Decision Filter Engine (Architecture)

### Implementation Pattern

The DFE is a **pure function** — no side effects, deterministic given the same inputs:

```javascript
function evaluateDFE(stageOutput, ventureContext, chairmanPreferences) {
  const triggers = [];

  // 1. Cost threshold
  if (stageOutput.estimated_cost > chairmanPreferences.cost_threshold)
    triggers.push({ type: 'cost_threshold', value: stageOutput.estimated_cost });

  // 2. New tech vendor
  if (stageOutput.new_vendors?.length > 0)
    triggers.push({ type: 'new_tech_vendor', vendors: stageOutput.new_vendors });

  // 3. Strategic pivot
  if (detectPivot(stageOutput, ventureContext.prior_stages))
    triggers.push({ type: 'strategic_pivot', details: ... });

  // 4. Low score
  if (stageOutput.gate_score < chairmanPreferences.score_threshold)
    triggers.push({ type: 'low_score', score: stageOutput.gate_score });

  // 5. Novel pattern
  if (!portfolioKnowledge.hasPattern(stageOutput.pattern_signature))
    triggers.push({ type: 'novel_pattern', signature: ... });

  // 6. Constraint drift
  if (detectConstraintDrift(stageOutput, ventureContext.prior_stages))
    triggers.push({ type: 'constraint_drift', drifted_constraints: ... });

  // Output
  if (triggers.length === 0) return { output: 'AUTO_PROCEED', triggers: [] };
  if (hasMitigations(triggers)) return { output: 'PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS', triggers, mitigations };
  return { output: 'PRESENT_TO_CHAIRMAN', triggers };
}
```

### Chairman Preference Store

Thresholds are stored per-venture and globally in `chairman_preferences`:

```sql
-- Global defaults
INSERT INTO chairman_preferences (scope, key, value)
VALUES ('global', 'cost_threshold', '50000'),
       ('global', 'score_threshold', '50');

-- Venture-specific override (loosened for trusted venture)
INSERT INTO chairman_preferences (scope, venture_id, key, value)
VALUES ('venture', 'uuid-here', 'cost_threshold', '100000');
```

The DFE reads venture-specific thresholds first, falling back to global defaults. Over time, the system learns Chairman preferences from past decisions (Decision #26) and recommends threshold adjustments.

---

## 7. LEO Protocol Integration

### The SD Bridge (Stage 18 → LEO)

**Already built**: `lib/eva/lifecycle-sd-bridge.js`

```
Stage 13 (Roadmap) "now" milestones
    │
    ▼
Stage 18 analysisStep generates sprint items
    │
    ▼
SD Bridge (convertSprintToSDs)
    │
    ├── Creates 1 orchestrator SD (sprint-level)
    │   └── metadata: { venture_id, venture_name, sprint_name, sprint_goal }
    │
    └── Creates N child SDs (1 per sprint item)
        └── Each: { title, type, estimated_loc, acceptance_criteria, architecture_layer }
    │
    ▼
LEO Protocol (EHG_Engineer)
    Creates PRDs → Implements code → Runs tests → Ships
```

### Return Path (LEO → Venture Stages)

**Not yet built.** The architecture defines bi-directional sync:

```
LEO SD completion
    │
    ▼
EVA event: "sd.completed" with { sd_id, venture_id, status, test_results }
    │
    ▼
CEO Service processes event:
    ├── Updates venture_stage_work (Stage 19 progress)
    ├── Checks: All child SDs complete?
    │   ├── YES → Advance to Stage 20 (QA)
    │   └── NO → Wait for remaining SDs
    │
    ▼
Stage 20 (QA) analysisStep:
    Consumes: SD test results, code quality metrics
    Produces: quality_decision (pass/conditional_pass/fail)
    Gate: 95% pass threshold
    │
    ▼
Stage 21 (Build Review) → Stage 22 (Release, Chairman decides)
```

### How LEO Reports Back

LEO already produces structured output for every SD:
- **Completion status** (succeeded, failed, blocked)
- **Test results** (pass count, fail count, coverage)
- **Code metrics** (LOC, files changed, dependencies)
- **Issues** (blockers, technical debt)

The return path writes these into `venture_artifacts` for the relevant stage, enabling the CEO Service's analysisStep to synthesize them into gate decisions.

---

## 8. Portfolio Intelligence (Architecture)

### Cross-Venture Knowledge Base (Decision #26)

```
Stage outcome (any venture)
    │
    ▼
Knowledge Extractor
    ├── Calibration data → portfolio_calibration table
    │   (Stage 3 kill thresholds, Stage 5 financial benchmarks)
    │
    ├── Successful patterns → portfolio_patterns table
    │   (Architecture choices, pricing models, GTM channels)
    │
    └── Failure signals → portfolio_anti_patterns table
        (Combinations that correlate with venture failure)
    │
    ▼
Future venture stages consume portfolio knowledge
    (DFE's novel_pattern trigger checks against known patterns)
```

### Venture Templates (Decision #29)

When a venture reaches Stage 25 with "continue" or "exit":

```
Template Extractor analyzes:
    ├── DFE trigger threshold calibrations
    ├── Architecture patterns from Stage 14
    ├── Pricing model from Stage 7
    ├── GTM channel effectiveness from Stage 11/24
    └── Kill gate scoring weights from Stage 3/5

Produces:
    venture_templates table entry:
    {
      domain: "b2b_saas",
      source_venture_id: UUID,
      scoring_thresholds: { ... },
      architecture_patterns: { ... },
      pricing_defaults: { ... },
      gtm_channel_weights: { ... }
    }
```

New ventures at Stage 1 receive template recommendations based on domain similarity.

### Portfolio Prioritization (Decision #27)

EVA's priority queue ranks ventures by expected value:

```sql
-- Priority scoring (simplified)
SELECT
  v.id, v.name,
  (v.projected_revenue * 0.3 +
   v.health_score * 100 * 0.25 +
   v.current_lifecycle_stage / 25.0 * 100 * 0.15 +
   COALESCE(dep.downstream_value, 0) * 0.2 +
   (1.0 / GREATEST(v.dwell_days, 1)) * 100 * 0.1
  ) AS priority_score
FROM ventures v
LEFT JOIN (
  -- Downstream dependency value
  SELECT provider_venture_id,
    SUM(dv.projected_revenue) as downstream_value
  FROM venture_dependencies vd
  JOIN ventures dv ON dv.id = vd.dependent_venture_id
  WHERE vd.status = 'pending'
  GROUP BY provider_venture_id
) dep ON dep.provider_venture_id = v.id
WHERE v.status = 'active'
ORDER BY priority_score DESC;
```

---

## 9. Chairman Dashboard (Architecture)

### Views

The Chairman Dashboard is a **read-only monitoring interface** with a decision queue. It does NOT drive venture progression (CLI does).

| View | Content | Update Frequency |
|------|---------|:----------------:|
| **Decision Queue** | Pending decisions ranked by venture priority. Shows: decision type, venture name, urgency, DFE triggers, recommended action. | Real-time |
| **Health Heatmap** | All ventures at a glance, color-coded by 5-dimension health score. | Every 6 hours |
| **Event Feed** | Significant events: kills, launches, DFE escalations, Reality Gate outcomes. | Real-time |
| **Portfolio Metrics** | Aggregate: kill rate, success rate, avg cycle time, total revenue, AUTO_PROCEED rate. | Daily |
| **Dependency Graph** | Visual map of inter-venture dependencies with critical path highlighting. | On change |

### Notification Strategy (Decision #30)

| Event Type | Channel | Timing |
|-----------|:-------:|--------|
| Blocking decision (Stages 10, 22, 25) | Push + Dashboard | Immediate |
| DFE escalation | Push + Dashboard | Immediate |
| Reality Gate failure / auto-kill | Dashboard + Digest | Daily batch |
| Advisory checkpoints (Stages 3, 5, 16, 23) | Dashboard + Digest | Daily batch |
| Routine stage completions | Dashboard + Summary | Weekly batch |

### Chairman Decision Interface

The Chairman Dashboard is the **primary decision interface**. While the CLI remains authoritative for venture progression (stage advancement, configuration), Chairman decisions at blocking gates are submitted through the dashboard.

**Decision Presentation Flow:**

```
CEO Service reaches blocking stage (10, 22, 25) or DFE escalates
    │
    ▼
Write to chairman_decisions table:
    {
      venture_id, stage, decision_type,
      context: { stage_output, dfe_triggers, mitigations, recommended_action },
      status: 'pending'
    }
    │
    ▼
Notification Service fires:
    Push notification → Chairman's device (immediate for blocking)
    Dashboard decision queue updates (real-time via Supabase Realtime subscription)
    │
    ▼
Chairman opens Dashboard → Decision Queue → Decision Detail view:
    - Full stage output (synthesized, not raw data)
    - DFE trigger explanation (if escalation)
    - Recommended action with confidence reasoning
    - Action buttons: Approve / Reject / Modify / Override
    │
    ▼
Chairman submits decision:
    UPDATE chairman_decisions SET decision = 'proceed', notes = '...', decided_at = now()
    │
    ▼
Supabase Realtime broadcasts change → EVA event bus receives "chairman.approval"
    │
    ▼
CEO Service resumes venture progression
```

**Decision Types by Stage:**

| Stage | Decision Type | Chairman Sees | Chairman Actions |
|:-----:|--------------|---------------|------------------|
| **0** | Venture review | Synthesized brief: name, problem, solution, market, moat, archetype, forecast, venture score | Approve (→ Stage 1) / Park in Nursery / Edit brief / Kill |
| **10** | Brand approval | Full brand package (name, voice, visual direction, narrative) | Approve / Revise (with notes) / Reject |
| **22** | Release decision | BUILD LOOP synthesis, technical readiness, business review | Release / Hold (with reason) / Cancel |
| **25** | Venture future | Complete journey synthesis, financials, health score | Continue / Pivot / Expand / Sunset / Exit |
| **DFE** | Escalation | Trigger details, context, mitigations if available | Proceed / Block / Modify thresholds |

**Stage 0 Chairman Review — Interactivity Gap:**

The Stage 0 implementation (`lib/eva/stage-zero/chairman-review.js`) currently uses a **programmatic, non-interactive** review. The `conductChairmanReview()` function maps `brief.maturity` to a decision automatically (ready → approve, blocked/nursery → park). The Chairman does not actually see the brief or make a decision interactively.

To close this gap, the Chairman Decision Interface (above) must be wired into Stage 0:

```
Stage 0 synthesis completes → Venture brief enriched with all 8 components
    │
    ▼
conductChairmanReview() writes to chairman_decisions table:
    { venture_id: null (new), stage: 0, decision_type: 'venture_review',
      context: { brief, synthesis_results, forecast, venture_score } }
    │
    ▼
Chairman reviews in Dashboard → Approves/Parks/Edits
    │
    ▼
persistVentureBrief() creates venture record (Stage 1) or nursery entry
```

This makes Stage 0 the **fourth mandatory Chairman blocking gate** (alongside Stages 10, 22, 25). Until connected, the Chairman review is a no-op passthrough based on synthesis maturity classification.

**Detection Mechanism:**

The system detects Chairman decisions via **Supabase Realtime subscriptions** on the `chairman_decisions` table. When `decision` changes from NULL to a value, the event bus emits `chairman.approval` or `chairman.rejection`. This avoids polling and gives sub-second response times.

```sql
-- New table for Chairman preference overrides (referenced in Section 6)
CREATE TABLE chairman_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT CHECK (scope IN ('global', 'venture')) NOT NULL,
  venture_id UUID REFERENCES ventures(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (scope, venture_id, key)
);
```

**CLI Fallback:**

For power-user scenarios or API-driven decisions, a CLI command provides equivalent functionality:

```bash
# List pending decisions
eva decisions list

# View decision detail
eva decisions view <decision_id>

# Submit decision
eva decisions approve <decision_id> --notes "Ship it"
eva decisions reject <decision_id> --notes "Revise brand voice"
```

The CLI writes to the same `chairman_decisions` table, triggering the same Realtime subscription → event bus flow.

---

## 10. Security & Governance

### Chairman RLS Policies

**Already built**: `fn_is_chairman()` function for RLS policies.

```sql
-- Chairman-only tables
chairman_decisions: SELECT/INSERT/UPDATE restricted to fn_is_chairman()
chairman_preferences: SELECT/INSERT/UPDATE restricted to fn_is_chairman()

-- Venture data: Chairman can read everything, services write via service_role
ventures: SELECT for authenticated, ALL for service_role
venture_artifacts: SELECT for venture access, INSERT/UPDATE for service_role
```

### Service Authorization

Services authenticate via `service_role` key (Supabase). The architecture does not implement per-service authorization (all services share the same `service_role`). This is acceptable for an AI-only operation where all services are trusted code.

Future enhancement: If services become externally hosted, add per-service API keys with scoped permissions.

### Audit Trail

Every state change is logged:
- `venture_stage_transitions` — Stage progression audit
- `venture_state_history` — Venture lifecycle state changes
- `chairman_decisions` — All Chairman decisions with override reasons
- `eva_event_log` — All events published on the bus
- `venture_artifacts` — Immutable versioning (prior versions preserved)

---

## 11. What Already Exists vs. What Needs Building

### Exists and Active

| Component | Table/Code | Status |
|-----------|-----------|:------:|
| **EVA Orchestrator (CEO Service)** | `lib/eva/eva-orchestrator.js` — `processStage()` loads context, runs stage templates, evaluates DFE + reality gates + devil's advocate, persists artifacts, advances stages. `run()` for multi-stage execution. | Production |
| **Decision Filter Engine** | `lib/eva/decision-filter-engine.js` — Pure function with 6 triggers (cost_threshold, new_tech_vendor, strategic_pivot, low_score, novel_pattern, constraint_drift). Returns `{ auto_proceed, triggers, recommendation }`. Conservative defaults force PRESENT_TO_CHAIRMAN on missing preferences. | Production |
| **Reality Gate Evaluator** | `lib/eva/reality-gates.js` — 5 phase boundaries (5→6, 9→10, 12→13, 16→17, 20→21). Checks artifact existence, quality score thresholds, URL reachability. Pure dependency injection. Profile threshold overrides supported. | Production |
| **Chairman Preferences Store** | `lib/eva/chairman-preference-store.js` — Full CRUD with scoped resolution (venture-specific → global fallback). Batch `getPreferences()` uses 2 queries max. Decision-to-preference audit linking. | Production |
| **Devil's Advocate** | `lib/eva/devils-advocate.js` — Model-isolated adversarial review using GPT-4o (OpenAI Adapter). Invoked at kill gates (3, 5, 13, 23) and promotion gates (16, 17, 22). Returns structured counter-arguments, risks, alternatives. Graceful fallback when API unavailable. | Production |
| **Constraint Drift Detector** | `lib/eva/constraint-drift-detector.js` — Detects when later stage outputs contradict Stage 1 baseline assumptions. Compares across 4 categories (market, competitor, product, timing). Severity: NONE/LOW/MEDIUM/HIGH. Feeds DFE via `buildFilterEnginePayload()`. | Production |
| **Saga Coordinator** | `lib/eva/saga-coordinator.js` — Compensation pattern for multi-step operations. Registers steps with action + compensate functions. On failure, compensates completed steps in reverse order. Persists to `eva_saga_log` table. | Production |
| **Orchestrator Tracer** | `lib/eva/observability.js` — Structured tracing with `startSpan()`/`endSpan()` for timed operations. Events emitted to `eva_events` table. Full traces persisted to `eva_trace_log`. Parent trace correlation for cross-operation linking. | Production |
| **Orchestrator State Machine** | `lib/eva/orchestrator-state-machine.js` — Formalized states (idle/processing/blocked/failed). Atomic `acquireProcessingLock()` prevents concurrent `processStage()` calls. Lock safety via `orchestrator_lock_id` column. | Production |
| **Cross-Venture Learning** | `lib/eva/cross-venture-learning.js` — Analyzes patterns across 5+ ventures: kill-stage frequency rankings, failed assumption patterns, successful patterns. Output structured for DFE threshold calibration. | Production |
| **Stage 0 Ideation Pipeline** | `lib/eva/stage-zero/` (3 entry paths, 8 synthesis components, profiles, forecasting, nursery) | Production |
| **Stage 0 Evaluation Profiles** | `evaluation_profiles` table, `profile-service.js` | Production |
| **Stage 0 Counterfactual Engine** | `counterfactual-engine.js`, `counterfactual_scores` table | Production |
| **Stage 0 Stage-of-Death Predictor** | `stage-of-death-predictor.js`, `stage_of_death_predictions` table | Production |
| **Stage 0 Gate Signal Service** | `gate-signal-service.js`, `evaluation_profile_outcomes` table | Production |
| **Venture Nursery** | `venture-nursery.js`, `venture_nursery` table | Production |
| Venture CRUD | `ventures` (689 rows) | Production |
| Stage config | `lifecycle_stage_config` (25 stages) | Production |
| Stage advancement | `fn_advance_venture_stage()` | Production |
| Artifact storage | `venture_artifacts` | Production |
| Token budgets | `venture_token_budgets` | Production |
| SD Bridge (Stage 18 → LEO) | `lib/eva/lifecycle-sd-bridge.js` | Production |
| Stage templates | `lib/eva/stage-templates/` (Stages 1-25) | Production |
| Chairman RLS | `fn_is_chairman()` | Production |
| Venture context manager | `lib/eva/venture-context-manager.js` | Production |
| CLI service ports | `lib/eva/services/` — Brand Genome CRUD, Competitive Intelligence (research sessions), Venture Research. CLI-compatible ports of frontend services. | Production |
| CLI venture scripts | `scripts/eva-venture-new.js`, `eva-idea-evaluate.js`, `eva-idea-status.js`, `eva-idea-sync.js`, `eva-first-pulse.js` | Production |

### Exists but Dormant (Needs Wiring)

| Component | Table/Code | What's Missing |
|-----------|-----------|----------------|
| Event bus | `eva_event_log`, `evaEventBus.ts` | Event handlers (subscribers) |
| Task contracts | `agent_task_contracts` | Contract dispatcher and claimer |
| Circuit breaker | `evaCircuitBreaker.ts` | Integration with service invocations |
| State machines | `evaStateMachines.ts` | Wiring to venture progression |
| Alerts | `eva_alerts`, `eva_escalation_rules` | Timer-based escalation checker |
| Automation rules | `eva_automation_rules` | Scheduler to execute rules |
| Agent communications | `eva_agent_communications` | Service-to-service messaging |
| Orchestration metrics | `orchestration_metrics` | Telemetry collection |
| AI CEO config | `ai_ceo_agents` | Autonomous execution loop |

### Needs Building (New)

| Component | Purpose | Priority |
|-----------|---------|:--------:|
| **Stage 0 Interactive Chairman Review** | Wire `conductChairmanReview()` to `chairman_decisions` table + Dashboard (currently programmatic passthrough) | P0 |
| **Chairman Decision API** | Decision submission endpoints (table already exists; need Realtime subscription wiring + CLI `eva decisions approve/reject` command) | P0 |
| **CLI Task Dispatcher** | Unified `eva run <venture_id> [--stage N]` command (partial: individual scripts exist for new/evaluate/status/sync but no unified runner) | P0 |
| **Return Path (LEO → Stages)** | SD completion → stage progress sync (SD Bridge sends work out; no return event handler yet) | P0 |
| **Stage template gap-fill** | Stages 2-25 templates exist but many are passive containers (validate-only). Triangulation analysis identified Stages 2, 4, 7, 8, 11, 12 as needing active `analysisSteps`. | P0 |
| **Event bus handler wiring** | Connect dormant event bus infrastructure to service invocations (bus publishes events; nothing currently listens) | P0 |
| **EVA Master Scheduler** | Portfolio-level scheduling, priority queue processing | P1 |
| **Chairman Dashboard** | Decision queue + health heatmap + event feed | P1 |
| **Chairman Notification Service** | Push + digest notification batching | P1 |
| **Venture Template System** | Auto-generate and apply templates from successful ventures (cross-venture-learning.js provides the pattern analysis; template extraction + application layer needed) | P2 |
| **Inter-Venture Dependency Manager** | Dependency graph with auto-blocking (`venture_dependencies` table schema defined; manager code needed) | P2 |
| **Shared Services Abstraction** | Common service interface (load context, execute, emit) | P3 |
| **Expand-vs-Spinoff Evaluator** | DFE-based scope assessment at Stage 25 | P3 |

**Removed from v1.2 list** (already implemented):
- ~~Decision Filter Engine~~ → `lib/eva/decision-filter-engine.js` (6 triggers, pure function)
- ~~Reality Gate Evaluator~~ → `lib/eva/reality-gates.js` (5 boundaries)
- ~~Chairman Preferences Store~~ → `lib/eva/chairman-preference-store.js` (CRUD + scoped resolution)
- ~~CEO Service analysisStep executor~~ → `lib/eva/eva-orchestrator.js` (`processStage()` + `run()`)
- ~~Saga Coordinator~~ → `lib/eva/saga-coordinator.js` (compensation pattern)
- ~~Portfolio Knowledge Base~~ → `lib/eva/cross-venture-learning.js` (kill frequency, failed assumptions, success patterns)

### Implementation Sequence

The sequence is ordered so that **each phase produces a testable end-to-end capability**. Phase A can shepherd a single venture through all 25 stages manually. Phase B automates scheduling and the Chairman experience. Phase C adds multi-venture intelligence. Phase D optimizes.

**v1.3 resequencing note**: The v1.2 sequence listed 10 items in Phase A. Codebase reconciliation revealed that 5 of those 10 already exist (DFE, Reality Gates, Chairman Preferences, CEO Service executor, Saga Coordinator). Phase A now focuses on the **integration gaps** — wiring existing components together and filling the remaining holes.

```
Phase A: First Venture End-to-End (P0)
  Goal: One venture can progress from ideation (Stage 0) through all 25 stages via CLI commands.

  ALREADY BUILT (not work items — just context):
  ✅ Decision Filter Engine (lib/eva/decision-filter-engine.js)
  ✅ Reality Gate Evaluator (lib/eva/reality-gates.js)
  ✅ Chairman Preferences Store (lib/eva/chairman-preference-store.js)
  ✅ CEO Service / EVA Orchestrator (lib/eva/eva-orchestrator.js — processStage + run)
  ✅ Saga Coordinator (lib/eva/saga-coordinator.js — compensation pattern)
  ✅ Devil's Advocate (lib/eva/devils-advocate.js — GPT-4o adversarial at 7 gates)
  ✅ Constraint Drift Detector (lib/eva/constraint-drift-detector.js)
  ✅ Orchestrator Tracer (lib/eva/observability.js)
  ✅ Orchestrator State Machine (lib/eva/orchestrator-state-machine.js)
  ✅ Cross-Venture Learning (lib/eva/cross-venture-learning.js)

  REMAINING WORK:
  1. Stage 0 Interactive Chairman Review (wire conductChairmanReview → chairman_decisions)
     └── Stage 0 pipeline already built (Section 14); only the interactive review is missing
  2. Chairman Decision API (chairman_decisions table + Realtime subscription + CLI)
     └── Table exists; need CLI commands (eva decisions list/approve/reject) + Realtime wiring
     └── Unblocks Stages 0, 10, 22, 25 — without this, Phase A deadlocks
  3. Stage template gap-fill (add active analysisSteps to passive templates)
     └── Stages 2, 4, 7, 8, 11, 12 identified by triangulation as needing active analysis
     └── Stage templates 1-25 exist as containers; ~6 need LLM-driven analysisSteps
  4. CLI Task Dispatcher (unified "eva run <venture_id> [--stage N]" command)
     └── Individual scripts exist; need unified orchestration entry point
  5. Return Path (LEO SD completion → stage progress)
     └── SD Bridge sends work out; need event handler for "sd.completed" → stage update
  6. Wire event bus handlers (connect dormant infrastructure)
     └── Event bus publishes; nothing currently subscribes

  Test: Chairman initiates venture via "eva ideate --path competitor_teardown --urls ...",
  Stage 0 runs synthesis + forecast, Chairman reviews and approves via CLI,
  venture created at Stage 1. Then "eva run <id>" progresses through Stages 2-25.
  Chairman submits decisions via CLI at Stages 10, 22, 25.
  SD Bridge creates LEO SDs at Stage 18, return path advances to Stage 20.

Phase B: Automated Scheduling + Chairman Dashboard (P1)
  Goal: Ventures progress automatically. Chairman uses dashboard instead of CLI.

  7. EVA Master Scheduler (priority queue + cadence management)
     └── Replaces manual "eva run" — ventures auto-advance when unblocked
  8. Chairman Dashboard (decision queue + health heatmap + event feed)
  9. Notification service (immediate + daily digest + weekly)
  10. DFE escalation presentation (context + mitigations in dashboard)

  Test: Create 3 ventures. Scheduler auto-advances them. Chairman receives
  notifications, reviews decisions in dashboard, ventures unblock automatically.

Phase C: Portfolio Intelligence (P2)
  11. Venture template system (extraction + application — cross-venture-learning.js provides analysis)
  12. Inter-venture dependency manager (venture_dependencies schema defined; manager code needed)

Phase D: Optimization (P3)
  13. Shared services abstraction layer
  14. Expand-vs-spinoff evaluator
  15. Advanced portfolio optimization (resource contention, priority re-ranking)
```

### Phase A Validation: The First Venture Test

Phase A is complete when this scenario passes:

```
 1. "eva ideate --path competitor_teardown --urls https://competitor.com"
    → Stage 0 executes: path routing → 8-component synthesis → financial forecast
    → Venture brief created with venture_score, archetype, moat strategy
 2. Chairman reviews brief via CLI → "eva decisions approve <id>"
    → persistVentureBrief() creates venture at Stage 1
    (Alternative: Chairman parks in nursery → venture_nursery record created)
 3. "eva run <id>" → CEO Service runs Stages 2-9 automatically
    - DFE evaluates at each stage (AUTO_PROCEED for all)
    - Reality Gates pass at phase boundaries
    - Kill gates at 3 and 5 auto-resolve
 4. Stage 10 blocks → Chairman decision created
 5. "eva decisions approve <id>" → Venture unblocks, continues to Stage 12
 6. Stages 13-17 auto-advance
 7. Stage 18 → SD Bridge creates LEO SDs
 8. (LEO executes SDs externally)
 9. Return path receives SD completion → Stage 19 updates
10. Stages 20-21 auto-advance
11. Stage 22 blocks → Chairman decides "release"
12. Stage 23 auto-advances (launch)
13. Stage 24 auto-advances (metrics)
14. Stage 25 blocks → Chairman decides "continue"
15. Venture enters ops cycle (Stage 24 version 2)
```

If any step fails, the phase is not complete.

---

## 12. Post-Launch Operations Architecture

### Event-Driven Operations Model

Post-launch ventures (Stage 23+) operate via event-driven automation, not an always-on ops team:

```
AARRR Metrics (Stage 24)
    │
    ├── Metric anomaly detected
    │   └── EVA emits event → DFE evaluates → AUTO_PROCEED or escalate
    │
    ├── Declining KPI
    │   └── CEO Service auto-generates enhancement SD → LEO executes
    │
    ├── Bug report (customer support AI)
    │   └── CEO Service auto-generates bugfix SD → LEO executes
    │
    └── Infrastructure alert
        └── Auto-scale within bounds → DFE cost_threshold if significant

All post-launch operations:
  ├── Billing: Stripe webhooks → automated processing
  ├── Legal: Template auto-configuration, DFE for novel situations
  ├── Support: AI chatbot, automated ticket routing
  ├── Scaling: Auto-scale + DFE cost gate
  └── Analytics: Auto-collect → auto-analyze → DFE for anomalies
```

### Venture Retirement Sequence (Decision #25)

```
Kill/Sunset/Exit decision
    │
    ▼
Shutdown Orchestrator (automated)
    ├── Step 1: User notification (email, in-app, configurable timeline)
    ├── Step 2: Data export (user data packaged for download)
    ├── Step 3: Infrastructure teardown (reverse dependency order)
    ├── Step 4: Code archive (repo archived to cold storage)
    └── Step 5: Post-mortem retrospective (automated analysis)
    │
    ▼
Portfolio knowledge base updated with shutdown learnings
```

---

## 13. Saga Management for Multi-Step Operations

### Why Sagas Are Needed

The shared services model (Section 2) follows a stateless pattern: load context, execute, write result, emit event. This works for individual analysisSteps (single invocation, completes in minutes). But three operations span multiple steps that can take hours or days and can fail mid-sequence:

| Operation | Steps | Duration | Failure Mode |
|-----------|:-----:|----------|-------------|
| SD Execution (Stage 18→19) | SD Bridge → LEO executes N SDs → Return Path | Hours to days | Individual SDs fail, LEO blocked, partial completion |
| Reality Gate Retry | Identify failure → re-run analysisStep (up to 3x) → re-evaluate gate | Minutes to hours | All retries exhausted → auto-kill |
| Venture Retirement | Notify → Export → Teardown → Archive → Retrospective | Hours | Step 3 (teardown) fails, leaving orphaned infrastructure |

Without saga management, these operations have no durable state between steps. If the CEO Service crashes mid-sequence, the operation is lost. The dormant `evaStateMachines.ts` infrastructure provides the foundation — it needs to be connected as the saga coordinator.

**Current implementation status** (v1.3): `lib/eva/saga-coordinator.js` implements a **compensation pattern** saga — it registers steps with action + compensate functions, executes them sequentially, and compensates in reverse order on failure. It persists to `eva_saga_log` and is integrated into the EVA Orchestrator. However, the **long-running process sagas** described below (SD execution over days, venture retirement over weeks) require the **durable state** extension — storing saga state in `eva_sagas` table with timeout management and crash recovery. The compensation saga handles single-session atomicity; durable sagas handle cross-session durability.

### Saga Architecture

```
Operation starts (e.g., SD Bridge fires at Stage 18)
    │
    ▼
Saga Coordinator creates saga record:
    INSERT INTO eva_sagas (venture_id, saga_type, current_step, status, context)
    VALUES ($1, 'sd_execution', 'bridge_create', 'active', {...})
    │
    ▼
Each step:
    1. Read saga state from DB
    2. Execute step (create SDs, wait for completion, update stage)
    3. Write updated state + advance to next step
    4. If step fails → retry with backoff, or mark saga as 'failed'
    │
    ▼
Saga completes:
    UPDATE eva_sagas SET status = 'completed', completed_at = now()
    Emit event: "saga.completed" with results
```

The Saga Coordinator is stateless — it reads saga state from the database on every invocation. If the process crashes, the next invocation picks up from the last persisted step.

### Three Saga Types

#### 1. SD Execution Saga (Stage 18 → 19)

```
Steps:
  1. bridge_create    → SD Bridge creates orchestrator + N child SDs in LEO
  2. await_completion → Subscribe to "sd.completed" events per child SD
                        Track: completed_count / total_count
                        Timeout: configurable per venture (default 7 days)
  3. collect_results  → Gather test results, code metrics, issues from all SDs
  4. update_stage     → Write results to venture_artifacts (Stage 19)
                        Evaluate sprint_completion (complete/partial/blocked)
  5. advance          → If complete, advance to Stage 20

Failure handling:
  - Individual SD fails → Record in saga context, continue waiting for others
  - All SDs complete but some failed → sprint_completion = 'partial'
  - Timeout → sprint_completion = 'blocked', DFE escalation
  - Saga coordinator crash → Picks up from last step on restart
```

#### 2. Reality Gate Retry Saga

```
Steps:
  1. identify_failure → Parse Reality Gate failure (which check, which data)
  2. map_stages       → Determine which upstream stage(s) are responsible
  3. retry_analysis   → Re-run analysisStep with failure context injected
                        ("Previous output failed because X; regenerate addressing this")
  4. re_evaluate      → Run Reality Gate again on new output
  5. decide           → Pass → advance venture; Fail → loop to step 3 (max 3 attempts)
  6. exhaust          → If 3 retries fail → auto-kill venture (killed_at_reality_gate)

State tracked:
  - retry_count (0, 1, 2, 3)
  - prior_failure_reasons (array, injected into each retry prompt)
  - versions_created (each retry creates a new artifact version)
```

#### 3. Venture Retirement Saga (Decision #25)

```
Steps:
  1. notify_users     → Send advance notice to active users (email, in-app)
                        Wait: configurable notification period (default 30 days for sunset)
  2. export_data      → Package user data for download, generate export URLs
  3. teardown_infra   → Decommission cloud resources in reverse dependency order
                        Sub-steps tracked individually (DB, storage, compute, DNS)
  4. archive_code     → Archive repository to cold storage, generate archive reference
  5. retrospective    → Run automated post-mortem analysis
                        Write results to portfolio knowledge base

Failure handling:
  - Step 1 failure → Retry (notification is idempotent)
  - Step 2 failure → Retry (export is idempotent)
  - Step 3 failure → PAUSE saga, alert Chairman (infrastructure can't be left half-torn-down)
  - Step 4/5 failure → Retry (archive and retrospective are idempotent)

For kill gates (Stages 3, 5) and Reality Gate kills:
  - Skip steps 1-2 (no users yet)
  - Execute steps 3-5 only
```

### Saga State Table

```sql
CREATE TABLE eva_sagas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) NOT NULL,
  saga_type TEXT CHECK (saga_type IN ('sd_execution', 'reality_gate_retry', 'venture_retirement')) NOT NULL,
  current_step TEXT NOT NULL,
  status TEXT CHECK (status IN ('active', 'paused', 'completed', 'failed')) NOT NULL DEFAULT 'active',
  context JSONB NOT NULL DEFAULT '{}',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  started_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ
);

CREATE INDEX idx_eva_sagas_active ON eva_sagas (venture_id, saga_type) WHERE status = 'active';
```

### Connection to Dormant Infrastructure

The dormant `evaStateMachines.ts` already implements state machine transitions with event-driven advancement. The Saga Coordinator wraps this with:

1. **Durable state** — Saga records in `eva_sagas` table (state machines are currently in-memory only)
2. **Timeout management** — `timeout_at` column + EVA scheduler checks for expired sagas
3. **Failure routing** — Failed steps route to retry logic or DFE escalation
4. **Crash recovery** — On startup, query `eva_sagas WHERE status = 'active'` and resume all in-progress sagas

The circuit breaker (`evaCircuitBreaker.ts`) integrates at the step level: if a service invocation within a saga step fails repeatedly, the circuit opens and the saga pauses rather than burning through retries.

---

## 14. Stage 0: Venture Ideation Pipeline

### Overview

Stage 0 is the **pre-lifecycle venture ideation pipeline** — it runs *before* a venture enters the 25-stage lifecycle (Stages 1-25). Its purpose is to take a raw idea signal (competitor URL, blueprint selection, discovery output, or direct chairman input), enrich it through 8 synthesis components, score it with financial modeling, and either approve it into Stage 1 or park it in the Venture Nursery for later re-evaluation.

**Implementation status**: Fully built in `lib/eva/stage-zero/`. This is the most complete EVA module in the codebase.

```
Signal source (URL, blueprint, discovery, manual, nursery re-eval)
    │
    ▼
Entry Path → PathOutput (structured raw material)
    │
    ▼
Synthesis Engine (8 components in parallel) → Enriched VentureBrief
    │
    ▼
Financial Forecast → 3-year projections + venture score (0-100)
    │
    ▼
Chairman Review → Approve (→ Stage 1) or Park (→ Nursery)
```

### Entry Paths

Three primary entry paths, each producing a `PathOutput` that feeds the synthesis engine:

| Path | Key | Module | Mechanism |
|------|-----|--------|-----------|
| **Competitor Teardown** | `competitor_teardown` | `paths/competitor-teardown.js` | Accepts competitor URLs → LLM analyzes business model, features, work components, automation potential → First-principles deconstruction → Gap analysis (if multiple URLs) |
| **Blueprint Browse** | `blueprint_browse` | `paths/blueprint-browse.js` | Loads templates from `venture_blueprints` table → Category browsing → Parameter customization → Template-derived brief |
| **Discovery Mode** | `discovery_mode` | `paths/discovery-mode.js` | 4 AI-driven strategies (see below) → Generates ranked candidates → Selects top candidate |

Two additional origin types flow through the same pipeline:

| Origin | Mechanism |
|--------|-----------|
| **Manual** | Chairman direct input — `origin_type: 'manual'`, bypasses path routing |
| **Nursery Re-eval** | Re-evaluates parked ventures — runs as Discovery Mode `nursery_reeval` strategy, feeds back into Stage 0 with fresh synthesis |

### Discovery Strategies

The Discovery Mode path supports 4 strategies, configured in the `discovery_strategies` database table:

| Strategy | Purpose | Signal Source |
|----------|---------|---------------|
| `trend_scanner` | Trending products generating $1K+/month, fully automatable | LLM market research |
| `democratization_finder` | Premium services ($500+/session) that can be offered at 1/10th cost via AI | LLM service analysis |
| `capability_overhang` | AI capabilities that exist but are not productized | LLM capability-market gap analysis |
| `nursery_reeval` | Re-score parked ideas whose conditions may have changed | `venture_nursery` table + LLM re-assessment |

Each strategy generates N candidates (default 5), which are ranked by `automation_feasibility * 10 + competition_bonus`. The top candidate becomes the PathOutput.

### Synthesis Engine

The synthesis engine runs **8 components** on every PathOutput. Components 1-4 and 6-8 execute in parallel via `Promise.all`; component 5 (Chairman Constraints) runs sequentially after.

| # | Component | Module | Produces | Scoring |
|---|-----------|--------|----------|---------|
| 1 | Cross-Reference Intellectual Capital | `synthesis/cross-reference.js` | Matches against nursery items, brainstorms, retrospectives, issue patterns | `relevance_score` (0-100) |
| 2 | Portfolio Evaluation | `synthesis/portfolio-evaluation.js` | Portfolio fit assessment across multiple dimensions | `composite_score` (0-100) |
| 3 | Problem Reframing | `synthesis/problem-reframing.js` | Alternative problem framings for the venture | Count of reframings → score |
| 4 | Moat Architecture | `synthesis/moat-architecture.js` | Primary moat (from 5 types) + secondary moats, compounding over 1-24 months, portfolio synergy | `moat_score` (0-100) |
| 5 | Chairman Constraints | `synthesis/chairman-constraints.js` | Validates against chairman directives | `verdict`: pass / review / fail |
| 6 | Time Horizon | `synthesis/time-horizon.js` | Positioning classification | `position`: build_now / build_soon / park_and_build_later |
| 7 | Archetype Recognition | `synthesis/archetypes.js` | Classification into 1 of 6 EHG archetypes + secondary fits | `primary_confidence` (0-1) |
| 8 | Build Cost Estimation | `synthesis/build-cost-estimation.js` | Complexity assessment with EHG context | `complexity`: simple / moderate / complex |

**Moat types** (Component 4): `data_moat`, `automation_speed`, `vertical_expertise`, `network_effects`, `switching_costs`

**Archetype types** (Component 7): `democratizer`, `automator`, `capability_productizer`, `first_principles_rebuilder`, `vertical_specialist`, `portfolio_connector`

**Maturity determination**: The synthesis engine sets maturity based on:
- Chairman constraints verdict = `fail` → maturity = `blocked`
- Time horizon = `park_and_build_later` → maturity = `nursery`
- Otherwise → maturity = `ready`

### Evaluation Profile System

Synthesis scoring is configurable via database-backed evaluation profiles (`profile-service.js`):

```
Profile resolution: explicit profile_id → active profile → legacy defaults
    │
    ├── Profile weights (9 components, each 0.0-1.0):
    │     cross_reference: 0.10, portfolio_evaluation: 0.10, problem_reframing: 0.05,
    │     moat_architecture: 0.15, chairman_constraints: 0.15, time_horizon: 0.10,
    │     archetypes: 0.10, build_cost: 0.10, virality: 0.15
    │
    ├── calculateWeightedScore(synthesisResults, weights) → 0-100
    │
    └── Gate thresholds per boundary (overrides legacy defaults):
          5→6, 9→10, 12→13, 16→17, 20→21
```

Profiles support CRUD operations, activation (deactivates all others), and version tracking. When no profile exists, the system falls back to hardcoded legacy weights.

### Financial Modeling

The `modeling.js` module generates a horizontal forecast for every venture brief:

| Projection | Granularity | Output |
|------------|-------------|--------|
| Market sizing | TAM / SAM / SOM | USD value + rationale |
| Revenue projections | Years 1-3 | Optimistic / realistic / pessimistic ranges |
| Unit economics | CAC, LTV, LTV:CAC ratio, payback months | Optimistic / realistic / pessimistic |
| Growth trajectory | 3, 6, 12-month users | Adoption curve + growth model type |
| Break-even | Months to break-even, burn at launch/scale | Optimistic / realistic / pessimistic |

**Venture Score** (0-100): Composite of revenue (35%), LTV:CAC ratio (30%), break-even speed (20%), forecast confidence (15%).

### Advanced Analytics

Three modules provide predictive analytics beyond the core synthesis:

| Module | Purpose | Key Function |
|--------|---------|-------------|
| **Counterfactual Engine** (`counterfactual-engine.js`) | What-if scoring: "how would this venture score under a different evaluation profile?" Batch re-scoring across N ventures × P profiles. Predictive accuracy via Kendall's tau-b. | `generateCounterfactual()`, `runBatchCounterfactual()`, `generatePredictiveReport()` |
| **Stage-of-Death Predictor** (`stage-of-death-predictor.js`) | Predicts WHERE a venture will die (which stage), not just IF. Builds per-stage mortality curves from historical kill data + component weakness amplification. Outputs: "Democratizers scoring below 60 on moat have 80% chance of dying at Stage 5." | `predictStageOfDeath()`, `buildMortalityCurve()`, `calibratePredictions()` |
| **Gate Signal Service** (`gate-signal-service.js`) | Records per-gate survival signals at tracked boundaries (stage_3, 5→6, 12→13, 20→21, graduation). Produces 5-6 data points per venture instead of one, cutting learning cycles from months to weeks. | `recordGateSignal()`, `getSignalsSummary()` |

### Venture Nursery

The Venture Nursery (`venture-nursery.js`) provides **warm storage** for ventures not ready for Stage 1:

```
Venture brief with maturity = 'blocked' or 'nursery'
    │
    ▼
parkVenture(brief, { reason, triggerConditions, reviewSchedule })
    → Creates venture_nursery record
    → Sets review date: 30d (blocked) or 90d (nursery)
    → Stores trigger conditions for automated re-evaluation
    │
    ▼
checkNurseryTriggers() (called on schedule)
    → Finds items past their review date
    → Triggers re-evaluation via discovery_mode.nursery_reeval strategy
    │
    ▼
reactivateVenture(nurseryId)
    → Feeds back into Stage 0 with origin_type: 'nursery_reeval'
    → Fresh synthesis with updated context
    → Chairman reviews again → Approve or re-park
```

Health monitoring (`getNurseryHealth()`) flags nursery items stale after 180 days.

Synthesis feedback (`recordSynthesisFeedback()`) records outcomes (approved/parked/killed) back to the `venture_synthesis_feedback` table, enabling the cross-reference component to learn from prior ideation decisions.

### Chairman Review (Current vs. Target)

**Current implementation** (`chairman-review.js`): Non-interactive. Maps `brief.maturity` to a decision automatically:
- `ready` → approve → create venture at Stage 1
- `blocked` / `nursery` → park in Venture Nursery
- The Chairman never actually sees the brief or makes a decision

**Target architecture** (see Section 9, Chairman Decision Interface):
- `conductChairmanReview()` writes to `chairman_decisions` table with full synthesis context
- Chairman reviews in Dashboard (brief, synthesis scores, forecast, archetype, moat strategy)
- Chairman submits: Approve / Park / Edit brief / Kill
- Supabase Realtime broadcasts → event bus → `persistVentureBrief()` executes

**Gap**: The only missing piece is the integration between `conductChairmanReview()` and `chairman_decisions`. The synthesis, scoring, and persistence are all built. This is listed as P0 item #1 in the implementation sequence (Section 11).

### Stage 0 → Stage 1 Contract (VentureBrief)

The VentureBrief is the data contract between Stage 0 and Stage 1. Validated by `interfaces.js`:

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `name` | string | Yes | Venture name |
| `problem_statement` | string | Yes | Core problem (may be reframed by synthesis) |
| `solution` | string | Yes | Proposed solution |
| `target_market` | string | Yes | Target market segment |
| `origin_type` | string | Yes | How this idea was sourced (5 types) |
| `raw_chairman_intent` | string | Yes | Immutable capture of original chairman vision |
| `maturity` | enum | Yes | `ready` / `seed` / `sprout` / `blocked` / `nursery` |
| `archetype` | string | No | Primary archetype from synthesis |
| `moat_strategy` | object | No | Primary + secondary moats |
| `portfolio_synergy_score` | number | No | 0-100 fit score |
| `time_horizon_classification` | string | No | build_now / build_soon / park_and_build_later |
| `build_estimate` | object | No | Complexity + timeline |
| `cross_references` | array | No | Matches from intellectual capital |
| `chairman_constraint_scores` | object | No | Constraint check results |
| `competitor_ref` | array | No | Source URLs (competitor teardown path) |
| `blueprint_id` | string | No | Source template (blueprint path) |
| `discovery_strategy` | string | No | Strategy used (discovery path) |
| `metadata.synthesis` | object | No | Full synthesis results (all 8 components + profile + weighted score) |
| `metadata.synthesis.forecast` | object | No | 3-year financial projections |

When approved, `persistVentureBrief()` writes to both:
- `ventures` table (core record at `current_lifecycle_stage: 1`)
- `venture_briefs` table (detailed brief with all synthesis data)

### Database Tables (Stage 0)

| Table | Purpose | Status |
|-------|---------|:------:|
| `venture_blueprints` | Blueprint templates for browse path | Active |
| `discovery_strategies` | Strategy configs for discovery mode | Active |
| `evaluation_profiles` | Configurable scoring weights + gate thresholds | Active |
| `evaluation_profile_outcomes` | Gate signal tracking (pass/fail per boundary per profile) | Active |
| `counterfactual_scores` | What-if scoring results | Active |
| `stage_of_death_predictions` | Mortality predictions per venture per profile | Active |
| `venture_nursery` | Parked ventures with trigger conditions | Active |
| `venture_synthesis_feedback` | Outcome learning records (approved/parked/killed) | Active |
| `venture_briefs` | Detailed brief records linked to ventures | Active |
| `brainstorm_sessions` | Prior brainstorms (consumed by cross-reference) | Active |

---

*Architecture document as Step 2 of the 8-step vision & architecture plan.*
*Informed by: EVA Venture Lifecycle Vision v4.6 (34 Chairman decisions), existing EHG database schema (689 ventures, 25 stages configured), EVA orchestration infrastructure (event bus, task contracts, state machines, circuit breakers), LEO Protocol SD Bridge implementation, Stage 0 CLI implementation (`lib/eva/stage-zero/`).*
*Steps 1 and 2 run in parallel -- vision defines "what," architecture defines "how."*
*v1.1: Added Chairman Decision Interface (Section 9) defining how the Chairman submits decisions at blocking gates. Resequenced implementation phases (Section 11) so Phase A produces a testable end-to-end single-venture flow including Chairman decisions and CLI task dispatcher. Added Saga Management (Section 13) for multi-step operations (SD execution, Reality Gate retries, venture retirement) using dormant evaStateMachines.ts infrastructure.*
*v1.2: Added Stage 0 Venture Ideation Pipeline (Section 14) documenting the fully-implemented pre-lifecycle module. Updated Service Registry to include Stage 0 Pipeline. Extended Phase A test scenario to start from Stage 0 ideation. Identified Chairman Review interactivity gap: `conductChairmanReview()` is currently a non-interactive passthrough — wiring to `chairman_decisions` table is P0 item #1. Added Stage 0 as fourth mandatory Chairman blocking gate (alongside Stages 10, 22, 25). Documented 15+ existing database tables, 8 synthesis components, 3 entry paths, 4 discovery strategies, evaluation profile system, counterfactual engine, stage-of-death predictor, gate signal service, and venture nursery.*
*v1.3: Codebase reconciliation against `lib/eva/` and CLI-vs-GUI triangulation analysis (Stages 1-25). Discovered 10 components listed as "Needs Building" that already exist in production: Decision Filter Engine, Reality Gate Evaluator, Chairman Preferences Store, CEO Service (EVA Orchestrator), Saga Coordinator, Devil's Advocate, Constraint Drift Detector, Orchestrator Tracer, Orchestrator State Machine, and Cross-Venture Learning. Corrected Section 11 inventory: "Exists and Active" grew from 15 to 27 entries; "Needs Building" shrunk from 17 to 13 items. Added CLI service ports and venture scripts. Phase A resequenced from 10 items to 6 remaining work items (5 were already built). Added "Stage template gap-fill" as new P0 item based on triangulation finding that ~6 stage templates are passive containers needing active analysisSteps. Phase C reduced from 3 to 2 items (cross-venture learning already built).*
