# Vision v2 Technical Specifications


## Table of Contents

- [Document Hierarchy](#document-hierarchy)
- [Specification Files](#specification-files)
  - [[01-database-schema.md](./01-database-schema.md)](#01-database-schemamd01-database-schemamd)
  - [[02-api-contracts.md](./02-api-contracts.md)](#02-api-contractsmd02-api-contractsmd)
  - [[03-ui-components.md](./03-ui-components.md)](#03-ui-componentsmd03-ui-componentsmd)
  - [[04-eva-orchestration.md](./04-eva-orchestration.md)](#04-eva-orchestrationmd04-eva-orchestrationmd)
  - [[05-user-stories.md](./05-user-stories.md)](#05-user-storiesmd05-user-storiesmd)
  - [[06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md)](#06-hierarchical-agent-architecturemd06-hierarchical-agent-architecturemd)
  - [[07-operational-handoff.md](./07-operational-handoff.md)](#07-operational-handoffmd07-operational-handoffmd)
  - [[08-governance-policy-engine.md](./08-governance-policy-engine.md)](#08-governance-policy-enginemd08-governance-policy-enginemd)
  - [[09-agent-runtime-service.md](./09-agent-runtime-service.md)](#09-agent-runtime-servicemd09-agent-runtime-servicemd)
  - [[10-knowledge-architecture.md](./10-knowledge-architecture.md)](#10-knowledge-architecturemd10-knowledge-architecturemd)
  - [[11-eva-scaling.md](./11-eva-scaling.md)](#11-eva-scalingmd11-eva-scalingmd)
  - [[12-ops-debugging.md](./12-ops-debugging.md)](#12-ops-debuggingmd12-ops-debuggingmd)
  - [[13-red-team-audit-prompt.md](./13-red-team-audit-prompt.md)](#13-red-team-audit-promptmd13-red-team-audit-promptmd)
- [Quick Reference](#quick-reference)
  - [The 25 Stages](#the-25-stages)
  - [Gate Types](#gate-types)
  - [Token Budget Profiles](#token-budget-profiles)
- [Implementation Priority](#implementation-priority)
- [Contributing](#contributing)
- [Version History](#version-history)

**Chairman's OS - Specification Index**

This folder contains the detailed technical specifications for Vision v2, the "Venture Factory" architecture that powers EHG's AI-first venture validation pipeline.

---

## Document Hierarchy

```
docs/vision/
├── 00_VISION_V2_CHAIRMAN_OS.md    <- The "Constitution" (philosophy, UX, roadmap)
└── specs/                          <- Technical implementation details
    ├── README.md                   <- This file (index)
    ├── 01-database-schema.md       <- Data model + Strict RLS
    ├── 02-api-contracts.md         <- API definitions
    ├── 03-ui-components.md         <- Frontend architecture
    ├── 04-eva-orchestration.md     <- Orchestration logic
    ├── 05-user-stories.md          <- Human workflows & personas
    ├── 06-hierarchical-agent-architecture.md <- Multi-agent hierarchy
    ├── 07-operational-handoff.md   <- Stage 25 mode transition
    ├── 08-governance-policy-engine.md <- Authority matrix & escalation
    ├── 09-agent-runtime-service.md <- Leases, idempotency, recovery
    ├── 10-knowledge-architecture.md <- KB hierarchy & data isolation
    ├── 11-eva-scaling.md           <- Multi-instance EVA sharding
    ├── 12-ops-debugging.md         <- Traceability & replay safety
    └── 13-red-team-audit-prompt.md <- Adversarial documentation audit
```

---

## Specification Files

### [01-database-schema.md](./01-database-schema.md)

**Database Schema Specification**

Complete PostgreSQL/Supabase schema for Chairman's OS including:

| Section | Contents |
|---------|----------|
| Core Tables | `chairman_directives`, `directive_delegations`, `venture_stage_assignments` |
| Decision Tables | `chairman_decisions`, `chairman_alerts` |
| Token Economics | `venture_token_ledger`, token budget profiles |
| Assumptions | `assumption_sets`, reality tracking |
| Stage Config | `lifecycle_stage_config` (25-stage definitions) |
| Functions | `fn_chairman_briefing()`, `fn_advance_venture_stage()` |
| RLS Policies | Row-level security for multi-tenant access |
| Migration Template | Versioned migration pattern |

**Use When:**
- Creating database migrations
- Adding new tables or functions
- Debugging RLS issues
- Understanding data relationships

---

### [02-api-contracts.md](./02-api-contracts.md)

**API Contracts Specification**

Complete TypeScript definitions and Zod schemas for all Vision v2 APIs:

| Section | Contents |
|---------|----------|
| TypeScript Interfaces | All domain types (`Venture`, `ChairmanBriefing`, `Decision`, etc.) |
| Zod Schemas | Runtime validation schemas |
| Endpoint Contracts | Request/response shapes for all endpoints |
| Error Handling | Standard error response format |

**Endpoints Defined:**
- `GET /api/ventures` - List ventures
- `GET /api/ventures/:id` - Venture detail
- `GET /api/chairman/briefing` - Morning briefing
- `GET /api/chairman/decisions` - Decision queue
- `POST /api/chairman/decide` - Submit decision
- `POST /api/ventures` - Create venture
- `GET /api/blueprints` - List opportunity blueprints (deal flow inventory)
- `POST /api/blueprints/generate` - Trigger blueprint generation (autonomous ideation)
- `GET /api/blueprints/jobs/:id` - Blueprint generation status + events
- `POST /api/blueprints/:id/review` - Board simulation review
- `POST /api/blueprints/:id/instantiate` - Create Stage 0 venture from blueprint

**Use When:**
- Building new API endpoints
- Creating frontend data fetching
- Validating request/response shapes
- Generating API documentation

---

### [03-ui-components.md](./03-ui-components.md)

**UI Components Specification**

Frontend architecture for the "Glass Cockpit" interface:

| Section | Contents |
|---------|----------|
| Design Philosophy | Glanceability, progressive disclosure, decision orientation |
| Component Hierarchy | Full tree from App to leaf components |
| Chairman's Office | `BriefingDashboard`, `DecisionStack`, `DecisionCard`, `PortfolioSummary` |
| Factory Floor | `VentureDetail`, `StageTimeline`, `AssumptionRegistry`, `TokenLedger` |
| Shared Components | `HealthBadge`, `ProgressRing`, `TokenBudgetBar` |
| State Management | Zustand store, React Query integration |
| Migration Guide | Replacing legacy 7-stage labels with 25-stage config |

**Use When:**
- Building new UI components
- Understanding component props and state
- Implementing the Chairman dashboard
- Fixing zombie 7-stage code

---

### [04-eva-orchestration.md](./04-eva-orchestration.md)

**EVA Orchestration Specification**

Chief of Staff layer logic and state machines:

| Section | Contents |
|---------|----------|
| EVA Overview | Capabilities and boundaries |
| State Machines | Venture state, stage state, gate behaviors |
| Task Contract System | EVA-crewAI communication protocol |
| Crew Configurations | All 16 crew types and their stage mappings |
| Event Contracts | EVA event types and handlers |
| Morning Briefing | Aggregation pipeline and greeting generation |
| Decision Flow | Creation, analysis, and processing |
| Token Budget Management | Profiles, enforcement, and warnings |

**Use When:**
- Understanding EVA's role
- Implementing crew dispatch
- Debugging stage transitions
- Managing token budgets

---

### [05-user-stories.md](./05-user-stories.md)

**User Stories & Personas Specification**

Human workflow definitions for the Chairman's OS:

| Section | Contents |
|---------|----------|
| Persona 1: The Chairman | Strategic mode, decision focus, portfolio view |
| Persona 2: The Solo Entrepreneur | Builder mode, artifact inspection, direct intervention |
| Persona 3: EVA | Orchestration, quality gating, synthesis |
| User Stories | 13 stories with acceptance criteria (US-CH-*, US-SE-*, US-EVA-*) |
| Persona Switching | Mode transitions, UI affordances, context preservation |
| Cross-Reference Matrix | Maps stories to database, API, UI, and EVA specs |

**Use When:**
- Understanding user workflows
- Designing acceptance criteria for features
- Building UI that matches persona expectations
- Prioritizing feature development

---

### [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md)

**Hierarchical Agent Architecture Specification**

The fractal multi-agent system that powers autonomous venture operations:

| Section | Contents |
|---------|----------|
| Four-Level Hierarchy | L1 Chairman, L2 CEO, L3 VPs, L4 Crews |
| Agent Registry Schema | `agent_registry`, `agent_relationships`, `agent_memory_stores` |
| Shared Tool Registry | Ecosystem-wide tool access control |
| Cross-Agent Communication | Message protocol between agents |
| Venture Instantiation | Template-based organizational structure |
| Agent-Stage Accountability | VP ownership and crew assignments per stage |

**Use When:**
- Understanding multi-agent coordination
- Implementing CEO/VP autonomy
- Building venture instantiation
- Debugging agent communication

---

### [07-operational-handoff.md](./07-operational-handoff.md)

**Operational Handoff Specification** (OpenAI Codex Assessment - December 2025)

Stage 25 mode transition from Incubation to Operational phase:

| Section | Contents |
|---------|----------|
| Dual-Phase Lifecycle | Incubation (1-25) vs Operational (post-25) |
| CEO Operational Modes | Incubation Mode vs Operational Mode |
| Mode Transition Protocol | Two-factor trigger (technical + governance) |
| Operational Handoff Packet | Full venture state snapshot schema |
| Venture Constitution | Living operating charter |
| Post-Launch Structure | Operational crews and standing cadences |

**Key Insight:** CEO exists from Stage 1 in "Incubation Mode" with limited authority. Stage 25 triggers a **mode switch**, not a new agent creation.

**Use When:**
- Implementing Stage 25 completion logic
- Building the mode transition workflow
- Understanding post-launch organizational structure
- Creating operational crew configurations

---

### [08-governance-policy-engine.md](./08-governance-policy-engine.md)

**Governance Policy Engine Specification** (OpenAI Codex Assessment - December 2025)

Machine-enforced authority boundaries and escalation control:

| Section | Contents |
|---------|----------|
| Authority Matrix | Thresholds by hierarchy level (crew → chairman) |
| Policy Engine | Rule enforcement and capability limits |
| Escalation Load-Shedding | Budgets, circuit breakers, storm prevention |
| Conflict Resolution | Simultaneous claim handling, lock acquisition |
| Cross-Venture Coordination | Resource sharing and dependency management |

**Key Insight:** Authority is **mathematically enforced** through the policy engine, not just documented conventions.

**Use When:**
- Implementing authority boundary checks
- Building escalation rate limiting
- Handling agent conflicts and deadlocks
- Debugging permission denials

---

### [09-agent-runtime-service.md](./09-agent-runtime-service.md)

**Agent Runtime Service Specification** (OpenAI Codex Assessment - December 2025)

Production-grade agent execution with reliability guarantees:

| Section | Contents |
|---------|----------|
| Worker Architecture | Dedicated, shared pool, and ephemeral workers |
| Claim-with-Lease Model | Task claiming, heartbeat, lease extension |
| Idempotency Keys | Exactly-once execution guarantees |
| Task Checkpoints | Progress persistence for recovery |
| Failure Recovery | Retry policies, poison queues, dead letter handling |
| Concurrency Control | Per-venture, per-crew, and global limits |
| Memory Management | Memory banks, summarization, context limits |

**Key Insight:** Tasks use a **claim-with-lease** model - workers must claim tasks with a lease and renew via heartbeat.

**Use When:**
- Implementing task dispatch and claiming
- Adding idempotency to operations
- Debugging stuck or failed tasks
- Managing agent memory and context

---

### [10-knowledge-architecture.md](./10-knowledge-architecture.md)

**Knowledge Architecture Specification** (OpenAI Codex Assessment - December 2025)

Scoped knowledge bases and strict data isolation:

| Section | Contents |
|---------|----------|
| Knowledge Base Hierarchy | Ecosystem → portfolio → venture → agent scoping |
| Data Isolation Model | Strict RLS enforcing venture boundaries |
| Cross-Venture Publishing | Redaction pipeline for shared learnings |
| Tool Usage Ledger | Mandatory tracking of all tool executions |

**Key Insight:** Knowledge flows **down** the hierarchy (ecosystem → agent) but **up** requires explicit publishing with redaction.

**Use When:**
- Creating or querying knowledge bases
- Implementing data isolation policies
- Building cross-venture learning pipelines
- Auditing tool usage

---

### [11-eva-scaling.md](./11-eva-scaling.md)

**EVA Scaling Specification** (OpenAI Codex Assessment - December 2025)

Multi-instance EVA architecture for portfolio scalability:

| Section | Contents |
|---------|----------|
| EVA Instance Model | Primary, secondary, ecosystem, specialized types |
| Routing Layer | Command routing and load balancing |
| Failover Protocol | Detection, promotion, traffic redirection |
| State Partitioning | EVA-local vs shared state |
| Cross-EVA Coordination | Ecosystem EVA responsibilities, sync triggers |

**Key Insight:** Each portfolio gets its own EVA instance; the **Ecosystem EVA** handles cross-portfolio concerns.

**Use When:**
- Scaling beyond single-EVA architecture
- Implementing EVA failover
- Coordinating cross-portfolio programs
- Debugging EVA routing issues

---

### [12-ops-debugging.md](./12-ops-debugging.md)

**Ops Debugging Specification** (OpenAI Codex Assessment - December 2025)

End-to-end traceability and safe replay for production debugging:

| Section | Contents |
|---------|----------|
| Correlation ID Contract | Mandatory `correlation_id` on every operation |
| Trace Viewer Workflow | Hierarchical trace navigation, timeline scrubbing |
| Black Box Recorder | Complete execution snapshots with inputs/outputs |
| Safe Replay | Approval workflow, dry-run mode, diff preview |
| Dashboard Integration | Circuit breaker status, quota usage, health widgets |

**Key Insight:** Every operation gets a `correlation_id` that threads through the entire execution chain for debugging.

**Use When:**
- Debugging production issues
- Replaying failed operations
- Building monitoring dashboards
- Implementing audit trails

---

### [13-red-team-audit-prompt.md](./13-red-team-audit-prompt.md)

**Red Team Audit Prompt Specification** (OpenAI Codex Hardened - December 2025)

Adversarial documentation audit prompt for systematic flaw detection:

| Section | Contents |
|---------|----------|
| Non-Negotiable Rules | No invention, evidence required, direct quotes, exhaustive minimums |
| Conflict Classification | 5 types: contradiction, mismatch, ambiguous authority, missing enforcement, terminology drift |
| Scan 1: Consistency | Authority thresholds, gate types, data ownership, token budget, command conflicts |
| Scan 2: Schema Voids | 8 required void targets (briefing, task contract, decision flow, etc.) |
| Scan 3: Workflow Gaps | 9 required checks (25 stages, deadlocks, triggers, escalation, failover) |
| Risk Register | Structured output with severity rubric (Critical/High/Medium/Low) |
| Appendices | Conflict Matrix, Schema Void Index, Workflow Trigger Map |

**Key Features:**
- Minimum 18 findings required (6 per scan type)
- Evidence quotes mandatory for every finding
- "NOT SPECIFIED" rule prevents auditor invention
- Structured appendices for cross-referencing

**Use When:**
- Before major releases
- After significant specification changes
- During architecture review
- For external audit preparation

---

## Quick Reference

### The 25 Stages

| Phase | Stages | Focus |
|-------|--------|-------|
| THE TRUTH | 1-5 | Market validation, unit economics |
| THE ENGINE | 6-9 | Business model, risk, pricing |
| THE IDENTITY | 10-12 | Brand, GTM, sales |
| THE BLUEPRINT | 13-16 | Architecture, specs, schemas |
| THE BUILD LOOP | 17-20 | Implementation, QA, security |
| LAUNCH & LEARN | 21-25 | Deploy, measure, optimize |

### Gate Types

| Type | Behavior | Stages |
|------|----------|--------|
| `auto_advance` | EVA advances automatically | Most stages |
| `advisory_checkpoint` | Chairman notified, can override | 3, 5, 13, 16, 23 |
| `hard_gate` | Chairman MUST decide | 25 |

**Source of truth:** stage→gate mapping is defined in `docs/vision/specs/01-database-schema.md` (`lifecycle_stage_config`).

### Token Budget Profiles

| Profile | Total Budget | Focus |
|---------|--------------|-------|
| `exploratory` | 250k tokens | Quick validation |
| `standard` | 500k tokens | Balanced depth |
| `deep_diligence` | 1M tokens | High-conviction bets |

---

## Implementation Priority

Recommended order for building Vision v2:

**Phase 1: Foundation**
1. **Database Schema** (01) - Foundation layer + Strict RLS
2. **API Contracts** (02) - Backend implementation
3. **Governance Policy Engine** (08) - Authority boundaries (P1 from Codex assessment)

**Phase 2: Agent Runtime**
4. **EVA Orchestration** (04) - State machine and dispatch
5. **Agent Runtime Service** (09) - Leases, idempotency, recovery
6. **Hierarchical Architecture** (06) - Multi-agent system

**Phase 3: Knowledge & Scaling**
7. **Knowledge Architecture** (10) - KB hierarchy and data isolation
8. **EVA Scaling** (11) - Multi-instance EVA sharding

**Phase 4: User Experience**
9. **UI Components** (03) - Frontend visualization
10. **Ops Debugging** (12) - Traceability and replay safety
11. **Operational Handoff** (07) - Post-Stage 25 transition
12. **User Stories** (05) - Human workflows validation

---

## Contributing

When modifying these specifications:

1. **Update the spec file** with new definitions
2. **Cross-reference** related specs (e.g., new table → update API contract)
3. **Update this README** if adding new files
4. **Update the main Vision document** (`00_VISION_V2_CHAIRMAN_OS.md`) if the change affects philosophy or roadmap

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| 2025-12-12 | Initial specification extraction | Claude Opus 4.5 |
| 2025-12-12 | Added 05-user-stories.md; Blue Sky architecture tables in 01; Circuit breaker/degradation in 04 | Claude Opus 4.5 |
| 2025-12-12 | Added 06-hierarchical-agent-architecture.md with Agent-Stage Accountability Matrix | Claude Opus 4.5 |
| 2025-12-12 | Added 07-operational-handoff.md (OpenAI Codex Assessment); New crews in 04; Operational tables in 01 | Claude Opus 4.5 |
| 2025-12-12 | Added 08-12 specs (Codex 5-Dimension Assessment): Governance Policy Engine, Agent Runtime Service, Knowledge Architecture, EVA Scaling, Ops Debugging | Claude Opus 4.5 |
| 2025-12-12 | Added Section 11 to 01-database-schema.md: Strict RLS policies replacing permissive `authenticated USING (true)` | Claude Opus 4.5 |
| 2025-12-12 | Added 13-red-team-audit-prompt.md: OpenAI Codex hardened adversarial audit prompt with 3 scans, 18-finding minimum, Risk Register output | Claude Opus 4.5 |

---

*These specifications are the technical implementation of the Vision v2 philosophy defined in [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md).*
