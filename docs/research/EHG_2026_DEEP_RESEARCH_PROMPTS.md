# EHG 2026 Deep Research Prompts

**Generated**: 2025-11-29
**Parent SD**: SD-RESEARCH-000
**Total Research Domains**: 8

---

## How to Use This Document

1. Copy the entire prompt section for each SD
2. Paste into Gemini Deep Research or OpenAI
3. Collect the research output
4. Feed results back to Claude Code for PRD generation

---

## SD-RESEARCH-101: Cross-Schema Governance Architecture

### Deep Research: Future-Proof Multi-Schema Architecture for EHG (Governance / Portfolio / Runtime)

**Context:**

EHG is consolidating two Supabase databases into ONE unified project using three schemas:

- **governance.*** → immutable SDs, PRDs, policies, LEO protocol
- **portfolio.*** → ventures, autonomy settings, signals
- **runtime.*** → stage instances, artifacts, logs, EVA decisions

Runtime must NEVER write into governance.*
Governance must remain long-lived, auditable, and append-only.

**Research Goals:**

1. Research best practices for multi-schema separation
2. Design schema permission boundaries
3. Define RLS patterns for agent isolation
4. Establish governance audit log strategies
5. Plan schema evolution without breaking downstream systems
6. Study Postgres tenancy & large-scale governance patterns
7. Analyze how companies like GitHub/Stripe manage schema boundaries

**Constraints:**

- Must support multi-venture scaling
- Must support EVA autonomy (L0–L4)
- Must support 40-stage contract-driven system
- Governance must be immutable and append-only
- Runtime must be fully RLS-scoped per venture

**Deliverables:**

- Detailed architecture recommendation
- Risk assessment
- Alternative approaches with trade-offs
- Best practices from industry
- Hard-to-change decisions identified
- Flexible decisions identified

**Expected Output Format:**

Structured report with sections: Executive Summary, Architecture Recommendation, Risk Analysis, Alternatives Considered, Best Practices, Decision Matrix (hard vs flexible), Implementation Considerations.

---

## SD-RESEARCH-102: EVA Autonomy Engine (L0–L4, Per-Venture)

### Deep Research: EVA Autonomy Engine (L0–L4) — Safe AI Governance Model

**Context:**

EVA is the executive AI assistant that will manage ventures across a 40-stage workflow. Each venture has its own autonomy level from L0 (advisor) to L4 (trial autonomy). All EVA actions must be logged through governance and runtime schemas.

Current autonomy level definitions:
- **L0**: Advisor only - no autonomous actions
- **L1**: Suggest actions, human approves
- **L2**: Act with human notification
- **L3**: Act autonomously within guardrails
- **L4**: Trial full autonomy with monitoring

**Research Goals:**

1. Identify autonomy frameworks used in robotics, automotive (ADAS), military/HADR automation, high-risk fintech
2. Define what each autonomy level should allow/deny
3. Define kill-switch patterns
4. Define oversight vs override mechanisms
5. Define max consecutive auto-action rules
6. Analyze risk windows and escalation triggers
7. Study how autonomous systems handle edge cases and failures

**Constraints:**

- EVA must be per-venture scoped
- EVA must obey RLS isolation
- EVA must use v_intent_vs_reality view
- EVA cannot write to governance.* except "as Chairman"
- All decisions logged to runtime.eva_decisions

**Deliverables:**

- Autonomy Model Specification
- Policy definitions per level (allowed/denied actions)
- Safety rails and guardrails
- Human override protocols
- Kill-switch design patterns
- Recommendations for long-term scaling
- Risk assessment per autonomy level

**Expected Output Format:**

Structured specification with: Autonomy Level Matrix, Action Authorization Rules, Safety Rail Specifications, Override Protocols, Monitoring Requirements, Escalation Triggers, Implementation Roadmap.

---

## SD-RESEARCH-103: Stage Data Contracts (JSON Schema + TypeScript)

### Deep Research: 40-Stage Data Contract System (JSON Schema + TypeScript)

**Context:**

EHG is transitioning to a contract-driven workflow. Each of the 40 venture stages will have:
- Input schema (JSON Schema)
- Output schema (JSON Schema)
- Derived TypeScript interfaces
- Versioning metadata
- Validation requirements

Contracts will live in **governance.stage_data_contracts** and be immutable once published.

**Research Goals:**

1. Find best-in-class contract governance models
2. Research versioning strategies for complex workflows
3. Evaluate JSON Schema → TypeScript generation tools
4. Define patterns for handling contract evolution gracefully
5. Research how to guarantee backward compatibility
6. Study how to store contract metadata long-term
7. Analyze how workflow engines evolve contracts (Temporal, Airflow, etc.)

**Constraints:**

- Contracts must be universal across ventures
- Contracts must be long-lived and versioned
- EVA reads contracts via view-only routes
- Runtime performs validation against contracts
- Must support 40 distinct stages with varying complexity

**Deliverables:**

- Contract Governance Strategy
- Versioning Plan with migration paths
- Validation Pipeline Architecture
- Tooling Recommendations (JSON Schema → TS)
- Backward compatibility patterns
- Contract lifecycle management

**Expected Output Format:**

Technical specification with: Contract Schema Design, Versioning Model, TypeScript Generation Pipeline, Validation Architecture, Migration Strategy, Tooling Evaluation Matrix.

---

## SD-RESEARCH-104: Unified EHG Interface (Governance + Runtime + EVA)

### Deep Research: Unified User Interface for Governance, 40-Stage Workflow, and EVA

**Context:**

Currently, EHG and EHG_Engineer are two separate applications:
- **EHG_Engineer**: LEO Protocol dashboard for managing SDs & PRDs
- **EHG**: The actual customer-facing business application

EHG will become the unified interface hosting:
- Venture workflows (40-stage pipeline)
- EVA orchestration (AI decision-making)
- SD/PRD governance (strategic planning)
- LEO protocol management
- Portfolio views (multi-venture oversight)

Interface must support multiple roles: Chairman, Governance mode, Venture mode, EVA decision view, Compliance views.

**Research Goals:**

1. Research role-based UI architecture patterns
2. Study cross-application unification approaches
3. Design dashboard integration patterns
4. Plan transition strategy from multiple apps to one platform
5. Analyze how complex systems manage multi-role interfaces (AWS, Azure, Notion, Linear)
6. Define progressive disclosure for complex features

**Constraints:**

- Governance UI must not allow runtime writes
- EVA UI must show autonomy boundaries clearly
- Venture UI must handle multiple active sessions
- Must support Chairman override at any point
- Must maintain clear visual separation between governance and runtime

**Deliverables:**

- UI Information Architecture
- Navigation Blueprint
- Role Model specification
- Interaction Patterns guide
- Progressive disclosure strategy
- Transition plan from two apps to one

**Expected Output Format:**

UX specification with: Information Architecture Diagram, Navigation Structure, Role-Based Access Matrix, Interaction Patterns, Visual Design Principles, Migration Roadmap.

---

## SD-RESEARCH-105: Multi-Venture Orchestration Strategy

### Deep Research: Multi-Venture Orchestration for AI-Run Venture Portfolio

**Context:**

EHG will run multiple ventures in parallel. Each venture requires:
- Independent EVA session (AI decision-making)
- Independent autonomy level (L0-L4)
- Independent stage progression (40-stage pipeline)
- Independent signals (progress, risks, blockers)
- Independent context windows

System must support future scaling to 10–50 ventures with full isolation.

**Research Goals:**

1. Research multi-tenant orchestration patterns
2. Study venture isolation approaches (data, compute, context)
3. Analyze state machine architectures for parallel workflows
4. Define how to prevent venture cross-contamination
5. Assess performance implications of parallel agents
6. Design portfolio-level dashboards and aggregation
7. Study how VC portfolio software handles multi-company views

**Constraints:**

- RLS isolation required per venture_id
- EVA must be per-venture scoped
- Governance is global and must aggregate signals
- Must support 10-50 concurrent ventures
- Must handle ventures at different stages simultaneously

**Deliverables:**

- Multi-Venture Architecture Proposal
- Scheduling model for parallel ventures
- EVA multi-tenant strategy
- Signal aggregation model
- Portfolio dashboard specifications
- Performance and scaling considerations

**Expected Output Format:**

Architecture document with: Multi-Tenancy Model, Isolation Boundaries, Scheduling Strategy, EVA Instance Management, Signal Aggregation Pipeline, Portfolio Views, Scaling Plan.

---

## SD-RESEARCH-106: LEO Protocol Evolution to v5.x

### Deep Research: LEO Protocol v5.x — Next-Generation Governance Engine

**Context:**

Current LEO protocol (v4.3.3) handles:
- SD creation and lifecycle
- PRD generation and validation
- Child SD workflows
- Phase calculation (LEAD → PLAN → EXEC)
- Compliance evaluation

Future LEO v5.x must handle:
- Stage-to-SD alignment (40-stage pipeline)
- Contract-driven execution
- Orchestrator SDs for key stages (20/31/40)
- Large-scale governance across multiple ventures
- EVA integration for autonomous progression

**Research Goals:**

1. Compare governance engines: Temporal.io, Airflow, Dagster, Prefect
2. Determine how LEO should manage long-running workflows
3. Define SD → Stage alignment rules
4. Design child SD orchestration patterns
5. Plan compliance pipeline integration
6. Study how workflow engines handle versioning and migration
7. Research trigger models for stage transitions

**Constraints:**

- LEO must remain in governance schema
- LEO must produce immutable audit logs
- LEO must support SD-first governance
- Must maintain backward compatibility with v4.3.3 SDs
- Must integrate with EVA decision-making

**Deliverables:**

- LEO v5.x Vision Document
- Control Flow Model
- Trigger Model for stage transitions
- Policy Integration Model
- SD-Stage Alignment Rules
- Migration path from v4.3.3 to v5.x

**Expected Output Format:**

Protocol specification with: Vision Statement, Architecture Overview, Control Flow Diagrams, Trigger Definitions, Policy Framework, Migration Strategy, Comparison Matrix (vs Temporal/Airflow).

---

## SD-RESEARCH-107: EVA Intent-vs-Reality Analysis Model

### Deep Research: EVA Intent-vs-Reality Decision Intelligence Model

**Context:**

EVA must analyze a cross-schema view **v_intent_vs_reality** which joins:
- Governance intent (SDs & PRDs defining what should happen)
- Stage contracts (defining expected inputs/outputs)
- Runtime progress (actual artifacts and completions)
- Completion thresholds (what % constitutes "done")
- Stage drift signals (variance from expected)

EVA uses this view to determine:
1. Is the venture on track?
2. Is a stage complete?
3. Should EVA take action?
4. Should EVA escalate to human?

**Research Goals:**

1. Design stage alignment heuristics
2. Define drift detection algorithms
3. Research statistical & rule-based hybrid models
4. Establish risk scoring methodologies
5. Study how to detect data quality issues vs genuine problems
6. Define when EVA should pause vs escalate
7. Research error-handling and recovery patterns
8. Study decision intelligence models from autonomous systems

**Constraints:**

- EVA uses read-only views only
- EVA decisions logged in runtime.eva_decisions
- EVA cannot hallucinate progress (must validate against artifacts)
- Must handle incomplete or ambiguous data gracefully
- Must support different confidence thresholds per autonomy level

**Deliverables:**

- Alignment Engine Specification
- Drift Detection Heuristics
- Stage Risk Scoring Model
- Escalation Logic flowchart
- Data quality validation patterns
- Confidence threshold recommendations

**Expected Output Format:**

Technical specification with: Intent-Reality Mapping Model, Drift Detection Algorithms, Risk Scoring Framework, Escalation Decision Tree, Validation Patterns, Confidence Calibration Guide.

---

## SD-RESEARCH-108: Security, Compliance & AI Auditability

### Deep Research: Security & Compliance Framework for Autonomous AI Ventures

**Context:**

EHG will operate semi-autonomous and autonomous AI systems (EVA) across multiple ventures. Critical requirements:
- Governance history must be immutable
- Venture data must be fully isolated by venture_id
- All EVA decisions must be auditable
- Auditability must survive system failures
- Must prepare for emerging AI regulations (2026-2030)

**Research Goals:**

1. Research zero-trust architecture patterns
2. Design fine-grained RLS for multi-tenant AI
3. Study multi-tenant access control models
4. Define immutable audit log frameworks
5. Research anti-tampering strategies
6. Plan governance-compliance pipelines
7. Assess regulatory outlook for autonomous AI (2026–2030)
8. Study how financial services handle AI audit requirements

**Constraints:**

- EVA cannot escalate privilege under any circumstances
- No superuser agents allowed
- Governance audit logs must be append-only
- Compliance must run through governance schema
- Must support external audit requirements
- Must handle data residency requirements

**Deliverables:**

- Security Architecture specification
- Audit Model for AI decisions
- Compliance Integration roadmap
- Risk Assessment for autonomous operations
- Anti-tampering design patterns
- Regulatory preparedness checklist

**Expected Output Format:**

Security framework document with: Threat Model, Access Control Architecture, Audit Trail Design, Compliance Mapping, Risk Matrix, Regulatory Roadmap, Implementation Priorities.

---

## Research Dependency Order (Recommended)

```
SD-RESEARCH-101 (Schema Architecture) ─────┐
                                           ├──> SD-RESEARCH-102 (EVA Autonomy)
SD-RESEARCH-108 (Security/Compliance) ─────┘
                                                      │
                                                      ▼
                                           SD-RESEARCH-103 (Stage Contracts)
                                                      │
                                                      ▼
                                           SD-RESEARCH-107 (Intent vs Reality)
                                                      │
                                                      ▼
SD-RESEARCH-104 (Unified Interface) ──────────────────┤
                                                      │
                                                      ▼
SD-RESEARCH-105 (Multi-Venture) ──────────> SD-RESEARCH-106 (LEO v5.x)
```

**Recommended Order:**
1. SD-RESEARCH-101 + SD-RESEARCH-108 (parallel - foundational)
2. SD-RESEARCH-102 (EVA Autonomy)
3. SD-RESEARCH-103 (Stage Contracts)
4. SD-RESEARCH-107 (Intent vs Reality)
5. SD-RESEARCH-104 + SD-RESEARCH-105 (parallel - application layer)
6. SD-RESEARCH-106 (LEO v5.x - synthesis)

---

## Returning Research Results

After completing research in Gemini/OpenAI, return results to Claude Code with:

```
I've completed research for SD-RESEARCH-XXX. Here are the findings:

[Paste research output]

Please analyze these findings and update the SD accordingly.
```

Claude Code will:
1. Parse the research findings
2. Store key insights in SD metadata
3. Prepare for PRD generation when all research is complete
