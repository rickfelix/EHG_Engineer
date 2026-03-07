# Vision: Universal Planning Completeness Framework

**Vision Key**: `VISION-PLAN-COMPLETE-L2-001`
**Architecture Plan**: `ARCH-PLAN-COMPLETE-001` → [Architecture Plan](./universal-planning-completeness-architecture.md)
**Source Brainstorm**: [brainstorm/2026-03-06-orchestrator-planning-completeness-gate.md](../../brainstorm/2026-03-06-orchestrator-planning-completeness-gate.md)
**Brainstorm Session**: `bcca5744-70e8-4c61-a751-29a4c73cf6a8`

## Executive Summary

Analysis of 1,644 strategic directives, 11,308 handoffs, and 2,206 retrospectives reveals a systemic gap: orchestrator children achieve "within scope but objectives not met" at 3x the rate of standalones (18.6% vs 6.0%). Children pass process gates more often (56.7% first-attempt vs 37.6%) but meet objectives less often (66% vs 76%). The root cause is structural: the LEO protocol enforces process compliance (did you run the gates?) but does not enforce planning completeness (did you think through what you're building?).

This vision defines a Universal Planning Completeness Framework that operates at three concentric levels: Venture (foundational thinking before any SDs), Orchestrator (cross-child coherence before any child executes), and Individual SD (sd_type-specific artifacts before that SD enters EXEC). The framework draws from industry best practices — Definition of Ready (Agile), Solution Intent (SAFe), and Architectural Artifacts (TOGAF) — and integrates with existing LEO validation infrastructure rather than reinventing it.

The framework uses structural validation (existence + structure + anti-dummy detection) based on 10 proven patterns already in the codebase, including placeholder detection (14 regex patterns), boilerplate percentage thresholds (75%), and SD-type-aware scoring. High-risk sd_types (feature, database, security) get blocking gates; low-risk types (bugfix, documentation) get advisory warnings.

## Problem Statement

**Who is affected:** Every SD in the LEO system — standalones, orchestrator children, and venture-spawned SDs.

**What the problem is:** The LEO protocol has strong process gates (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-LEAD) but no planning completeness gate. An SD can pass PLAN-TO-EXEC with just a PRD and no wireframes, no persona definition, no acceptance scenarios, no data model specification. The implementer guesses at intent. For orchestrator children, the problem compounds: each child's plan is reviewed in isolation, with no cross-child coherence validation. For ventures, SDs can be spawned before foundational planning (personas, market validation, business model) is complete.

**Current impact:**
- 18.6% of orchestrator child retrospectives are "within scope but objectives not met" vs 6.0% standalone
- Documentation children worst (31% objectives-met), feature children better (73%) but still 27% miss
- 7-10 child orchestrators worst (42% objectives-met) — the "sweet spot" of complexity without coordination
- Rework cycles increase when planning gaps are discovered during EXEC instead of PLAN

## Personas

### The LEO Orchestrator (System)
- **Goals:** Ensure every SD has complete, validated planning artifacts before execution begins. Prevent "within scope but objectives not met" outcomes.
- **Mindset:** Autonomous gate enforcer. Checks artifacts structurally — existence, required fields, anti-dummy — without subjective quality judgment.
- **Key activities:** At PLAN-TO-EXEC boundary, query artifact registry for sd_type-specific requirements, run 4-level validation cascade, return standard gate result.
- **Pain points:** Currently only validates PRD existence and basic fields. No sd_type-aware artifact requirements. No cross-child coherence.

### The SD Author (Claude Agent)
- **Goals:** Produce implementation-ready planning artifacts that prevent rework during EXEC. Get clear signal on what's missing before building starts.
- **Mindset:** Implementer who needs unambiguous specifications. Wireframes prevent UI guessing. Schema designs prevent mid-EXEC table creation. Threat models prevent security afterthoughts.
- **Key activities:** Create PRDs, wireframes, schema designs, API contracts, test plans — whatever the sd_type requires. Fix gaps identified by the planning completeness gate.
- **Pain points:** Currently doesn't know what artifacts are expected for a given sd_type. No clear "Definition of Ready" checklist.

### The Chairman (Human)
- **Goals:** Confidence that when an SD enters EXEC, the thinking is done. Reduce rework, increase first-attempt success rate, improve objectives-met percentage.
- **Mindset:** Strategic oversight. Doesn't review individual artifacts but wants assurance that the system enforces completeness.
- **Key activities:** Review gate pass rates in dashboards. Monitor objectives-met trends. Adjust artifact requirements if they prove too heavy or too light.
- **Pain points:** Currently no visibility into whether planning was complete before execution began. Discovers gaps only when retrospectives report "within scope but objectives not met."

## Information Architecture

### Three-Ring Framework

```
┌─────────────────────────────────────────────────────┐
│  Ring 1: VENTURE                                    │
│  Personas, Market Validation, Business Model,       │
│  Wireframes, User Journeys, IA, Success Metrics     │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Ring 2: ORCHESTRATOR                       │    │
│  │  Architecture Plan, Dependency Map,         │    │
│  │  Interface Contracts, Shared Data Model,    │    │
│  │  Integration Sequence, Risk Register        │    │
│  │                                             │    │
│  │  ┌─────────────────────────────────────┐    │    │
│  │  │  Ring 3: INDIVIDUAL SD              │    │    │
│  │  │  Per-sd_type artifacts:             │    │    │
│  │  │  feature → wireframes, API, a11y    │    │    │
│  │  │  database → schema, RLS, migration  │    │    │
│  │  │  security → threat model, tests     │    │    │
│  │  │  infra → contracts, monitoring      │    │    │
│  │  │  refactor → regression, before/after│    │    │
│  │  │  bugfix → RCA, repro, fix strategy  │    │    │
│  │  └─────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Data Sources

| Table | Role |
|-------|------|
| `planning_artifact_types` (new) | Registry of artifact types with per-sd_type requirements |
| `planning_artifacts` (new) | Artifact records linked to SDs, with content and validation state |
| `validation_gate_registry` (existing) | Gate policy configuration — registers the planning completeness gate |
| `sd_phase_handoffs` (existing) | Gate results stored alongside handoff records |
| `strategic_directives_v2` (existing) | SD metadata including sd_type, parent_sd_id, venture linkage |
| `eva_vision_documents` (existing) | Venture-level vision documents (Ring 1) |
| `eva_architecture_plans` (existing) | Architecture plans (Ring 2) |

### Navigation / Integration Points

- **PLAN-TO-EXEC handoff**: Primary gate trigger point — runs planning completeness validation
- **sd:next display**: Shows artifact completeness status alongside SD queue items
- **Orchestrator preflight**: Validates Ring 2 artifacts before any child enters EXEC
- **Venture lifecycle**: Ring 1 validation before SD creation for a venture

## Key Decision Points

1. **Hard vs Soft requirements by sd_type**: Feature, database, security, infrastructure, and refactor SDs get blocking gates (gate fails if artifacts missing). Enhancement, bugfix, and documentation SDs get advisory gates (warnings but gate passes). This prevents bureaucracy for simple work while enforcing rigor for high-risk work.

2. **Structural validation only**: The gate checks existence, structure, and anti-dummy — NOT quality. Quality assessment is left to human review and EVA/HEAL scoring. This is deliberate: structural checks are machine-evaluable, objective, and fast. Quality checks require judgment and context.

3. **Activation gating**: The framework enforces only on SDs created after activation. Existing in-flight SDs are grandfathered. This prevents mid-stream disruption.

4. **Quick-fix exemption**: QF workflow remains exempt. Quick fixes (≤75 LOC) are explicitly lightweight and don't need planning artifact gates.

5. **Cross-ring coherence deferred**: The initial implementation validates artifact existence at each ring independently. Cross-ring coherence validation (does this child's API match the orchestrator's architecture?) is a future enhancement — valuable but complex, and the existence gate alone addresses the primary problem.

## Integration Patterns

### Existing Gate Infrastructure
The planning completeness gate integrates into the existing gate pipeline:

```
unified-handoff-system.js
  └── executors/plan-to-exec/
      └── gates/
          ├── prd-gates.js (existing — GATE_PRD_EXISTS)
          ├── architecture-plan-validation.js (existing)
          └── planning-completeness-gate.js (NEW)
              ├── queries planning_artifact_types for sd_type requirements
              ├── queries planning_artifacts for existence
              ├── runs 4-level validation cascade
              └── returns gate-result-schema.js format
```

### Existing Validation Patterns (Reused)
- **Placeholder detection**: 14 regex patterns from `prd-quality-validation.js`
- **Boilerplate threshold**: 75% match → block, from `handoff-content-quality-validation.js`
- **Structural checks**: Field-level type/presence validation from `validate-sd-fields.js`
- **Minimum content**: Character count thresholds from `sd-validation.js`
- **Gate result format**: `{ passed, score, maxScore, issues, warnings, details }` from `gate-result-schema.js`
- **Gate policy**: SD-type-aware policy from `gate-policy-resolver.js` + `validation_gate_registry`

### EVA/HEAL Integration
- Vision documents (Ring 1) are already tracked in `eva_vision_documents`
- Architecture plans (Ring 2) are already tracked in `eva_architecture_plans`
- Planning artifacts (Ring 3) can be scored by HEAL to identify quality trends over time

## Evolution Plan

### Phase 1: Ship (Initial Delivery)
- Artifact type registry (database table + seed data for all 9 sd_types)
- Planning artifacts table (stores artifact records linked to SDs)
- Planning completeness gate at PLAN-TO-EXEC boundary
- 4-level validation cascade (existence → structure → anti-dummy → substance)
- SD-type-aware hard/soft requirement distinction
- Integration with existing gate pipeline and gate-policy-resolver
- sd:next display shows artifact completeness status

### Phase 2: Coherence (Future Enhancement)
- Cross-ring coherence validation (child artifacts vs orchestrator architecture)
- Automated cross-reference checking (does API contract reference correct schema?)
- Coherence score as part of gate result

### Phase 3: Intelligence (Future Enhancement)
- Artifact templates auto-generated from brainstorm/vision content
- AI-assisted artifact quality scoring (beyond structural validation)
- Pattern detection across artifacts (identify common gaps by sd_type)
- Artifact reuse suggestions from past SDs

## Out of Scope

- **Quality scoring of artifact content** — structural validation only; quality is for EVA/HEAL
- **Automated artifact generation** — the gate checks, it doesn't create
- **Retroactive enforcement** — existing in-flight SDs are grandfathered
- **Quick-fix artifacts** — QF workflow remains exempt
- **Cross-ring coherence** in Phase 1 — deferred to Phase 2
- **UI/dashboard for artifact management** — CLI and database only in Phase 1

## UI/UX Wireframes

N/A — no UI component. This is a protocol infrastructure improvement operating through CLI gates and database tables. Artifact status is visible through `sd:next` display and handoff gate results.

## Success Criteria

1. **Objectives-met rate for orchestrator children increases from 66% to ≥80%** within 3 months of activation (measured via retrospective classification)
2. **"Within scope but objectives not met" rate for children decreases from 18.6% to ≤10%** (measured via retrospective classification)
3. **Gate pass rate at PLAN-TO-EXEC does not decrease by more than 10%** — the gate should catch missing artifacts without becoming an excessive blocker
4. **Zero false positives on anti-dummy detection** — no legitimate artifacts flagged as placeholder
5. **All 9 sd_types have defined artifact requirements** in the registry with appropriate hard/soft classification
6. **Existing in-flight SDs are not disrupted** — activation gating works correctly
7. **Quick-fix workflow remains unaffected** — QFs pass without artifact checks
8. **Gate result integrates cleanly with existing pipeline** — standard gate-result-schema format, visible in handoff records
