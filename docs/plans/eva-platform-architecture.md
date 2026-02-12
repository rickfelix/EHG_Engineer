# EVA Platform Architecture: Shared Services Model

> **Version**: 1.1
> **Created**: 2026-02-12
> **Status**: Draft
> **Companion**: [EVA Venture Lifecycle Vision v4.6](eva-venture-lifecycle-vision.md) (34 Chairman decisions)
> **Inputs**: Existing EHG database schema, EVA orchestration migrations, LEO Protocol codebase, brainstorming decisions (2026-02-11)
> **v1.1 Changes**: Chairman Decision Interface (Section 9), resequenced implementation phases (Section 11), Saga Management for multi-step operations (Section 13)

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
| **CEO Service** | Strategy & coordination | Stage orchestration, analysisStep execution (Stages 1-25), cross-stage synthesis, advisory generation | `ai_ceo_agents` table, `useAICEOAgent.ts` hook, Supabase function |
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
| **10** | Brand approval | Full brand package (name, voice, visual direction, narrative) | Approve / Revise (with notes) / Reject |
| **22** | Release decision | BUILD LOOP synthesis, technical readiness, business review | Release / Hold (with reason) / Cancel |
| **25** | Venture future | Complete journey synthesis, financials, health score | Continue / Pivot / Expand / Sunset / Exit |
| **DFE** | Escalation | Trigger details, context, mitigations if available | Proceed / Block / Modify thresholds |

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
| Venture CRUD | `ventures` (689 rows) | Production |
| Stage config | `lifecycle_stage_config` (25 stages) | Production |
| Stage advancement | `fn_advance_venture_stage()` | Production |
| Artifact storage | `venture_artifacts` | Production |
| Token budgets | `venture_token_budgets` | Production |
| SD Bridge (Stage 18 → LEO) | `lib/eva/lifecycle-sd-bridge.js` | Production |
| Stage templates | `lib/eva/stage-templates/` | Production |
| Chairman RLS | `fn_is_chairman()` | Production |
| Venture context manager | `lib/eva/venture-context-manager.js` | Production |

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
| **Decision Filter Engine** | Pure function evaluating 6 triggers per stage | P0 |
| **Reality Gate Evaluator** | 5 phase-boundary hard gates | P0 |
| **Chairman Decision API** | Minimal decision submission (table + Realtime + CLI) | P0 |
| **Chairman Preferences Store** | Per-venture and global DFE threshold overrides | P0 |
| **CEO Service analysisStep executor** | Stage orchestration for Stages 2-25 | P0 |
| **CLI Task Dispatcher** | Manual "run next stage for venture X" command | P0 |
| **Return Path (LEO → Stages)** | SD completion → stage progress sync | P0 |
| **Saga Coordinator** | Multi-step operation management (wire dormant state machines) | P0 |
| **EVA Master Scheduler** | Portfolio-level scheduling, priority queue processing | P1 |
| **Chairman Dashboard** | Decision queue + health heatmap + event feed | P1 |
| **Chairman Notification Service** | Push + digest notification batching | P1 |
| **Portfolio Knowledge Base** | Cross-venture learning extraction and application | P2 |
| **Venture Template System** | Auto-generate and apply templates | P2 |
| **Inter-Venture Dependency Manager** | Dependency graph with auto-blocking | P2 |
| **Shared Services Abstraction** | Common service interface (load context, execute, emit) | P3 |
| **Expand-vs-Spinoff Evaluator** | DFE-based scope assessment at Stage 25 | P3 |

### Implementation Sequence

The sequence is ordered so that **each phase produces a testable end-to-end capability**. Phase A can shepherd a single venture through all 25 stages manually. Phase B automates scheduling and the Chairman experience. Phase C adds multi-venture intelligence. Phase D optimizes.

```
Phase A: First Venture End-to-End (P0)
  Goal: One venture can complete all 25 stages via CLI commands.

  1. Decision Filter Engine (pure function)
  2. Reality Gate Evaluator (5 gates)
  3. Chairman Decision API (chairman_decisions table + Realtime subscription + CLI)
     └── Unblocks Stages 10, 22, 25 — without this, Phase A deadlocks
  4. Chairman Preferences Store (chairman_preferences table + DFE integration)
  5. CEO Service analysisStep executor (Stages 2-25)
  6. CLI Task Dispatcher ("eva run <venture_id> [--stage N]")
     └── Manual trigger for testing — replaced by scheduler in Phase B
  7. Return Path (LEO SD completion → stage progress)
  8. Saga Coordinator (wire evaStateMachines.ts for SD execution + retry sagas)
     └── See Section 13 for saga types
  9. Wire event bus handlers (connect dormant infrastructure)

  Test: Create a venture, run "eva run <id>" repeatedly. Venture progresses
  through all 25 stages. Chairman submits decisions via CLI at Stages 10, 22, 25.
  SD Bridge creates LEO SDs at Stage 18, return path advances to Stage 20.

Phase B: Automated Scheduling + Chairman Dashboard (P1)
  Goal: Ventures progress automatically. Chairman uses dashboard instead of CLI.

  10. EVA Master Scheduler (priority queue + cadence management)
      └── Replaces manual "eva run" — ventures auto-advance when unblocked
  11. Chairman Dashboard (decision queue + health heatmap + event feed)
  12. Notification service (immediate + daily digest + weekly)
  13. DFE escalation presentation (context + mitigations in dashboard)

  Test: Create 3 ventures. Scheduler auto-advances them. Chairman receives
  notifications, reviews decisions in dashboard, ventures unblock automatically.

Phase C: Portfolio Intelligence (P2)
  14. Cross-venture knowledge base
  15. Venture template system
  16. Inter-venture dependency manager

Phase D: Optimization (P3)
  17. Shared services abstraction layer
  18. Expand-vs-spinoff evaluator
  19. Advanced portfolio optimization (resource contention, priority re-ranking)
```

### Phase A Validation: The First Venture Test

Phase A is complete when this scenario passes:

```
1. Chairman creates venture idea via CLI → Stage 1 artifact written
2. "eva run <id>" → CEO Service runs Stages 2-9 automatically
   - DFE evaluates at each stage (AUTO_PROCEED for all)
   - Reality Gates pass at phase boundaries
   - Kill gates at 3 and 5 auto-resolve
3. Stage 10 blocks → Chairman decision created
4. "eva decisions approve <id>" → Venture unblocks, continues to Stage 12
5. Stages 13-17 auto-advance
6. Stage 18 → SD Bridge creates LEO SDs
7. (LEO executes SDs externally)
8. Return path receives SD completion → Stage 19 updates
9. Stages 20-21 auto-advance
10. Stage 22 blocks → Chairman decides "release"
11. Stage 23 auto-advances (launch)
12. Stage 24 auto-advances (metrics)
13. Stage 25 blocks → Chairman decides "continue"
14. Venture enters ops cycle (Stage 24 version 2)
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

*Architecture document as Step 2 of the 8-step vision & architecture plan.*
*Informed by: EVA Venture Lifecycle Vision v4.6 (34 Chairman decisions), existing EHG database schema (689 ventures, 25 stages configured), EVA orchestration infrastructure (event bus, task contracts, state machines, circuit breakers), LEO Protocol SD Bridge implementation.*
*Steps 1 and 2 run in parallel -- vision defines "what," architecture defines "how."*
*v1.1: Added Chairman Decision Interface (Section 9) defining how the Chairman submits decisions at blocking gates. Resequenced implementation phases (Section 11) so Phase A produces a testable end-to-end single-venture flow including Chairman decisions and CLI task dispatcher. Added Saga Management (Section 13) for multi-step operations (SD execution, Reality Gate retries, venture retirement) using dormant evaStateMachines.ts infrastructure.*
