---
category: architecture
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [architecture, auto-generated]
---
# EVA Platform Architecture: Shared Services Model


## Table of Contents

- [1. System Overview](#1-system-overview)
  - [Entity Hierarchy](#entity-hierarchy)
  - [Organizational Model](#organizational-model)
  - [Key Architecture Principles](#key-architecture-principles)
- [2. Shared Services Model](#2-shared-services-model)
  - [Principle: Stateless Services, Database-Backed Identity](#principle-stateless-services-database-backed-identity)
  - [Service Registry](#service-registry)
  - [How Services Load Venture Context](#how-services-load-venture-context)
  - [CEO Service: The Stage Orchestrator](#ceo-service-the-stage-orchestrator)
- [3. EVA Orchestration Hub](#3-eva-orchestration-hub)
  - [Three Trigger Types](#three-trigger-types)
  - [Event Bus Architecture](#event-bus-architecture)
  - [Task Contract System](#task-contract-system)
  - [Dead Letter Queue](#dead-letter-queue)
  - [Circuit Breaker](#circuit-breaker)
  - [Multi-Venture Coordination](#multi-venture-coordination)
- [4. Layered Scheduling](#4-layered-scheduling)
  - [Layer 1: EVA Master Scheduler (Portfolio-Level)](#layer-1-eva-master-scheduler-portfolio-level)
  - [Layer 2: Service Self-Scheduling (Routine Tasks)](#layer-2-service-self-scheduling-routine-tasks)
  - [Layer 3: Venture Config Layer (Per-Venture Cadence)](#layer-3-venture-config-layer-per-venture-cadence)
  - [How Layers Coexist](#how-layers-coexist)
- [5. Venture Data Model](#5-venture-data-model)
  - [Core Tables (Existing)](#core-tables-existing)
  - [Orchestration Tables (Existing, Dormant)](#orchestration-tables-existing-dormant)
  - [Stage Artifact Storage](#stage-artifact-storage)
  - [Cross-Stage Data Contracts](#cross-stage-data-contracts)
  - [Inter-Venture Dependencies (Decision #32)](#inter-venture-dependencies-decision-32)
  - [Versioned Ops Loop (Stages 24-25)](#versioned-ops-loop-stages-24-25)
- [6. Decision Filter Engine (Architecture)](#6-decision-filter-engine-architecture)
  - [Implementation Pattern](#implementation-pattern)
  - [Chairman Preference Store](#chairman-preference-store)
- [7. Architectural Principles](#7-architectural-principles)
  - [7.1 Active Analysis](#71-active-analysis)
  - [7.2 Decision-Based Gates](#72-decision-based-gates)
  - [7.3 Enum Standardization](#73-enum-standardization)
  - [7.4 Cross-Stage Contracts](#74-cross-stage-contracts)
  - [7.5 CLI Superiority](#75-cli-superiority)
- [8. 25-Stage Lifecycle Specifications](#8-25-stage-lifecycle-specifications)
  - [8.1 Phase 1: THE TRUTH (Stages 1–5)](#81-phase-1-the-truth-stages-15)
  - [8.2 Phase 2: THE ENGINE (Stages 6–9)](#82-phase-2-the-engine-stages-69)
  - [8.3 Phase 3: THE IDENTITY (Stages 10–12)](#83-phase-3-the-identity-stages-1012)
  - [8.4 Phase 4: THE BLUEPRINT (Stages 13–16)](#84-phase-4-the-blueprint-stages-1316)
  - [8.5 Phase 5: THE BUILD LOOP (Stages 17–22)](#85-phase-5-the-build-loop-stages-1722)
  - [8.6 Phase 6: LAUNCH & LEARN (Stages 23–25)](#86-phase-6-launch-learn-stages-2325)
- [9. LEO Protocol Integration](#9-leo-protocol-integration)
  - [The SD Bridge (Stage 18 → LEO)](#the-sd-bridge-stage-18-leo)
  - [Return Path (LEO → Venture Stages)](#return-path-leo-venture-stages)
  - [How LEO Reports Back](#how-leo-reports-back)
- [10. Portfolio Intelligence (Architecture)](#10-portfolio-intelligence-architecture)
  - [Cross-Venture Knowledge Base (Decision #26)](#cross-venture-knowledge-base-decision-26)
  - [Venture Templates (Decision #29)](#venture-templates-decision-29)
  - [Portfolio Prioritization (Decision #27)](#portfolio-prioritization-decision-27)
- [11. Chairman Dashboard (Architecture)](#11-chairman-dashboard-architecture)
  - [Views](#views)
  - [Notification Strategy (Decision #30)](#notification-strategy-decision-30)
  - [Chairman Decision Interface](#chairman-decision-interface)
- [12. Security & Governance](#12-security-governance)
  - [Chairman RLS Policies](#chairman-rls-policies)
  - [Service Authorization](#service-authorization)
  - [Audit Trail](#audit-trail)
  - [Dashboard Interaction Threat Model](#dashboard-interaction-threat-model)
  - [Agent Tool Policy Enforcement](#agent-tool-policy-enforcement)
- [13. What Already Exists vs. What Needs Building](#13-what-already-exists-vs-what-needs-building)
  - [Exists and Active](#exists-and-active)
  - [Exists but Dormant (Needs Wiring)](#exists-but-dormant-needs-wiring)
  - [Needs Building (New)](#needs-building-new)
  - [Implementation Sequence](#implementation-sequence)
  - [Phase A Validation: The First Venture Test](#phase-a-validation-the-first-venture-test)
- [14. Post-Launch Operations Architecture](#14-post-launch-operations-architecture)
  - [Event-Driven Operations Model](#event-driven-operations-model)
  - [Venture Retirement Sequence (Decision #25)](#venture-retirement-sequence-decision-25)
- [15. Saga Management for Multi-Step Operations](#15-saga-management-for-multi-step-operations)
  - [Why Sagas Are Needed](#why-sagas-are-needed)
  - [Saga Architecture](#saga-architecture)
  - [Three Saga Types](#three-saga-types)
  - [Saga State Table](#saga-state-table)
  - [Connection to Dormant Infrastructure](#connection-to-dormant-infrastructure)
- [16. Stage 0: Venture Ideation Pipeline](#16-stage-0-venture-ideation-pipeline)
  - [Overview](#overview)
  - [Entry Paths](#entry-paths)
  - [Discovery Strategies](#discovery-strategies)
  - [Synthesis Engine](#synthesis-engine)
  - [Evaluation Profile System](#evaluation-profile-system)
  - [Financial Modeling](#financial-modeling)
  - [Advanced Analytics](#advanced-analytics)
  - [Venture Nursery](#venture-nursery)
  - [Chairman Review (Current vs. Target)](#chairman-review-current-vs-target)
  - [Stage 0 → Stage 1 Contract (VentureBrief)](#stage-0-stage-1-contract-venturebrief)
  - [Database Tables (Stage 0)](#database-tables-stage-0)
- [17. Marketing Distribution Engine](#17-marketing-distribution-engine)
  - [Overview](#overview)
  - [Binding Decisions](#binding-decisions)
  - [17.8 Webhook Delivery (Local Setup)](#178-webhook-delivery-local-setup)
  - [17.9 Database Schema](#179-database-schema)
  - [17.10 Content Lifecycle State Machine](#1710-content-lifecycle-state-machine)
  - [17.11 Cron Manifest](#1711-cron-manifest)
  - [17.12 Monthly Cost Summary](#1712-monthly-cost-summary)
  - [17.13 Lock-In Exceptions & Governors](#1713-lock-in-exceptions-governors)
  - [17.14 30-Day Build Plan](#1714-30-day-build-plan)
  - [17.15 Integration with Venture Lifecycle](#1715-integration-with-venture-lifecycle)

> **Version**: 1.6
> **Created**: 2026-02-12
> **Status**: Draft
> **Companion**: [EVA Venture Lifecycle Vision v4.7](eva-venture-lifecycle-vision.md) (34 Chairman decisions + 8 OpenClaw-informed decisions)
> **Inputs**: Existing EHG database schema, EVA orchestration migrations, LEO Protocol codebase, brainstorming decisions (2026-02-11), Stage 0 CLI implementation (`lib/eva/stage-zero/`), CLI-vs-GUI triangulation analysis (Stages 1-25), 25-stage codebase-vs-triangulation audit (2026-02-12), OpenClaw architecture research + 8 binding decisions (2026-02-12), Marketing deep research — 4-source triangulation (Claude agents + Google + OpenAI + Anthropic, 2026-02-12)
> **v1.1 Changes**: Chairman Decision Interface (Section 11), resequenced implementation phases (Section 13), Saga Management for multi-step operations (Section 15)
> **v1.2 Changes**: Stage 0 Venture Ideation Pipeline (Section 16) documenting existing implementation, Service Registry updated, Phase A test scenario extended to start from Stage 0, Chairman Review interactivity gap identified
> **v1.3 Changes**: Codebase reconciliation — 10 components previously listed as "Needs Building" already exist and are production-ready. Inventory corrected, Phase A resequenced to reflect actual state.
> **v1.4 Changes**: Added Architectural Principles (Section 7) defining 5 binding design constraints derived from multi-AI triangulation consensus (Claude Opus 4.6 + OpenAI GPT 5.3 + AntiGravity/Gemini). Added 25-Stage Lifecycle Specifications (Section 8) with full target schemas, gate definitions, cross-stage contracts, and enum definitions per stage. Corrected "~6 passive stages" claim to "all 25 stages need active analysisSteps." Sections 7-14 renumbered to 9-16.
> **v1.5 Changes**: OpenClaw-informed platform capabilities. New Phase C (5 items) inserted between Phase B and former Phase C. Security section expanded with dashboard threat model and tool policy enforcement. Phase renumbering: former C→D, former D→E. GUI deprecation noted: 25-stage GUI components removed, EHG App retained for Chairman governance only.
> **v1.6 Changes**: Marketing Distribution Engine (Section 17). Complete marketing pipeline architecture derived from 4-source deep research triangulation (Claude agents + Google Deep Research + OpenAI Deep Research + Anthropic Deep Research) plus follow-up I2V model research. Binding decisions: Thompson Sampling feedback loop, direct API for X/YouTube, Late aggregator for LinkedIn/TikTok, Nano Banana Pro for images (replaces ComfyUI — API simpler than local GPU pipeline), Kling 3.0 primary + Veo 3.1 secondary for I2V video (replaces Remotion — AI-generated content more engaging than programmatic templates), Resend + custom SQL for email, PostHog Cloud for analytics, hybrid cron + event bus for orchestration. Marketing Service entry in Service Registry updated from "TBD" to full specification. Marketing pipeline added to Phase C implementation sequence (items 16-17). Monthly incremental cost: $443-639/mo (includes X API $200, Late $33-49, Resend $20-90, Nano Banana ~$0-200, I2V ~$50-200, PostHog free tier).

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
| **Marketing Service** | GTM & growth | GTM strategy (Stage 11), channel analysis, growth optimization (Stage 25 expand), content generation + variant testing, multi-platform distribution, AI feedback loop (Thompson Sampling), cross-venture intelligence transfer | Marketing Distribution Engine (Section 17): Nano Banana Pro (images) + Sharp.js (brand overlay), Kling 3.0 + Veo 3.1 (I2V video), Resend (email), direct API (X/YouTube) + Late aggregator (LinkedIn/TikTok), PostHog Cloud (analytics), hybrid cron + event bus (orchestration) |
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

## 7. Architectural Principles

> Five binding design constraints derived from multi-AI triangulation consensus (Claude Opus 4.6, OpenAI GPT 5.3, AntiGravity/Gemini). These principles apply uniformly across all 25 stages and govern all stage template evolution.

### 7.1 Active Analysis

**Every stage (2–25) SHALL include an `analysisStep` that generates content via LLM.**

The triangulation audit found that all 25 CLI stage templates are passive containers — they accept data, validate it, and compute derived fields, but none generate analytical content. This is the single largest architectural gap.

- **Pattern**: Each `analysisStep` consumes upstream stage artifacts and produces structured analytical output using the LLM Client Factory (`getLLMClient()`).
- **Stage 1 exception**: Stage 1 is the initial human input stage. It does not generate analysis but hydrates fields from Stage 0 output.
- **MoA pattern**: Where multiple analytical perspectives are needed (e.g., Stage 2), use a single LLM call with multi-persona prompt ("Mixture of Agents") rather than multiple sequential calls.
- **Advisory, not synthetic**: analysisSteps produce analytical scaffolds and recommendations. They do not fabricate evidence or generate test results.

### 7.2 Decision-Based Gates

**All gate outcomes SHALL use enum decisions, not boolean flags.**

Boolean gates (`quality_gate_passed: true/false`) lose context and prevent nuanced routing. The target architecture replaces all booleans with decision enums:

| Gate Type | Decision Values | Stages |
|-----------|----------------|--------|
| Kill Gate | `pass / revise / kill` | 3, 5, 13, 23 |
| Reality Gate | `pass / conditional / fail` | 9, 12 |
| Promotion Gate | `release / hold / cancel` | 16, 22 |
| Quality Decision | `pass / conditional_pass / fail` | 20 |
| Review Decision | `approve / conditional / reject` | 21 |
| Build Readiness | `go / conditional_go / no_go` | 17 |
| Sprint Completion | `complete / continue / blocked` | 19 |
| Venture Decision | `continue / pivot / expand / sunset / exit` | 25 |

Every decision object includes: `decision` (enum), `rationale` (string), and optionally `confidence` and `key_factors`.

### 7.3 Enum Standardization

**All categorical fields SHALL use defined enums, not free text.**

Free text creates fragmentation ("Pricing" vs "Cost" vs "Monetization"), prevents aggregation, and breaks deterministic routing.

**Cross-stage enum families**:

| Family | Values | Used At |
|--------|--------|---------|
| Severity | `critical / high / medium / low` | Stages 15, 17, 19, 20 |
| Task Status | `pending / in_progress / done / blocked` | Stages 19, 23 |
| Defect Status | `open / in_progress / resolved / wontfix` | Stage 20 |
| Initiative Status | `planned / in_progress / completed / abandoned / deferred` | Stage 25 |
| Learning Category | `product / market / technical / financial / process` | Stage 24 |
| Test Type | `unit / integration / e2e` | Stage 20 |

**Stage-specific enums** (see Section 8 for complete definitions): exit_type (Stage 9), buyer_type (Stage 9), archetype (Stage 1), launch_type (Stage 23), naming_strategy (Stage 10), channel_type (Stage 11), constraint_category (Stage 14), release_category (Stage 22), pricing_model (Stages 4, 7), milestone_priority (Stage 13).

### 7.4 Cross-Stage Contracts

**Stages SHALL declare explicit producer/consumer relationships via typed artifact schemas.**

Each stage consumes artifacts from upstream stages and produces artifacts for downstream stages. These contracts are the pipeline's integrity mechanism — without them, stages operate in isolation.

```
Stage 0 ──→ Stage 1:  venture synthesis (hydration)
Stage 1 ──→ Stage 2:  problemStatement, archetype, keyAssumptions
Stage 2 ──→ Stage 3:  6 metric pre-scores (0-100), evidence packs
Stage 3 ──→ Stage 4:  competitor entities (name, positioning, threat level)
Stage 4 ──→ Stage 5:  stage5Handoff (pricing models, competitive positioning)
Stage 5 ──→ Stage 6:  unit economics, financial projections
Stages 1-8 → Stage 9:  full venture context for exit strategy synthesis
Stage 13 ──→ Stage 18: "now" milestones as sprint items
Stage 14 ──→ Stage 18: architecture context for SD enrichment
Stage 17 ──→ Stage 18: build readiness gate pass
Stage 18 ──→ Stage 19: sprint items initialize tasks
Stage 19 ──→ Stage 20: ready_for_qa flag + task references
Stage 20 ──→ Stage 21: quality_decision + defect data
Stage 21 ──→ Stage 22: review_decision + integration status
Stage 22 ──→ Stage 23: promotion_gate pass + release_decision
Stage 23 ──→ Stage 24: success_criteria for evaluation
Stages 5,16,24 → 25:  financial comparison (projected vs actual)
```

### 7.5 CLI Superiority

**The CLI implementation is authoritative. GUI-specific patterns SHALL NOT be ported.**

The triangulation analysis consistently found the CLI's architectural patterns superior across all 25 stages:

- **Pure function gates**: Kill gates are deterministic `evaluateKillGate()` functions — testable, auditable, no side effects. Do not replace with weighted scoring UI.
- **Deterministic derivation**: `computeDerived()` produces reproducible output from the same input. Do not add randomized scoring.
- **Decision Filter Engine over hardcoded thresholds**: The DFE is configurable, supports Chairman preferences, and is centrally managed. Do not replicate the GUI's per-stage hardcoded overrides.
- **Devil's Advocate as separate adversarial layer**: The CLI's decoupled DA review is architecturally superior to the GUI's all-in-one analysis.
- **Lean schema**: Capture analytical substance, not UX artifacts (tags, progress bars, wizard state, completeness indicators).

---

## 8. 25-Stage Lifecycle Specifications

> Target specifications for all 25 stages, organized by phase. Each stage defines its purpose, gate behavior, target schema v2.0, analysisStep requirements, and cross-stage contracts. These are prescriptive blueprints — the plan to achieve the vision.
>
> **Schema notation**: Fields marked (NEW) do not exist in current templates. Fields marked (CHANGED) exist but need modification. All others are existing and unchanged.

### 8.1 Phase 1: THE TRUTH (Stages 1–5)

*Purpose: Establish whether the venture idea has merit. Two kill gates (Stages 3, 5) filter out non-viable ventures before significant resources are invested.*

#### Stage 1: Draft Idea

**Template**: `stage-01.js` | **Gate**: None (entry point) | **analysisStep**: None (Stage 0 hydration only)

**Target Schema v2.0**:
- `description` (string, ≥50 chars, required)
- `problemStatement` (string, ≥20 chars, required) — NEW, feeds Stage 3 `customerNeed`
- `valueProp` (string, ≥20 chars, required)
- `targetMarket` (string, ≥10 chars, required)
- `archetype` (enum: `saas|marketplace|deeptech|hardware|services|media|fintech`, required) — NEW, drives Stage 3 scoring weights
- `keyAssumptions[]` (array of strings, optional) — NEW, validated at Stage 3/5
- `moatStrategy` (string, optional) — from Stage 0
- `successCriteria[]` (array, optional) — NEW, consumed by Stage 23
- `sourceProvenance` (per-field: `stage0|user|ai_refine`, derived) — NEW, audit trail

**Contracts**: Stage 0 synthesis → hydration | → Stage 2 (context), Stage 3 (assumptions), Stage 23 (criteria)

#### Stage 2: Idea Validation

**Template**: `stage-02.js` | **Gate**: None (pre-flight for Stage 3) | **analysisStep**: MoA multi-persona analysis

**Target Schema v2.0**:
- `analysis` (object: strategic, technical, tactical text perspectives) — NEW
- `metrics` (object: 6 scores aligned to Stage 3, each 0-100 integer) — NEW
  - `marketFit`, `customerNeed`, `momentum`, `revenuePotential`, `competitiveBarrier`, `executionFeasibility`
- `evidence` (object: market, customer, competitive, execution domains) — NEW
- `suggestions[]` (array: type `immediate|strategic` + text) — NEW
- `compositeScore` (number, derived: average of 6 metrics)
- `provenance` (object: promptHash, modelVersion, temperature, seed) — NEW

**analysisStep**: Single LLM call with MoA prompt consuming Stage 1 data. Produces 6 metric pre-scores and evidence packs. Does NOT make gate decisions — feeds Stage 3.

**Contracts**: Stage 1 → context | → Stage 3 (6 pre-scores, evidence)

#### Stage 3: Individual Validation — KILL GATE

**Template**: `stage-03.js` | **Gate**: Kill Gate (`blockProgression: true`) | **analysisStep**: Deterministic + AI hybrid scoring

**Target Schema v2.0**:
- 6 metrics (0-100 integer): `marketFit`, `customerNeed`, `momentum`, `revenuePotential`, `competitiveBarrier`, `executionFeasibility` — CHANGED (scale from 0-10 decimal to 0-100 integer)
- `overallScore` (number, derived: weighted average)
- 3 rollup dimensions (derived, for governance readability): Market, Technical, Financial
- `competitorEntities[]` (array: name, positioning, threat_level) — NEW, for Stage 4
- `confidenceScores` (per-metric confidence) — NEW

**Kill Gate Logic**:
- **Pass**: `overallScore ≥ 70 AND all metrics ≥ 50`
- **Revise**: `overallScore ≥ 50 AND < 70 AND no metric < 50` — routes back for Stage 2 re-analysis (via DFE)
- **Kill**: `overallScore < 50 OR any metric < 50`

**Score Generation**: 50% deterministic (from Stage 0/1/2 data) + 50% AI calibration (capped at ±15 per metric). DA challenges fused result separately.

**Contracts**: Stage 2 → pre-scores + evidence | → Stage 4 (competitor entities), Stage 5 (market validation)

#### Stage 4: Competitive Intel

**Template**: `stage-04.js` | **Gate**: None | **analysisStep**: Competitive landscape analysis

**Target Schema v2.0**:
- `competitors[]` (array, minItems: 3)
  - `name`, `description`, `strengths[]`, `weaknesses[]` (existing)
  - `pricingModel` (enum: `freemium|subscription|one_time|usage_based|marketplace_commission|hybrid`) — NEW
  - `marketPosition` (string) — NEW
- `blueOceanAnalysis` (object, optional) — minItems: 0 when no direct competitors exist
- `stage5Handoff` (object) — NEW, structured artifact for Stage 5
  - `pricingLandscape`, `competitivePositioning`, `marketGaps`

**analysisStep**: Consumes Stage 3 competitor entities + Stage 1 venture context. Generates competitive landscape, pricing analysis, and Stage 5 handoff artifact.

**Contracts**: Stage 3 → competitor entities | → Stage 5 (stage5Handoff), Stage 7 (pricing context)

#### Stage 5: Profitability Kill Gate — KILL GATE

**Template**: `stage-05.js` | **Gate**: Kill Gate (`blockProgression: true`) | **analysisStep**: Financial model generation

**Target Schema v2.0**:
- `projections` (existing: revenue, costs, breakEvenMonth, roi3y)
- `unitEconomics` (object) — NEW
  - `cac`, `ltv`, `ltvCacRatio` (derived), `churnRate`, `paybackMonths`, `grossMargin`
- `scenarioAnalysis` (object) — NEW: pessimistic/optimistic multipliers + robustness classification
- `assumptions` (object) — NEW: inputs used to generate projections
- `stage4Context` (object) — NEW: pricing + competitive data carried forward
- `remediationRoute` (string) — NEW: suggested stage to revisit on kill

**Kill Gate Logic** (banded):
- **Pass**: `roi3y ≥ 0.25 AND breakEvenMonth ≤ 24 AND ltvCacRatio ≥ 2 AND paybackMonths ≤ 18`
- **Conditional** (15-25% band): `0.15 ≤ roi3y < 0.25` passes ONLY IF supplementary metrics are strong (`ltvCacRatio ≥ 3`, `paybackMonths ≤ 12`)
- **Kill**: `roi3y < 0.15 OR breakEvenMonth > 24 OR breakEvenMonth === null`

**analysisStep**: Consumes Stage 4 handoff + Stage 3 market data. Generates financial projections and unit economics. Annual granularity only (no monthly).

**Contracts**: Stage 4 → stage5Handoff | → Stage 6 (unit economics), Stage 9 (financial profile), Stage 16 (projection baseline)

### 8.2 Phase 2: THE ENGINE (Stages 6–9)

*Purpose: Design the business engine — risk profile, revenue model, business model, and exit strategy. Reality Gate at Stage 9 validates Phase 2 completeness before entering Phase 3.*

#### Stage 6: Risk Assessment

**Template**: `stage-06.js` | **Gate**: None | **analysisStep**: Risk identification from Stages 1-5

**Target Schema v2.0**:
- `risks[]` (array, minItems: 3)
  - `description`, `category` (existing)
  - `probability` (integer, 1-5) — CHANGED from 3-factor to 2-factor
  - `consequence` (integer, 1-5) — CHANGED from 3-factor to 2-factor
  - `riskScore` (derived: probability × consequence, 1-25)
  - `source` (enum: `stage0|stage1|stage2|stage3|stage4|stage5|manual`) — NEW
  - `mitigationStrategy` (string)
- Aggregate metrics (derived): `averageRiskScore`, `maxRiskScore`, `highRiskCount` (score ≥ 15)

**analysisStep**: Consumes Stage 5 unit economics + Stages 1-4 venture data. Identifies risks with source attribution.

**Contracts**: Stages 1-5 → venture context | → Stage 9 (risk profile), Stage 15 (risk baseline)

#### Stage 7: Revenue Architecture

**Template**: `stage-07.js` | **Gate**: None | **analysisStep**: Revenue model synthesis

**Target Schema v2.0**:
- `pricingModel` (enum: `freemium|subscription|one_time|usage_based|marketplace_commission|hybrid`) — NEW
- `primaryValueMetric` (string) — NEW: what the customer pays for
- `priceAnchor` (object: amount, currency, period) — NEW
- `competitiveContext` (object: position vs Stage 4 competitors) — NEW
- `positioningDecision` (object: strategy, rationale) — NEW
- `revenueStreams[]`, `pricingTiers[]` (existing, enhanced with enums)

**analysisStep**: Consumes Stages 4-6 (competitive intel, profitability, risk). Generates pricing strategy with competitive positioning.

**Contracts**: Stages 4-6 → competitive + financial context | → Stage 8 (revenue streams for BMC), Stage 9 (valuation basis)

#### Stage 8: Business Model Canvas

**Template**: `stage-08.js` | **Gate**: None | **analysisStep**: 9-block BMC generation

**Target Schema v2.0**:
- 9 BMC blocks: `keyPartners`, `keyActivities`, `keyResources`, `valuePropositions`, `customerRelationships`, `channels`, `customerSegments`, `costStructure`, `revenueStreams`
- Each block item: `text` (string), `priority` (enum: `critical|high|medium|low`), `evidence` (string, source reference) — CHANGED
- `crossBlockWarnings[]` (array, derived) — NEW: validation of inter-block consistency

**analysisStep**: Consumes Stages 1-7 to generate a complete 9-block BMC. Each block cites evidence from upstream stages.

**Contracts**: Stages 1-7 → full venture context | → Stage 9 (BMC-to-exit mapping)

#### Stage 9: Exit Strategy — REALITY GATE

**Template**: `stage-09.js` | **Gate**: Reality Gate (Phase 2→3 boundary) | **analysisStep**: Exit strategy synthesis from Stages 1-8

**Target Schema v2.0**:
- `exitThesis` (string, ≥20 chars, required)
- `exitHorizonMonths` (integer, 1-120, required)
- `exitPaths[]` (array, minItems: 1)
  - `type` (enum: `acquisition|ipo|merger|mbo|liquidation`) — CHANGED from free text
  - `description`, `probabilityPct` (0-100)
- `targetAcquirers[]` (array, minItems: 3)
  - `name`, `rationale`, `fitScore` (1-5)
  - `buyerType` (enum: `strategic|financial|competitor|pe`) — NEW
- `milestones[]` (array)
  - `date`, `successCriteria`
  - `category` (enum: `financial|product|market|team`) — NEW
- `valuationEstimate` (object) — NEW
  - `method` (default: revenue_multiple), `revenueBase`, `multipleLow`, `multipleBase`, `multipleHigh`
  - `estimatedRange` (derived: {low, base, high})

**Reality Gate**: Checks Phase 2 completeness — all required stages (6-9) have validated artifacts. Blockers + next_actions structure. No scoring.

**Contracts**: Stages 1-8 → full context (BMC-to-exit mapping) | → Stage 25 (exit thesis for final review)

### 8.3 Phase 3: THE IDENTITY (Stages 10–12)

*Purpose: Establish the venture's market identity — brand, go-to-market strategy, and pipeline viability. Reality Gate at Stage 12 validates commercial readiness before entering Phase 4.*

#### Stage 10: Naming / Brand

**Template**: `stage-10.js` | **Gate**: None (Chairman review point) | **analysisStep**: Brand analysis + candidate generation

**Target Schema v2.0**:
- `brandGenome` (object: archetype, values[], tone, audience, differentiators[]) — existing
- `scoringCriteria[]` (existing, weights sum to 100)
- `candidates[]` (array, minItems: 5, scored per criterion 0-100) — existing
- `narrativeExtension` (object, optional) — NEW
  - `vision` (string), `mission` (string), `brandVoice` (string)
- `namingStrategy` (enum: `descriptive|abstract|acronym|founder|metaphorical`) — NEW
- `decision` (object) — NEW
  - `selectedName` (string), `workingTitle` (boolean), `rationale` (string)
  - `availabilityChecks` (object: domain, trademark, social — placeholder for async verification)

**analysisStep**: Consumes Stages 1-9 venture context. Generates candidate names with scoring rationale and brand narrative.

**Contracts**: Stages 1-9 → venture identity context | → Stage 11 (brand for GTM), Stage 25 (drift baseline)

#### Stage 11: Go-to-Market

**Template**: `stage-11.js` | **Gate**: None | **analysisStep**: Channel + tier strategy

**Target Schema v2.0**:
- `customerTiers[]` (array, exactly 3 tiers)
  - `name`, `description`, `size`, `budget` (existing)
  - `persona` (string) — NEW
  - `painPoints[]` (array) — NEW
  - `targetCac` (number, allow 0) — CHANGED from `expectedCac`
- `channels[]` (array, exactly 8 channels)
  - `name`, `description`, `budget` (existing, allow $0)
  - `channelType` (enum: `paid|organic|earned|owned`) — NEW
  - `primaryTier` (string, references tier name)

**analysisStep**: Consumes Stages 1-10 context. Generates channel strategy per tier with budget allocation.

**Contracts**: Stages 1-10 → brand + market context | → Stage 12 (channel data for pipeline), Stage 22 (GTM for release)

#### Stage 12: Pipeline Viability — REALITY GATE

**Template**: `stage-12.js` | **Gate**: Reality Gate (Phase 3→4 boundary) | **analysisStep**: Pipeline + economy validation

**Target Schema v2.0**:
- `deals[]` (array, minItems: 3)
  - `name`, `value`, `stage`, `probability` (existing)
  - `mappedFunnelStage` (string) — NEW, links to funnel position
- `funnel` (object: stages with names + counts)
  - `conversionRateEstimate` (number, per stage) — NEW
- Economy Check fields (derived): total pipeline value, weighted pipeline, average deal size

**Reality Gate**: Checks Phase 3 completeness (Stages 10-12 validated) + Economy Check. Validates weighted pipeline supports financial projections from Stage 5.

**Contracts**: Stages 10-11 → brand + GTM data | → Stage 13 (market context for roadmap)

### 8.4 Phase 4: THE BLUEPRINT (Stages 13–16)

*Purpose: Translate the validated venture into an execution plan — roadmap, architecture, risk register, and financial projections. Promotion Gate at Stage 16 gates entry to the BUILD LOOP. No GUI exists for Phase 4; CLI is authoritative.*

#### Stage 13: Product Roadmap — KILL GATE

**Template**: `stage-13.js` | **Gate**: Kill Gate | **analysisStep**: Roadmap generation from Stages 1-12

**Target Schema v2.0**:
- `milestones[]` (array, minItems: 1)
  - `title`, `description`, `targetDate` (existing)
  - `priority` (enum: `now|next|later`) — NEW, drives Stage 18 sprint planning
  - `deliverables[]` (array)
    - `name`, `description` (existing)
    - `type` (enum: `feature|infrastructure|integration|documentation`) — NEW
  - `outcomes[]` (array of strings) — NEW, measurable success criteria per milestone
  - `dependencies[]` (array of milestone references, optional)

**Kill Gate**: Validates roadmap feasibility — at least one "now" milestone with deliverables, realistic dates, outcomes defined.

**Contracts**: Stages 1-12 → full venture context | → Stage 14 (deliverables for architecture), Stage 18 ("now" milestones as sprint items)

#### Stage 14: Technical Architecture

**Template**: `stage-14.js` | **Gate**: None | **analysisStep**: Architecture synthesis from Stage 13

**Target Schema v2.0**:
- `layers[]` (array: presentation, api, business_logic, data, infrastructure) — existing
  - `additionalLayers[]` (array, optional) — NEW, for domain-specific layers
- `constraints[]` (array)
  - `description`, `impact` (existing)
  - `category` (enum: `performance|security|scalability|compliance|budget|timeline`) — NEW
- `security` (object) — NEW, cross-cutting concern
  - `authStrategy`, `dataClassification`, `complianceRequirements[]`
- `dataEntities[]` (array) — NEW, Schema-Lite
  - `name`, `description`, `relationships[]`, `estimatedVolume`
- `techStack` (object, existing)

**analysisStep**: Consumes Stage 13 deliverables + Stage 6 risks. Generates architecture layers, constraints, and security requirements.

**Contracts**: Stage 13 → deliverables | → Stage 15 (architecture risks), Stage 18 (architecture context for SDs)

#### Stage 15: Risk Register

**Template**: `stage-15.js` | **Gate**: None | **analysisStep**: Risk identification from Stages 13-14

**Target Schema v2.0**:
- `risks[]` (array, minItems: 1)
  - `title`, `description`, `owner` (existing)
  - `severity` (enum: `critical|high|medium|low`) — CHANGED from free text
  - `priority` (enum: `immediate|short_term|long_term`) — CHANGED from free text
  - `phaseRef` (string) — NEW, links risk to roadmap phase
  - `mitigationPlan`, `contingencyPlan` (existing)
- `budgetCoherence` (object, derived) — NEW
  - Validates risk mitigation costs align with Stage 16 financial projections

**analysisStep**: Consumes Stages 13-14. Identifies execution risks with severity and priority classification.

**Contracts**: Stages 6, 13-14 → risk context + architecture | → Stage 16 (risk costs), Stage 17 (blockers)

#### Stage 16: Financial Projections — PROMOTION GATE

**Template**: `stage-16.js` | **Gate**: Promotion Gate (Phase 4→5 boundary) | **analysisStep**: Detailed financial modeling

**Target Schema v2.0**:
- `phases[]` (array, one per roadmap phase from Stage 13)
  - `phaseName`, `duration`
  - `costs` (object: personnel, infrastructure, marketing, other) — CHANGED from flat monthly burn
  - `revenue` (object: projected per pricing model from Stage 7)
- `pnl` (object, Startup Standard P&L) — NEW
  - Revenue, COGS, Gross Margin, OpEx (R&D, S&M, G&A), EBITDA, Net Income
- `cashBalanceEnd` (number, derived) — NEW, running cash position
- `viabilityWarnings[]` (array, derived) — NEW
  - Triggered when: cash < 3 months runway, burn rate exceeds plan, margins below Stage 5 projections

**Promotion Gate**: Validates financial viability — positive cash trajectory, manageable burn, margins aligned with Stage 5 kill gate projections.

**Contracts**: Stages 5, 7, 13-15 → projections + costs | → Stage 17 (financial readiness), Stage 25 (projection baseline for comparison)

### 8.5 Phase 5: THE BUILD LOOP (Stages 17–22)

*Purpose: Execute the plan — sprint planning, implementation, QA, review, and release. Promotion Gate at Stage 22 gates entry to LAUNCH. This phase cycles: ventures may loop through Stages 17-22 multiple times (one loop per sprint).*

#### Stage 17: Build Readiness

**Template**: `stage-17.js` | **Gate**: None (readiness assessment) | **analysisStep**: Readiness synthesis from Stages 13-16

**Target Schema v2.0**:
- `readinessItems[]` (array)
  - `name`, `description`, `status` (existing)
  - `priority` (enum: `critical|high|medium|low`) — NEW
- `blockers[]` (array)
  - `description`, `owner` (existing)
  - `severity` (enum: `critical|high|medium|low`) — NEW
- `buildReadiness` (object) — NEW, decision
  - `decision` (enum: `go|conditional_go|no_go`)
  - `rationale` (string)
  - `conditions[]` (array, required if conditional_go)

**analysisStep**: Consumes Stages 13-16. Assesses build readiness against roadmap, architecture, risks, and financials.

**Contracts**: Stages 13-16 → blueprint context | → Stage 18 (readiness gate pass)

#### Stage 18: Sprint Planning

**Template**: `stage-18.js` | **Gate**: Stage 17 readiness must pass | **analysisStep**: Sprint item generation

**Target Schema v2.0**:
- `sprintGoal` (string, required)
- `sprintItems[]` (array, minItems: 1)
  - `title`, `description`, `type`, `estimatedLoc`, `acceptanceCriteria` (existing)
  - `architectureLayer` (string, from Stage 14) — enriched via SD Bridge
  - `milestoneRef` (string, references Stage 13 "now" milestone)
- `sdBridgeOutput` (object, derived) — SD Bridge creates orchestrator + child SDs

**analysisStep**: Consumes Stage 13 "now" deliverables filtered by Stage 17 readiness gate. Generates sprint items with architecture context from Stage 14.

**SD Bridge** (`lib/eva/lifecycle-sd-bridge.js`): Converts sprint items to LEO Strategic Directives — 1 orchestrator SD + N child SDs per sprint.

**Contracts**: Stages 13-14, 17 → roadmap + architecture + readiness | → Stage 19 (sprint items as tasks), LEO (SD Bridge)

#### Stage 19: Sprint Execution

**Template**: `stage-19.js` | **Gate**: None (progress tracking) | **analysisStep**: Progress synthesis

**Target Schema v2.0**:
- `tasks[]` (array, initialized from Stage 18 sprint items)
  - `name`, `description`, `assignee` (existing)
  - `status` (enum: `pending|in_progress|done|blocked`) — CHANGED from free text
- `issues[]` (array)
  - `description` (existing)
  - `severity` (enum: `critical|high|medium|low`) — CHANGED from free text
  - `status` (enum: `open|in_progress|resolved|wontfix`) — CHANGED from free text
- `sprintCompletion` (object) — NEW, decision
  - `decision` (enum: `complete|continue|blocked`)
  - `readyForQa` (boolean, gates Stage 20)
  - `rationale` (string)

**Contracts**: Stage 18 → sprint items | → Stage 20 (ready_for_qa + task refs)

#### Stage 20: Quality Assurance

**Template**: `stage-20.js` | **Gate**: Stage 19 `readyForQa` must be true | **analysisStep**: QA plan generation

**Target Schema v2.0**:
- `testSuites[]` (array, minItems: 1)
  - `name`, `totalTests`, `passingTests`, `coveragePct` (existing)
  - `type` (enum: `unit|integration|e2e`) — NEW
  - `taskRefs[]` (array, optional) — NEW, Stage 19 tasks covered
- `knownDefects[]` (array)
  - `description` (existing)
  - `severity` (enum: `critical|high|medium|low`) — CHANGED from free text
  - `status` (enum: `open|in_progress|resolved|wontfix`) — CHANGED from free text
  - `testSuiteRef` (string, optional) — NEW
- `totalFailures` (number, derived) — CHANGED: renamed from `criticalFailures`
- `overallPassRate` (number, derived: ≥95% threshold)
- `coveragePct` (number, derived: ≥60% threshold)
- `qualityDecision` (object) — NEW, replaces `quality_gate_passed` boolean
  - `decision` (enum: `pass|conditional_pass|fail`)
  - `rationale` (string)

**Contracts**: Stage 19 → ready_for_qa + tasks | → Stage 21 (quality_decision + defects)

#### Stage 21: Build Review

**Template**: `stage-21.js` | **Gate**: None (review checkpoint) | **analysisStep**: Integration + review synthesis

**Target Schema v2.0**:
- `integrations[]` (array)
  - `name`, `status` (existing)
  - `severity` (enum: `critical|high|medium|low`) — NEW, per integration
  - `environment` (enum: `development|staging|production`) — NEW
- `reviewDecision` (object) — NEW
  - `decision` (enum: `approve|conditional|reject`)
  - `rationale` (string)
  - `conditions[]` (array, required if conditional)

**analysisStep**: Consumes Stage 20 quality data + integration status. Produces technical review assessment. Stage 21 is "Technical review" — assesses whether the build is sound. Stage 22 is "Business review" — assesses whether to release.

**Contracts**: Stage 20 → quality_decision + defects | → Stage 22 (review_decision + integration status)

#### Stage 22: Release Readiness — PROMOTION GATE

**Template**: `stage-22.js` | **Gate**: Promotion Gate (Phase 5→6 boundary) | **analysisStep**: BUILD LOOP closeout synthesis

> **P0 FIX**: Current promotion gate references stale boolean contracts (`quality_gate_passed`, `all_passing`). Must update to reference `qualityDecision.decision` (Stage 20) and `reviewDecision.decision` (Stage 21).

**Target Schema v2.0**:
- `releaseItems[]` (array, minItems: 1)
  - `name`, `status` (enum: `pending|approved|rejected`), `approver` (existing)
  - `category` (enum: `feature|bugfix|infrastructure|documentation|configuration`) — CHANGED from free text
- `releaseNotes` (string, required), `targetDate` (string, ISO date format) — existing, enhanced
- `releaseDecision` (object) — NEW
  - `decision` (enum: `release|hold|cancel`)
  - `rationale` (string), `approver` (string)
- `sprintRetrospective` (object, optional) — NEW
  - `wentWell[]`, `wentPoorly[]`, `actionItems[]` (arrays of strings)
- `sprintSummary` (object, derived) — NEW
  - `sprintGoal`, `itemsPlanned`, `itemsCompleted`, `qualityAssessment`, `integrationStatus`

**Promotion Gate**: Requires `qualityDecision.decision ∈ {pass, conditional_pass}` AND `reviewDecision.decision ∈ {approve, conditional}` AND `releaseDecision.decision = 'release'`. Conditional states produce warnings, not blockers — the human `releaseDecision` is the final call.

**Contracts**: Stages 17-21 → full BUILD LOOP data | → Stage 23 (promotion gate pass + release decision)

### 8.6 Phase 6: LAUNCH & LEARN (Stages 23–25)

*Purpose: Launch the venture and learn from real-world performance. Kill Gate at Stage 23 prevents premature launch. Stage 25 produces the capstone venture decision — the single most important output of the entire 25-stage lifecycle.*

#### Stage 23: Launch Execution — KILL GATE

**Template**: `stage-23.js` | **Gate**: Kill Gate | **analysisStep**: Launch readiness brief

**Target Schema v2.0**:
- `launchType` (enum: `soft_launch|beta|general_availability`) — NEW, affects Stage 24 interpretation
- `goDecision` (enum: `go|no-go`, required) — existing
- `launchTasks[]` (array, minItems: 1)
  - `name`, `owner` (existing)
  - `status` (enum: `pending|in_progress|done|blocked`) — CHANGED from free text
- `plannedLaunchDate` (string, ISO date, required) — CHANGED: validated format
- `actualLaunchDate` (string, ISO date, optional)
- `successCriteria[]` (array, minItems: 1) — NEW, contract with Stage 24
  - `metric` (string), `target` (string), `measurementWindow` (string)
  - `priority` (enum: `primary|secondary`)
- `rollbackTriggers[]` (array) — NEW
  - `condition` (string), `action` (string)
- `incidentResponsePlan`, `monitoringSetup`, `rollbackPlan` (string, existing)

**Kill Gate**: Validates upstream signals — Stage 22 `promotionGate = pass` AND `releaseDecision = 'release'` as hard prerequisites. Plus: all launch tasks not blocked, success criteria defined, go_decision = 'go'.

**Contracts**: Stage 22 → promotion gate + release decision | → Stage 24 (success_criteria for evaluation)

#### Stage 24: Metrics & Learning

**Template**: `stage-24.js` | **Gate**: None (measurement stage) | **analysisStep**: Launch scorecard generation

**Target Schema v2.0**:
- `aarrr` (object: acquisition, activation, retention, revenue, referral — each array of metrics) — existing
  - Per metric: `name`, `value`, `target` (existing)
  - `trendWindowDays` (number, optional), `previousValue` (number) — NEW, for trend calculation
  - `trendDirection` (enum: `up|flat|down`, derived) — NEW
  - `criterionRef` (string, optional) — NEW, links to Stage 23 success criterion
- `funnels[]` (array) — existing, enhanced
  - Steps: `name` (string), `count` (number) — CHANGED from untyped
  - `conversionRates[]` (derived)
- `learnings[]` (array) — existing, enhanced
  - `category` (enum: `product|market|technical|financial|process`) — NEW
  - `impactLevel` (enum: `high|medium|low`, optional) — NEW
- `launchOutcome` (object, derived) — NEW
  - `assessment` (enum: `success|partial|failure|indeterminate`)
  - `criteriaMetRate` (number: % of Stage 23 criteria met)

**analysisStep**: Evaluates Stage 23 success criteria against AARRR metrics. Produces launch scorecard with per-criterion assessment. Interprets metrics in context of `launchType` (beta expectations ≠ GA expectations).

**Contracts**: Stage 23 → success criteria + launch type | → Stage 25 (metrics + learnings for venture review)

#### Stage 25: Venture Review

**Template**: `stage-25.js` | **Gate**: None (capstone review) | **analysisStep**: Full venture journey synthesis

**Target Schema v2.0**:
- `reviewSummary` (string, ≥20 chars, required), `currentVision` (string, required) — existing
- `initiatives` (object: product, market, technical, financial, team categories) — existing
  - Per item: `title`, `outcome` (existing)
  - `status` (enum: `planned|in_progress|completed|abandoned|deferred`) — CHANGED from free text
- `ventureDecision` (object, required) — NEW, THE capstone output
  - `decision` (enum: `continue|pivot|expand|sunset|exit`)
  - `rationale` (string, required)
  - `confidence` (enum: `high|medium|low`)
  - `keyFactors[]` (array of strings)
- `nextSteps[]` (array, minItems: 1) — existing, enhanced
  - `action`, `owner`, `timeline` (existing)
  - `priority` (enum: `critical|high|medium|low`) — NEW
  - `category` (enum: `product|market|technical|financial|team`) — NEW
- `ventureHealth` (object, derived) — NEW, 5-dimension assessment
  - `product`, `market`, `technical`, `financial`, `team` (each 0-100)
  - `overall` (0-100), `band` (enum: `critical|fragile|viable|strong`)
- `financialComparison` (object, derived) — NEW
  - `projectionSource` (string: "Stage 5" or "Stage 16")
  - `revenueVariancePct` (number), `unitEconomicsAssessment` (string)
  - `financialTrajectory` (enum: `improving|flat|declining`)
- `driftCheck` (object, derived) — existing, enhanced
  - `wordOverlapPct`, `wordOverlapDrift` (existing)
  - `semanticDrift` (enum: `aligned|moderate_drift|major_drift`) — NEW
  - `rationale` (string) — NEW

**analysisStep**: The most complex in the pipeline. Consumes Stages 1 (origin vision), 5/16 (projections), 13 (roadmap), 20-22 (quality/review/release), 23 (launch), 24 (metrics). Produces: journey summary, financial comparison, drift analysis, venture health assessment, and decision recommendation.

**Contracts**: All prior stages → full venture journey | → Cross-Venture Learning (patterns for other ventures), Next iteration (venture_decision determines path: continue → new BUILD LOOP, pivot → revisit ENGINE/IDENTITY, expand → scale, exit → lifecycle complete)

---

## 9. LEO Protocol Integration

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

## 10. Portfolio Intelligence (Architecture)

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

## 11. Chairman Dashboard (Architecture)

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

## 12. Security & Governance

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

### Dashboard Interaction Threat Model

The EHG App dashboard extends Chairman governance to a web interface. Security considerations:

| Threat | Mitigation | Status |
|--------|-----------|:------:|
| **Unauthorized decision submission** | RLS via `fn_is_chairman()` on `chairman_decisions` table. Only authenticated Chairman can INSERT/UPDATE. | Built |
| **Session hijacking** | Supabase Auth with JWT tokens. Session expiry + refresh token rotation. | Built (Supabase native) |
| **Decision replay attacks** | Each decision has unique `id` + `venture_id` + `stage` compound key. Duplicate submissions rejected by DB constraint. | Built |
| **Realtime subscription spoofing** | Supabase Realtime respects RLS policies. Unauthorized clients cannot subscribe to Chairman channels. | Built (Supabase native) |
| **Dashboard CSRF** | React SPA with Supabase client-side auth. No cookie-based sessions to exploit. | Mitigated by architecture |
| **Stale decision context** | Decision payloads include `artifact_version` reference. If venture state changed since payload generation, decision rejected with stale context error. | Needs building (Phase C) |

### Agent Tool Policy Enforcement

Per-agent tool profiles control what operations each LEO sub-agent can perform:

| Profile | Allowed Operations | Assigned To |
|---------|-------------------|-------------|
| **full** | All tools (Bash, Read, Write, Edit, Task, etc.) | General-purpose agents, orchestrator children |
| **coding** | Read, Write, Edit, Bash (sandboxed), Grep, Glob | Implementation-focused agents |
| **readonly** | Read, Grep, Glob, WebSearch, WebFetch | Research agents (Explore, Plan, RCA) |
| **minimal** | Read, Grep, Glob | Validation-only agents |

**Enforcement point**: Agent compiler (`scripts/generate-agent-md.js`) injects tool restrictions at spawn time. Sub-agents spawned via Task tool inherit the profile from their agent definition in the database (`agent_sub_agents` table). Profile violations are prevented at the tool-call layer, not by trust.

---

## 13. What Already Exists vs. What Needs Building

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
| **Stage template gap-fill** | All 25 stage templates are passive containers (validate-only). Triangulation analysis confirmed ALL stages (2-25) need active `analysisSteps` (see Section 7.1, Section 8). | P0 |
| **Event bus handler wiring** | Connect dormant event bus infrastructure to service invocations (bus publishes events; nothing currently listens) | P0 |
| **EVA Master Scheduler** | Portfolio-level scheduling, priority queue processing | P1 |
| **Chairman Dashboard** | Decision queue + health heatmap + event feed | P1 |
| **Chairman Notification Service** | Push + digest notification batching | P1 |
| **Venture Template System** | Auto-generate and apply templates from successful ventures (cross-venture-learning.js provides the pattern analysis; template extraction + application layer needed) | P2 |
| **Inter-Venture Dependency Manager** | Dependency graph with auto-blocking (`venture_dependencies` table schema defined; manager code needed) | P2 |
| **Marketing Content Generator** | LLM-driven content creation with venture context loading, variant generation (headline/body/CTA/visual), Thompson Sampling arm initialization | P1 |
| **Marketing Asset Pipeline** | Nano Banana Pro image generation (Gemini API, `gemini-3-pro-image-preview`), Sharp.js brand overlay (logos, CTAs), I2V video via Kling 3.0 (primary) + Veo 3.1 (secondary) + Runway Gen-4 Turbo (fallback), per-venture brand templates in DB | P1 |
| **Marketing Publisher** | Multi-platform distribution: direct API (X Basic $200/mo, YouTube Data API v3 free, Bluesky/Mastodon/Threads free), Late aggregator ($33-49/mo for LinkedIn/TikTok), rate limiting per platform | P1 |
| **Marketing Metrics Ingestor** | Platform API polling (hourly) + PostHog webhook receiver, UTM-based last-touch attribution, daily rollup materialization, composite reward calculation (0.3 × engagement + 0.7 × conversion) | P1 |
| **Marketing AI Optimizer** | Thompson Sampling with Beta distributions, three cadences (hourly channel allocation, daily variant promotion, weekly cross-venture intelligence transfer), contextual bandits per business model type | P1 |
| **Marketing Email Engine** | Resend integration ($20-90/mo), custom drip campaign logic in PostgreSQL (state machine pattern), venture-specific sender domains, unsubscribe/bounce handling | P2 |
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

The sequence is ordered so that **each phase produces a testable end-to-end capability**. Phase A can shepherd a single venture through all 25 stages manually. Phase B automates scheduling and the Chairman experience. Phase C adds OpenClaw-inspired platform capabilities (hybrid runtime, tool policies, skill packaging, semantic search). Phase D adds multi-venture intelligence. Phase E optimizes.

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
     └── Stage 0 pipeline already built (Section 16); only the interactive review is missing
  2. Chairman Decision API (chairman_decisions table + Realtime subscription + CLI)
     └── Table exists; need CLI commands (eva decisions list/approve/reject) + Realtime wiring
     └── Unblocks Stages 0, 10, 22, 25 — without this, Phase A deadlocks
  3. Stage template gap-fill (add active analysisSteps to ALL passive templates)
     └── All 25 stage templates need active analysisSteps (see Section 7.1, Section 8)
     └── Stage templates 1-25 exist as containers; ALL need LLM-driven analysisSteps
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

Phase C: Platform Capabilities — OpenClaw-Inspired (P2)
  Goal: EVA becomes an always-on, reactive+scheduled platform with
  intelligent agent management and semantic cross-venture learning.

  11. Event-driven venture monitor
      └── Supabase Realtime listener for chairman_decisions, venture_artifacts,
          orchestration_metrics changes → immediate venture advancement
      └── Cron scheduler for planned batch runs: ops cycles, portfolio health
          sweeps, release scheduling
      └── Implements hybrid runtime model (Vision Section 3)
  12. Chairman dashboard wiring (EHG App → CLI governance plane)
      └── Wire existing DecisionsInbox approve/reject to chairman_decisions table
      └── Wire EscalationPanel to DFE escalation events
      └── Add stale-context detection (reject decisions on changed venture state)
      └── Remove 25-stage GUI components (CLI handles all stage progression)
  13. Per-agent tool policy profiles
      └── Define full/coding/readonly/minimal profiles in agent_sub_agents table
      └── Agent compiler enforces profile at .md generation time
      └── Runtime validation: sub-agent tool calls checked against profile
  14. Skill packaging system (SKILL.md format)
      └── Evolve current .partial.md files to versioned SKILL.md bundles
      └── Each skill declares requirements (tools, context, memory access)
      └── Agent compiler selectively injects skills per turn based on task context
      └── Skills are versioned and can be shared across agents
  15. Hybrid semantic search for cross-venture learning
      └── SQLite vector index over issue_patterns + venture_artifacts
      └── Local Ollama embeddings (reuse existing LLM factory infrastructure)
      └── BM25 keyword matching as fallback/complement
      └── Enhances cross-venture-learning.js with similarity-based retrieval
  16. Marketing Distribution Engine — data foundation + publisher
      └── Database schema: marketing_events, marketing_content, marketing_content_variants,
          marketing_experiments, marketing_daily_rollups, bandit_state, bandit_arms
      └── Content generator service (LLM + venture context → variants)
      └── Publisher abstraction layer (direct API + Late aggregator)
      └── Platform integrations: X API (Basic $200/mo), YouTube Data API v3,
          Late ($33-49/mo for LinkedIn/TikTok), Bluesky/Mastodon/Threads (free)
      └── Rate limiting via unified event bus (replaces former BullMQ design)
      └── UTM-based attribution + PostHog Cloud analytics
  17. Marketing Distribution Engine — AI feedback loop + assets
      └── Thompson Sampling optimizer (Beta distributions, composite reward)
      └── Three cadences: hourly (channel allocation), daily (variant promotion
          via Champion-Challenger), weekly (cross-venture intelligence transfer)
      └── Nano Banana Pro image generation (Gemini API) + Sharp.js brand overlays
      └── I2V video: Kling 3.0 primary, Veo 3.1 secondary, Runway Gen-4 Turbo fallback
          (multi-provider routing via Media Client Factory, same pattern as LLM Client Factory)
      └── Resend email integration + custom SQL drip campaigns
      └── Metrics ingestor (platform API polling + webhook receiver)

  Test: Supabase Realtime detects Chairman decision in dashboard →
  venture auto-advances. Cron runs nightly portfolio sweep.
  Sub-agent spawned with readonly profile cannot write files.
  Skill injected only when task context matches skill requirements.
  Semantic search returns related issue patterns across ventures.
  Marketing publisher posts to X via direct API, content variant selected
  by Thompson Sampling, metrics ingested hourly, daily rollup triggers
  variant promotion, cross-venture intelligence transfers weekly.

Phase D: Portfolio Intelligence (P3)
  18. Venture template system (extraction + application — cross-venture-learning.js provides analysis)
  19. Inter-venture dependency manager (venture_dependencies schema defined; manager code needed)

Phase E: Optimization (P4)
  20. Shared services abstraction layer
  21. Expand-vs-spinoff evaluator
  22. Advanced portfolio optimization (resource contention, priority re-ranking)
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

## 14. Post-Launch Operations Architecture

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

## 15. Saga Management for Multi-Step Operations

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

## 16. Stage 0: Venture Ideation Pipeline

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

**Target architecture** (see Section 11, Chairman Decision Interface):
- `conductChairmanReview()` writes to `chairman_decisions` table with full synthesis context
- Chairman reviews in Dashboard (brief, synthesis scores, forecast, archetype, moat strategy)
- Chairman submits: Approve / Park / Edit brief / Kill
- Supabase Realtime broadcasts → event bus → `persistVentureBrief()` executes

**Gap**: The only missing piece is the integration between `conductChairmanReview()` and `chairman_decisions`. The synthesis, scoring, and persistence are all built. This is listed as P0 item #1 in the implementation sequence (Section 13).

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

## 17. Marketing Distribution Engine

### Overview

The Marketing Distribution Engine is a fully automated, AI-driven marketing pipeline that generates content, distributes it across platforms, measures performance, and self-optimizes through a Thompson Sampling feedback loop. It operates as a shared service (Section 2): stateless, venture-context-loaded, database-backed.

**Research basis**: 4-source deep research triangulation (Claude agents + Google Deep Research + OpenAI Deep Research + Anthropic Deep Research), plus follow-up I2V model research and 3-source peer review of locked-in decisions.

```
Venture context (brand, audience, stage, prior performance)
    │
    ▼
Content Generator (LLM + venture context → text variants)
    │
    ├── Image Generator (Nano Banana Pro → Sharp.js brand overlay)
    ├── Video Generator (Kling 3.0 / Veo 3.1 / Runway fallback)
    └── Email Generator (LLM → Resend)
    │
    ▼
Publisher (Direct API: X, YouTube, Bluesky, Mastodon, Threads │ Late aggregator: LinkedIn, TikTok)
    │
    ▼
Metrics Ingestor (platform API polling + PostHog webhooks)
    │
    ▼
AI Optimizer (Thompson Sampling → next cycle's content decisions)
    │
    ▼
Cross-Venture Intelligence (weekly transfer of priors to new/similar ventures)
```

### Binding Decisions

All decisions below are **locked-in** based on triangulated research and Chairman approval. Each includes the rationale and the alternatives that were evaluated and rejected.

#### 17.1 Social Media Posting

| Platform | Method | Cost | Rationale |
|----------|--------|------|-----------|
| **X/Twitter** | Direct API (Basic tier) | $200/mo (current); treat as variable — see Governor below | 50K posts + 15K reads. Full control, no middleman. |
| **YouTube** | Direct API (Data API v3) | Free (10K units/day) | Google gives generous default quota. |
| **LinkedIn** | Late aggregator | $33-49/mo | <10% direct API approval rate, 3-6 month review process. Late handles OAuth. |
| **TikTok** | Late aggregator | (included in Late plan) | Content Posting API exists but unaudited clients are heavily constrained (private/self-only publishing). Late provides audited access. |
| **Bluesky** | Direct API | Free | AT Protocol, open, no approval needed. |
| **Mastodon** | Direct API | Free | ActivityPub, open, no approval needed. |
| **Threads** | Direct API | Free | Meta API (requires App Review, but straightforward for posting). |
| **Reddit** | Skip by default | $0 | Hostile to automated marketing; sued 4 companies Oct 2025 for scraping. **Exception**: Enable per-venture on Chairman request for Reddit-native niches (dev tools, gaming). Publisher abstraction does not hard-block Reddit. |

**X/Twitter Spend-Cap Governor**: X pricing is volatile (pay-per-use pilot active, may replace fixed tiers). Architecture includes:
- Hard monthly budget per venture (default: $50/venture/mo for X)
- Stop-loss rule: halt posting if daily spend exceeds 2× rolling average
- Bias toward write-heavy / read-light workflows (reads are costlier in per-use models)
- Budget tracked in `marketing_channel_budgets` table

**Rejected alternatives**:
- **Postiz** (self-hosted social scheduler): Showstopper bugs — API posts stuck in QUEUE (Issue #818), LinkedIn broken since Jan 2026, no webhooks, all accounts share one OAuth app's rate limits.
- **Ayrshare**: $299/mo minimum for multi-profile. Late does the same for $33-49/mo.
- **Browser automation**: 5 of 6 research sources rejected. LinkedIn explicitly prohibits. Legal landscape hostile (Google, Reddit, Amazon sued automation companies).

#### 17.2 Image Generation

| Component | Technology | Cost |
|-----------|-----------|------|
| **Creative generation** | Nano Banana Pro (`gemini-3-pro-image-preview`) | $0.067/image (2K batch), $0.12/image (4K batch), free tier 1,500/mo |
| **Brand overlay** | Sharp.js (Node.js) | Free (npm package) |

**How it works**:
1. Content generator determines visual brief (subject, mood, composition, aspect ratio)
2. Nano Banana Pro generates image with up to 14 reference images for brand consistency (brand palette, logo, prior approved visuals, style guide screenshots)
3. Sharp.js post-processes for deterministic overlays: logo at exact coordinates, CTA button, legal text, watermark
4. Final image stored in venture's asset bucket, linked to `marketing_content_variants` record

**Why Nano Banana Pro (not ComfyUI)**:
- Zero infrastructure — API call vs. maintaining ComfyUI server + SDXL/Flux models + IP-Adapter + ControlNet + LoRAs
- 14 reference images per request replaces IP-Adapter for style consistency
- Native text rendering (via "Thinking" reasoning) eliminates most Sharp.js needs except exact logo placement
- Up to 4K resolution
- SynthID watermark included (transparency for AI-generated content)

**Rejected**: ComfyUI + SDXL/Flux local pipeline. More control but dramatically more infrastructure complexity. API-first wins for a marketing engine where iteration speed matters more than pixel-level control.

#### 17.3 Video Generation (Image-to-Video)

| Provider | Role | Cost/sec | Trigger |
|----------|------|----------|---------|
| **Kling 3.0** | Primary (default) | $0.056-0.070/s | All marketing video. Long-form (>10s), product narratives, complex actions, A→B transformations. |
| **Veo 3.1 Standard** | Secondary (hero only) | $0.40/s | Hero content only — brand launch videos, flagship campaigns. Must be explicitly tagged "hero" tier by optimizer or Chairman. |
| **Runway Gen-4 Turbo** | Fallback | $0.05/s | Triggered by primary + secondary API failure only, not by content type. |

**Routing rules** (prevent Veo cost drift):
- Default route: Kling 3.0 for ALL video generation
- Veo 3.1: ONLY when `content_tier = 'hero'` (set by optimizer for top-performing content or manually by Chairman)
- Runway: ONLY on `provider_error` from both Kling and Veo (circuit breaker pattern)
- Budget governor per venture per month for I2V spend

**Why Kling 3.0 primary**:
- Start/end frame control — unique feature for marketing "before → after" narratives
- 15+ second duration — longest of any top-tier model without quality degradation
- Best complex human actions (eating, typing, using a product)
- Native audio generation
- Cheapest top-tier at $0.056-0.070/s (bonus, not the reason)

**Multi-provider routing**: Same pattern as LLM Client Factory (`lib/llm/client-factory.js`):

```
getMediaClient({ type: 'video', venture, contentTier })
    │
    ├── contentTier = 'hero' → Veo 3.1 Standard (Google Gemini API)
    ├── default → Kling 3.0 (Kling Global Developer API)
    └── on failure → Runway Gen-4 Turbo (RunwayML API)
```

**Future lane (not built now)**: Deterministic/programmatic video via Remotion for product UI walkthroughs, data-viz recaps, and templated comparisons. The publisher abstraction layer is extensible to add this lane when needed. Remotion is free for companies ≤3 people.

**Rejected as primary**: Sora 2 (access restrictions tightening, $0.10-0.50/s without clear quality advantage over Kling for marketing), Luma Ray3 (good but doesn't fill a gap Kling/Veo don't cover).

#### 17.4 Email

| Component | Technology | Cost |
|-----------|-----------|------|
| **Transactional + marketing sends** | Resend Pro or Scale | $20/mo (50K emails, 10 domains) to $90/mo (100K emails, 1K domains) |
| **Drip campaign automation** | Custom PostgreSQL state machine | $0 |

**Drip campaign architecture**: No separate marketing automation platform. Campaign sequences are state machines in the database:

```sql
-- Simplified schema
CREATE TABLE marketing_email_campaigns (
  id UUID PRIMARY KEY,
  venture_id UUID NOT NULL,
  campaign_type TEXT NOT NULL,  -- 'welcome', 'onboarding', 'nurture', 'reactivation'
  steps JSONB NOT NULL,         -- [{delay_hours, template_id, condition}]
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE marketing_email_state (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES marketing_email_campaigns(id),
  subscriber_id UUID NOT NULL,
  current_step INT NOT NULL DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'
);
```

Cron job checks `marketing_email_state WHERE next_send_at <= now() AND status = 'active'`, sends via Resend API, advances state.

**Rejected**: Mautic (2GB+ RAM, PHP stack, no native multi-tenancy). Listmonk (lacks branching automation logic).

#### 17.5 AI Feedback Loop (Thompson Sampling)

The feedback loop is the competitive advantage of this engine. It turns EHG into a learning machine where Venture B doesn't start at zero because Venture A already learned the optimal approach for that demographic.

**Algorithm**: Thompson Sampling with Beta distributions.

```
For each decision point (which variant to show, which channel to prioritize):
    1. Load bandit arms from DB (each arm = a variant or channel)
    2. Sample from Beta(α, β) for each arm
    3. Select arm with highest sample
    4. After outcome observed: α += reward, β += (1 - reward)
```

**Reward signal**: Composite score = **0.3 × engagement + 0.7 × conversion**. Weighting conversion over engagement prevents optimizing for clickbait that doesn't drive revenue.

**Three cadences**:

| Cadence | What It Does | Trigger |
|---------|-------------|---------|
| **Hourly** | Channel allocation — shift budget toward higher-performing platforms | Cron: every 60 min |
| **Daily** | Variant promotion — Champion-Challenger evaluation, promote winning variants, retire underperformers | Cron: 6:00 AM UTC |
| **Weekly** | Cross-venture intelligence transfer — cluster similar ventures, propagate priors | Cron: Monday 2:00 AM UTC |

**Key parameters** (pinned, not ranges):

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Weekly decay factor** | 0.97 | Effective memory ~6 months. Prevents stale winners from dominating. Tunable after 30 days of data. |
| **Prior strength for new ventures** | 0.3 | Inherited from cluster of similar ventures. Strong enough to beat random, weak enough to be overridden by local data within 2 weeks. |
| **Minimum observations** | 100-200 per variant | Prevents premature convergence on insufficient data. |
| **Contextual bandits** | Per business-model type | SaaS ventures vs e-commerce vs marketplace have different optimal strategies. |

**Cross-venture intelligence transfer**:
1. Cluster ventures by `vertical_category` + `archetype` (from Stage 0 synthesis)
2. Within each cluster, compute aggregate arm performance
3. New ventures entering the cluster inherit priors at 0.3 strength: `α_new = 1 + 0.3 × α_cluster`, `β_new = 1 + 0.3 × β_cluster`
4. Prior decays as local data accumulates (Bayesian update naturally dilutes the prior)

#### 17.6 Analytics

| Component | Technology | Cost |
|-----------|-----------|------|
| **Web + product analytics** | PostHog Cloud (free tier) | $0 (1M events + 5K replays + 1M feature flags/mo) |
| **Attribution** | UTM-based last-touch | $0 (PostHog built-in) |
| **Feature flags / A/B testing** | PostHog feature flags | $0 (included in free tier) |

PostHog subsumes Umami (web analytics), provides product analytics, UTM attribution, feature flags, and session replays in one service. No self-hosting overhead — analytics needs 24/7 uptime which local compute doesn't guarantee.

#### 17.7 Orchestration

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Scheduling** | PostgreSQL + Node.js cron | Job scheduling (existing pattern: 165+ scripts in codebase) |
| **Posting pipeline** | Unified Event Bus | Rate limiting, retries, concurrency control (replaced BullMQ+Redis; no Redis dependency) |

**Note**: The original design specified 6 BullMQ queues requiring Redis. This was replaced by the unified event bus (SD-EHG-ORCH-FOUNDATION-CLEANUP-001-D) which provides equivalent async processing without requiring Redis infrastructure.

### 17.8 Webhook Delivery (Local Setup)

Since the orchestration runs locally (96GB RAM, RTX 5070 Ti), inbound webhooks from PostHog and Resend require a tunneling solution:

| Option | Approach |
|--------|----------|
| **Cloudflare Tunnel** (recommended) | Free, persistent, production-grade. `cloudflared tunnel` exposes local endpoints to a stable URL. |
| **Polling fallback** | If tunneling is unavailable, switch PostHog and Resend to polling-based ingestion (check API every 5 min instead of receiving webhooks). Adds latency but removes inbound connectivity requirement. |

### 17.9 Database Schema

New tables for the marketing engine. All follow existing EHG conventions (UUID PKs, `created_at`/`updated_at`, RLS policies).

```sql
-- Raw event stream (append-only)
CREATE TABLE marketing_events (
  id BIGSERIAL PRIMARY KEY,
  venture_id UUID NOT NULL REFERENCES ventures(id),
  source TEXT NOT NULL,            -- 'x', 'youtube', 'linkedin', 'posthog', 'resend'
  platform TEXT,
  event_type TEXT NOT NULL,        -- 'impression', 'click', 'engagement', 'conversion', 'unsubscribe'
  occurred_at TIMESTAMPTZ NOT NULL,
  content_id UUID,
  variant_id UUID,
  properties JSONB NOT NULL DEFAULT '{}'
);

-- Content and variants
CREATE TABLE marketing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  content_type TEXT NOT NULL,      -- 'social_post', 'email', 'ad'
  channel_family TEXT NOT NULL,    -- 'social', 'email', 'paid'
  concept_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE marketing_content_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES marketing_content(id),
  variant_key TEXT NOT NULL,       -- 'headline_a', 'headline_b', 'image_warm', 'image_cool'
  asset_text TEXT,
  asset_image_key TEXT,            -- storage bucket path
  asset_video_key TEXT,            -- storage bucket path
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Thompson Sampling state
CREATE TABLE bandit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  scope TEXT NOT NULL,             -- 'channel', 'variant', 'send_time'
  status TEXT NOT NULL DEFAULT 'active',
  objective_metric TEXT NOT NULL,  -- 'composite_reward'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bandit_arms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bandit_id UUID NOT NULL REFERENCES bandit_state(id),
  arm_type TEXT NOT NULL,          -- 'channel', 'variant', 'send_time'
  arm_value TEXT NOT NULL,         -- 'x', 'linkedin', or variant_id
  alpha NUMERIC NOT NULL DEFAULT 1,
  beta_param NUMERIC NOT NULL DEFAULT 1,
  observations INT NOT NULL DEFAULT 0,
  last_selected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily rollups (materialized by maintenance cron)
CREATE TABLE marketing_daily_rollups (
  rollup_date DATE NOT NULL,
  venture_id UUID NOT NULL,
  platform TEXT NOT NULL,
  content_id UUID,
  variant_id UUID,
  impressions BIGINT NOT NULL DEFAULT 0,
  engagements BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT NOT NULL DEFAULT 0,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  engagement_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN engagements::NUMERIC / impressions ELSE 0 END
  ) STORED,
  ctr NUMERIC GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN clicks::NUMERIC / impressions ELSE 0 END
  ) STORED,
  conversion_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN clicks > 0 THEN conversions::NUMERIC / clicks ELSE 0 END
  ) STORED,
  PRIMARY KEY (rollup_date, venture_id, platform, content_id, variant_id)
);

-- Cross-venture intelligence
CREATE TABLE intelligence_transfer_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_venture_id UUID NOT NULL REFERENCES ventures(id),
  target_venture_id UUID NOT NULL REFERENCES ventures(id),
  cluster_key TEXT NOT NULL,       -- vertical_category + archetype
  prior_strength NUMERIC NOT NULL DEFAULT 0.3,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Platform budget governors
CREATE TABLE marketing_channel_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  platform TEXT NOT NULL,
  monthly_budget_cents BIGINT NOT NULL,      -- hard cap
  daily_stop_loss_multiplier NUMERIC NOT NULL DEFAULT 2.0,
  current_month_spend_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (venture_id, platform)
);
```

### 17.10 Content Lifecycle State Machine

```
IDEATE → GENERATE → REVIEW → SCHEDULE → DISPATCH → MEASURE → OPTIMIZE
   │         │          │          │           │          │          │
   │    LLM creates  AI checks   Event bus  Platform   Metrics    Thompson
   │    text + visual  brand     schedules   API call   ingestor   Sampling
   │    variants      compliance  optimal               polls      updates
   │                  (automated) send time              hourly     arms
   │
   └── Optimizer feeds learnings back into next IDEATE cycle
```

Each transition writes to `marketing_content.metadata.lifecycle_state`. Failed reviews loop back to GENERATE with feedback context.

### 17.11 Cron Manifest

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 5 min | `content:schedule:check` | Move scheduled content to dispatch queue at optimal send times |
| Every 15 min | `publisher:rate-limit:reset` | Reset per-platform rate limit counters |
| Hourly | `metrics:collect:all` | Poll platform APIs for engagement data on recent posts |
| Hourly | `optimizer:channel:rebalance` | Hourly channel allocation adjustment |
| Daily 6:00 UTC | `optimizer:variant:promote` | Champion-Challenger variant evaluation |
| Daily 6:30 UTC | `rollup:materialize` | Aggregate marketing_events → marketing_daily_rollups |
| Daily 7:00 UTC | `budget:governor:check` | Check monthly budget utilization, alert if >80% |
| Weekly Mon 2:00 UTC | `intelligence:transfer` | Cross-venture prior propagation |
| Weekly Mon 3:00 UTC | `bandit:decay:apply` | Apply 0.97 decay factor to all bandit arms |
| Weekly Mon 4:00 UTC | `maintenance:dlq:alert` | Alert if dead letter queue depth > 10 |

### 17.12 Monthly Cost Summary

| Item | Cost | Notes |
|------|------|-------|
| X/Twitter API (Basic) | $200/mo | May shift to pay-per-use; governor caps exposure |
| Late aggregator (Accelerate) | $33-49/mo | LinkedIn + TikTok posting |
| Resend (Pro → Scale) | $20-90/mo | Scales with email volume across ventures |
| Nano Banana Pro (images) | $0-200/mo | Free tier covers 1,500/mo; batch API at $0.067/image beyond |
| I2V video (Kling + Veo) | $50-200/mo | Volume-dependent; governor caps per-venture spend |
| PostHog Cloud | $0 | Free tier: 1M events/mo |
| Event Bus (built-in) | $0 | No external dependencies |
| Cloudflare Tunnel | $0 | Free tier sufficient |
| **Total incremental** | **$303-739/mo** | Lower end: few active ventures. Upper end: 50 ventures posting daily. |

### 17.13 Lock-In Exceptions & Governors

Decisions that are conditionally locked — they stand unless the specified condition triggers.

| Decision | Condition That Reopens It | Fallback |
|----------|--------------------------|----------|
| X at $200/mo flat | X fully deprecates Basic tier in favor of pay-per-use | Spend-cap governor already in place; adjust budget per venture |
| Reddit skipped by default | Chairman requests Reddit for a specific venture | Enable per-venture via publisher abstraction; no global enablement |
| Kling as default I2V | Kling API stability drops below 95% uptime over 30 days | Route all traffic to Veo 3.1 Standard |
| Veo 3.1 hero-only routing | I2V budget consistently underspent | May relax to allow Veo for "premium" tier (not just "hero") |
| No Remotion (deterministic video) | Chairman requests product UI walkthroughs or data-viz videos | Add Remotion as second video lane; publisher abstraction supports it |
| No local image fallback | Nano Banana Pro pricing increases >5× or Google discontinues model | Stand up ComfyUI + SDXL pipeline; Sharp.js overlay already in place |

### 17.14 30-Day Build Plan

```
Week 1: Data Foundation + First Publish
  ├── Database schema (marketing_events, content, variants, bandit_state, bandit_arms, rollups, budgets)
  ├── Content generator service (LLM + venture context → text variants)
  ├── Publisher abstraction layer (platform interface + direct API + Late adapter)
  ├── X direct API integration (first platform: post text + image)
  ├── Nano Banana Pro integration (image generation + Sharp.js overlay)
  └── UTM generation + PostHog event tracking

Week 2: Multi-Platform + Measure
  ├── YouTube integration (Data API v3 — video upload + metadata)
  ├── Late integration (LinkedIn + TikTok via aggregator API)
  ├── Event bus queue setup (rate limiters, error handling)
  ├── Metrics ingestor (platform API polling, hourly cron)
  ├── Daily rollup materialization
  └── Cloudflare Tunnel for webhook ingestion (PostHog, Resend)

Week 3: AI Feedback Loop + Email
  ├── Thompson Sampling implementation (Beta distributions, arm selection, reward update)
  ├── Hourly channel rebalancing cron
  ├── Daily Champion-Challenger variant promotion
  ├── Resend integration (transactional + marketing sends)
  ├── Email drip campaign state machine (PostgreSQL)
  └── Budget governor (per-venture, per-platform spend caps + stop-loss)

Week 4: Intelligence + Video + Polish
  ├── Cross-venture intelligence transfer (clustering + prior propagation)
  ├── Kling 3.0 I2V integration (primary video provider)
  ├── Veo 3.1 I2V integration (hero-tier routing)
  ├── Runway Gen-4 Turbo fallback (circuit breaker pattern)
  ├── Weekly bandit decay (0.97 factor)
  ├── Bluesky / Mastodon / Threads direct API integrations
  └── End-to-end test: venture creates content → publishes → measures → optimizes
```

### 17.15 Integration with Venture Lifecycle

The Marketing Distribution Engine activates at **Stage 11 (GTM Strategy)** and becomes the primary execution layer for marketing through Stage 25+:

| Lifecycle Stage | Marketing Engine Role |
|:---------------:|---------------------|
| **Stage 11** | GTM Strategy generates initial channel plan → seeds `bandit_state` with channel arms |
| **Stage 12** | Sales Identity provides conversion funnel → informs reward signal weighting |
| **Stage 22** | Release Readiness → marketing engine begins pre-launch content generation |
| **Stage 23** | Launch Execution → full distribution pipeline activates for the venture |
| **Stage 24** | Metrics & Learning → marketing metrics feed into venture health score (AARRR) |
| **Stage 25** | Venture Review → marketing performance informs continue/pivot/expand/sunset decision |
| **Ops Loop** | Continuous operation: generate → distribute → measure → optimize → repeat |

The Marketing Service loads venture context (Section 2 pattern), executes domain logic, writes results to DB, and emits events to the EVA event bus — identical to all other shared services.

---

*Architecture document as Step 2 of the 8-step vision & architecture plan.*
*Informed by: EVA Venture Lifecycle Vision v4.7 (34 Chairman decisions + 8 OpenClaw-informed decisions), existing EHG database schema (689 ventures, 25 stages configured), EVA orchestration infrastructure (event bus, task contracts, state machines, circuit breakers), LEO Protocol SD Bridge implementation, Stage 0 CLI implementation (`lib/eva/stage-zero/`), OpenClaw architecture research (gateway, tool policy, skills, memory/search patterns), Marketing deep research — 4-source triangulation (Claude agents + Google + OpenAI + Anthropic, 2026-02-12) + 3-source peer review of locked-in decisions.*
*Steps 1 and 2 run in parallel -- vision defines "what," architecture defines "how."*
*v1.1: Added Chairman Decision Interface (Section 11) defining how the Chairman submits decisions at blocking gates. Resequenced implementation phases (Section 13) so Phase A produces a testable end-to-end single-venture flow including Chairman decisions and CLI task dispatcher. Added Saga Management (Section 15) for multi-step operations (SD execution, Reality Gate retries, venture retirement) using dormant evaStateMachines.ts infrastructure.*
*v1.2: Added Stage 0 Venture Ideation Pipeline (Section 16) documenting the fully-implemented pre-lifecycle module. Updated Service Registry to include Stage 0 Pipeline. Extended Phase A test scenario to start from Stage 0 ideation. Identified Chairman Review interactivity gap: `conductChairmanReview()` is currently a non-interactive passthrough — wiring to `chairman_decisions` table is P0 item #1. Added Stage 0 as fourth mandatory Chairman blocking gate (alongside Stages 10, 22, 25). Documented 15+ existing database tables, 8 synthesis components, 3 entry paths, 4 discovery strategies, evaluation profile system, counterfactual engine, stage-of-death predictor, gate signal service, and venture nursery.*
*v1.3: Codebase reconciliation against `lib/eva/` and CLI-vs-GUI triangulation analysis (Stages 1-25). Discovered 10 components listed as "Needs Building" that already exist in production: Decision Filter Engine, Reality Gate Evaluator, Chairman Preferences Store, CEO Service (EVA Orchestrator), Saga Coordinator, Devil's Advocate, Constraint Drift Detector, Orchestrator Tracer, Orchestrator State Machine, and Cross-Venture Learning. Corrected Section 13 inventory: "Exists and Active" grew from 15 to 27 entries; "Needs Building" shrunk from 17 to 13 items. Added CLI service ports and venture scripts. Phase A resequenced from 10 items to 6 remaining work items (5 were already built). Added "Stage template gap-fill" as new P0 item based on triangulation finding that all 25 stage templates are passive containers needing active analysisSteps. Phase C reduced from 3 to 2 items (cross-venture learning already built).*
*v1.5: OpenClaw-informed platform capabilities. Inserted new Phase C: Platform Capabilities (5 items) between Phase B and former Phase C. Items: (1) Event-driven venture monitor — Supabase Realtime listener + cron scheduler implementing hybrid runtime model from Vision D2; (2) Chairman dashboard wiring — EHG App DecisionsInbox/EscalationPanel → chairman_decisions table, 25-stage GUI removal per Vision D3; (3) Per-agent tool policy profiles — full/coding/readonly/minimal enforced at spawn time per D4; (4) Skill packaging system — SKILL.md format with versioned bundles and selective injection per D5; (5) Hybrid semantic search — SQLite vector index + Ollama embeddings for cross-venture learning per D6. Former Phase C (Portfolio Intelligence) → Phase D. Former Phase D (Optimization) → Phase E. Security section expanded with dashboard interaction threat model (6 threats with mitigations) and agent tool policy enforcement (4 profiles). Companion reference updated to Vision v4.7.*
*v1.6: Marketing Distribution Engine (Section 17). 15 sub-sections covering the complete marketing pipeline architecture. Derived from 4-source deep research triangulation + 3-source peer review. Stack: Nano Banana Pro (images, replaces ComfyUI), Kling 3.0 primary + Veo 3.1 secondary + Runway fallback (I2V video, replaces Remotion), Resend + custom SQL (email), direct API + Late aggregator (social posting), PostHog Cloud (analytics), Thompson Sampling feedback loop (AI optimizer), hybrid cron + event bus (orchestration). Includes: database schema (8 new tables), content lifecycle state machine, cron manifest (10 scheduled jobs), 30-day build plan, budget governors, lock-in exceptions table, venture lifecycle integration map. Monthly incremental cost: $303-739/mo. Service Registry Marketing Service updated from "TBD" to full specification. Marketing pipeline added to Phase C implementation sequence (items 16-17). Peer review refinements: X spend-cap governor, Reddit category-gated, Veo hero-only routing rules, decay factor pinned at 0.97, webhook tunneling requirement.*
