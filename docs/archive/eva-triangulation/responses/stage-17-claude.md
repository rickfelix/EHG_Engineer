---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 17 "Pre-Build Checklist" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Prior-Stage Seeding (Category → Stage Mapping)](#3-prior-stage-seeding-category-stage-mapping)
  - [4. Go/No-Go Threshold Decision](#4-gono-go-threshold-decision)
  - [5. Item Enrichment](#5-item-enrichment)
  - [6. Blocker Severity Enum](#6-blocker-severity-enum)
  - [7. Financial Readiness Integration](#7-financial-readiness-integration)
  - [8. Category Coverage Decision](#8-category-coverage-decision)
  - [9. CLI Superiorities (preserve these)](#9-cli-superiorities-preserve-these)
  - [10. Recommended Stage 17 Schema](#10-recommended-stage-17-schema)
  - [11. Minimum Viable Change (Priority-Ordered)](#11-minimum-viable-change-priority-ordered)
  - [12. Cross-Stage Impact](#12-cross-stage-impact)
  - [13. Dependency Conflicts (with Stages 1-16 decisions)](#13-dependency-conflicts-with-stages-1-16-decisions)
  - [14. Contrarian Take](#14-contrarian-take)

> Independent response to the Stage 17 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Checklist generation from BLUEPRINT stages | N/A | None (all user-provided) | **5 Critical** | Users must manually derive checklist items from 4 stages of structured data. Architecture decisions, team composition, technology choices -- all produce implied readiness items that are not auto-generated. | CLOSE | The analysisStep has Stage 14 (technologies → tooling), Stage 15 (team → readiness), Stage 14 (integration points → dependencies). Direct mapping. |
| Prior-stage artifact seeding | N/A | No cross-stage references | **5 Critical** | Checklist items are generic ("set up CI/CD") instead of specific ("configure GitHub Actions for Next.js + PostgreSQL deployment pipeline per Stage 14 architecture"). | CLOSE | Challenge: Generic items are simpler but less actionable. Stage-specific items are verifiable. |
| Go/no-go decision gate | N/A | readiness_pct with no threshold | **4 High** | Stage 18 (Sprint Planning) starts regardless of readiness. A venture at 30% readiness begins sprinting. | ADD | Challenge: What threshold? 100% is unrealistic. But "all critical items complete + no critical blockers" is reasonable. |
| Item priority | N/A | All items equal weight | **3 Medium** | CI/CD pipeline (blocks everything) treated same as "update README" (blocks nothing). Sprint planning can't sequence setup work. | ADD | Challenge: Priority is useful but adds complexity to each item. Keep it simple: critical vs non-critical. |
| Blocker severity enum | N/A | Free text severity | **2 Low** | Free text works but can't be aggregated or used in go/no-go logic. | ADAPT | Per Stage 15 pattern: critical/high/medium/low. Consistency across stages. |
| Financial readiness integration | N/A | No Stage 16 connection | **3 Medium** | Checklist doesn't verify "can we afford to build?" -- the promotion gate answer. Team might start building without financial viability confirmed. | ADD | Challenge: Stage 16 promotion gate already answers this. But the checklist should surface viability warnings from Stage 16 as items. |
| Item acceptance criteria | N/A | None (binary complete/not) | **2 Low** | No definition of "done" per item. "Set up CI/CD" could mean a basic pipeline or full deployment automation. | ADD | Challenge: Acceptance criteria add verbosity. For a checklist stage, "complete means it works" may be sufficient. |
| Category coverage gaps | N/A | 5 categories (architecture, team, tooling, environment, dependencies) | **2 Low** | No explicit security category. Stage 14 consensus added security as cross-cutting concern. | ADAPT | Challenge: Security items could live under "architecture" or "environment." A dedicated category clarifies but may be unnecessary if security items are seeded there. |

### 2. AnalysisStep Design

**Input (from BLUEPRINT stages)**:
- **Stage 13**: Phases with milestones and deliverables (what needs to be built first)
- **Stage 14**: Architecture layers (technologies → tooling items), integration_points (→ dependency items), security profile (→ security items), data_entities (→ data setup items), constraints (→ constraint items)
- **Stage 15**: Team members with skills and phase_ref (→ team readiness items), skill_gaps (→ hiring/upskill items), hiring_plan (→ onboarding items)
- **Stage 16**: Promotion gate results (→ financial readiness item), viability_warnings (→ blocker items), key_assumptions (→ validation items)

**Process (single LLM call)**:
1. **Architecture → checklist items**: For each Stage 14 layer, generate readiness items. Frontend (React) → "Configure React development environment." Backend (Node.js) → "Set up API server scaffolding." Data (PostgreSQL) → "Provision database instance."
2. **Technologies → tooling items**: For each technology in Stage 14, generate tool setup items. "Install and configure [technology]." "Set up CI/CD pipeline for [frontend framework] + [backend framework]."
3. **Integration points → dependency items**: For each Stage 14 integration_point, generate dependency readiness items. "Verify [external API] access and credentials." "Set up [payment provider] sandbox."
4. **Team → readiness items**: For each Stage 15 team_member, generate readiness items. "Confirm [role] availability for [phase_ref]." For each skill_gap: "Resolve [skill] gap: [mitigation]."
5. **Security → items**: From Stage 14 security profile, generate items. "Implement [auth_approach]." "Configure [compliance_target] monitoring."
6. **Financial → items**: From Stage 16 promotion gate, generate readiness item. Surface any viability_warnings as blockers.
7. **Assign priority**: Critical items = blocks sprint start. Non-critical = can be done during first sprint.

**Output**: Fully populated checklist with items seeded from Stages 13-16, each with source_stage_ref, priority, and suggested owner (based on Stage 15 team roles).

### 3. Prior-Stage Seeding (Category → Stage Mapping)

| Category | Seeded From | Example Items |
|----------|------------|---------------|
| `architecture` | Stage 14 layers, data_entities | "Frontend: Set up React/Next.js project." "Backend: Configure Node.js/Express server." "Data: Provision PostgreSQL database, create initial schema for [N] entities." |
| `team_readiness` | Stage 15 team_members, skill_gaps, hiring_plan | "Confirm [CTO] availability (100% allocation, Phase: Foundation)." "Hire [Security Engineer] before Growth phase." "Resolve skill gap: [Kubernetes] (severity: high)." |
| `tooling` | Stage 14 technologies, infra layer | "Set up CI/CD pipeline for [technology stack]." "Configure Docker/containerization." "Install development dependencies for [frontend framework]." |
| `environment` | Stage 14 infra layer, constraints | "Provision [cloud provider] development account." "Set up staging environment." "Configure [monitoring/logging] tools." |
| `dependencies` | Stage 14 integration_points | "Verify [payment API] sandbox access." "Set up [auth provider] integration." "Confirm [third-party API] rate limits and pricing." |

Each seeded item includes:
- `source_stage_ref`: "stage-14.layers.frontend" or "stage-15.skill_gaps[0]"
- `priority`: critical (blocks sprint) or non-critical (can be concurrent)
- `suggested_owner`: Based on Stage 15 team member with matching skills

### 4. Go/No-Go Threshold Decision

**Add a `build_readiness` decision object.**

```javascript
build_readiness: {
  decision: 'go' | 'conditional_go' | 'no_go',
  rationale: 'string',
  conditions: [],  // For conditional_go: what must be resolved
}
```

**Decision logic**:
- **GO**: All critical items complete + no critical blockers + Stage 16 promotion gate passed
- **CONDITIONAL GO**: ≥80% critical items complete + critical blockers have mitigations + promotion gate passed with warnings
- **NO GO**: <80% critical items complete OR unmitigated critical blockers OR promotion gate failed

This gives Stage 18 (Sprint Planning) a clear signal: start sprinting, start with setup work first, or go back to BLUEPRINT.

### 5. Item Enrichment

**Add priority. Skip deadline and acceptance criteria.**

Items become:
```javascript
{
  name: 'string',          // EXISTING
  status: 'enum',          // EXISTING
  owner: 'string',         // EXISTING
  notes: 'string',         // EXISTING
  priority: 'enum',        // NEW: 'critical' | 'non_critical'
  source_stage_ref: 'string',  // NEW: which prior stage artifact
}
```

**Why only 2 priority levels (critical/non_critical)**:
- A pre-build checklist doesn't need 4-level priority. Either the item blocks sprint start or it doesn't.
- Critical: CI/CD, database provisioning, team availability, auth setup.
- Non-critical: Documentation, code style config, monitoring dashboards.

**Why skip deadline**: Stage 13 phases already have timelines. Items inherit urgency from their phase, not a per-item date.

**Why skip acceptance criteria**: Over-engineering for a checklist. "Complete" means "it works and you can build on it." If an item needs detailed AC, it should be a Stage 18 sprint task, not a checklist item.

### 6. Blocker Severity Enum

**Adopt enum per Stage 15 pattern.**

Current: free text severity.
Proposed: `critical | high | medium | low`

| Severity | Impact on Go/No-Go |
|----------|-------------------|
| critical | NO GO unless mitigated |
| high | CONDITIONAL GO (must resolve in Sprint 1) |
| medium | GO (track and resolve) |
| low | GO (nice to have) |

### 7. Financial Readiness Integration

**Surface Stage 16 promotion gate results as a checklist category item + blockers.**

The analysisStep should:
1. Check Stage 16 promotion_gate.pass. If false → add blocker with severity critical.
2. Check Stage 16 viability_warnings. Each critical/risk warning → add blocker.
3. Add a financial readiness item under a suitable category: "Financial plan validated: runway [X] months, break-even month [Y]."

**Do NOT create a separate "financial" category.** Financial readiness is one item. It doesn't need its own category. Add it to a new `readiness_summary` or under `dependencies` ("financial runway dependency").

### 8. Category Coverage Decision

**Keep 5 categories. Add security items under "architecture."**

The Stage 14 consensus established security as a cross-cutting concern, not a separate layer. Following the same principle: security readiness items belong under "architecture" (e.g., "Implement JWT auth per Stage 14 security profile") or "environment" (e.g., "Configure SSL certificates").

Adding a 6th "security" category creates a precedent for more categories (compliance, data, monitoring...). The 5 existing categories are sufficient if the analysisStep seeds security items into the right categories.

### 9. CLI Superiorities (preserve these)

- **5 well-chosen categories**: Architecture, team, tooling, environment, dependencies cover the essential readiness dimensions. Don't fragment further.
- **Status enum**: not_started/in_progress/complete/blocked is a clean, actionable state machine.
- **Readiness percentage**: A single number that tells you "how ready are we?" is immediately useful.
- **Blockers as separate array**: Separating blockers from checklist items is smart -- blockers are cross-cutting concerns that may affect multiple categories.
- **Owner per item**: Assignment at the checklist level enables accountability.
- **MIN_ITEMS_PER_CATEGORY = 1**: Forces coverage of all 5 dimensions. Simple but effective.

### 10. Recommended Stage 17 Schema

```javascript
const TEMPLATE = {
  id: 'stage-17',
  slug: 'pre-build-checklist',
  title: 'Pre-Build Checklist',
  version: '2.0.0',
  schema: {
    checklist: {
      type: 'object', required: true,
      properties: {
        // Each category: array of items
        architecture: { type: 'array', minItems: 1 },
        team_readiness: { type: 'array', minItems: 1 },
        tooling: { type: 'array', minItems: 1 },
        environment: { type: 'array', minItems: 1 },
        dependencies: { type: 'array', minItems: 1 },
      },
      // Each item schema:
      itemSchema: {
        name: { type: 'string', required: true },
        status: { type: 'enum', values: ['not_started', 'in_progress', 'complete', 'blocked'], required: true },
        owner: { type: 'string' },
        notes: { type: 'string' },
        priority: { type: 'enum', values: ['critical', 'non_critical'] },  // NEW
        source_stage_ref: { type: 'string' },  // NEW: e.g., "stage-14.layers.frontend"
      },
    },

    // === Updated: blockers with severity enum ===
    blockers: {
      type: 'array',
      items: {
        description: { type: 'string', required: true },
        severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },  // CHANGED from free text
        mitigation: { type: 'string', required: true },
        source_stage_ref: { type: 'string' },  // NEW: e.g., "stage-16.viability_warnings[0]"
      },
    },

    // === Existing derived (unchanged) ===
    total_items: { type: 'number', derived: true },
    completed_items: { type: 'number', derived: true },
    readiness_pct: { type: 'number', derived: true },
    all_categories_present: { type: 'boolean', derived: true },
    blocker_count: { type: 'number', derived: true },

    // === NEW: critical items tracking ===
    critical_items_total: { type: 'number', derived: true },
    critical_items_complete: { type: 'number', derived: true },
    critical_readiness_pct: { type: 'number', derived: true },

    // === NEW: build readiness decision ===
    build_readiness: {
      type: 'object', derived: true,
      properties: {
        decision: { type: 'enum', values: ['go', 'conditional_go', 'no_go'] },
        rationale: { type: 'string' },
        conditions: { type: 'array' },  // For conditional_go: what to resolve
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` for checklist generation**. Single LLM call consuming Stages 13/14/15/16. Maps architecture layers to items, team composition to readiness items, technologies to tooling items, integration points to dependency items. Each generated item has source_stage_ref and priority.

2. **P0: Add `source_stage_ref` and `priority` to checklist items**. source_stage_ref enables traceability ("why is this item here?"). priority enables go/no-go logic.

3. **P1: Add `build_readiness` decision object**. go/conditional_go/no_go based on critical item completion + blocker severity + Stage 16 promotion gate.

4. **P1: Change blocker severity to enum** (critical/high/medium/low). Consistent with Stage 15 pattern. Enables automated go/no-go logic.

5. **P1: Add critical items tracking** (critical_items_total, critical_items_complete, critical_readiness_pct). The overall readiness_pct treats all items equally. Critical readiness is what matters for go/no-go.

6. **P2: Surface Stage 16 financial readiness**. Promotion gate results and viability warnings become checklist items or blockers.

7. **P3: Do NOT add acceptance criteria per item**. Over-engineering for a checklist stage.
8. **P3: Do NOT add deadline per item**. Phase timelines from Stage 13 handle this.
9. **P3: Do NOT add a 6th "security" category**. Seed security items into architecture/environment.

### 12. Cross-Stage Impact

| Change | Stage 18 (Sprint Planning) | Stage 19+ (Build/QA) | Overall Pipeline |
|--------|--------------------------|---------------------|-----------------|
| Generated checklist from BLUEPRINT | Sprint 1 backlog informed by what's "not ready." Setup tasks are explicit. | Build team knows prerequisites are met. | Plan → checklist → sprint is a traceable pipeline. |
| Build readiness decision | Sprint planning knows: go (full speed), conditional_go (setup first), no_go (back to BLUEPRINT). | Build doesn't start on shaky foundation. | Prevents "started building before ready" failures. |
| Priority on items | Sprint 1 prioritizes critical setup items. | Critical blockers resolved before feature work. | Unblocks the critical path. |
| Source stage references | Sprint tasks trace back to architecture/team/financial decisions. | Build artifacts trace to BLUEPRINT. | Full traceability from plan to execution. |

### 13. Dependency Conflicts (with Stages 1-16 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 14 → 17 (layers/technologies → architecture + tooling items) | **OK** | Technologies per layer are explicit per Stage 14 consensus. |
| Stage 14 → 17 (integration_points → dependency items) | **OK** | Each has name, source/target layer, protocol. |
| Stage 14 → 17 (security profile → security items) | **OK** | auth_approach, compliance_targets available. |
| Stage 15 → 17 (team_members → team readiness items) | **OK** | Role, skills, allocation, phase_ref all available. |
| Stage 15 → 17 (skill_gaps → team readiness blockers) | **OK** | Skill, severity (enum per consensus), mitigation available. |
| Stage 16 → 17 (promotion_gate → financial readiness) | **OK** | pass/fail, blockers, viability_warnings all available. |
| Stage 16 → 17 (key_assumptions → validation items) | **Soft** | Assumptions with low confidence could seed "validate [assumption]" items. Optional enhancement. |
| Stage 13 → 17 (phases → item timeline context) | **OK** | Phase names and timelines available for context. |

### 14. Contrarian Take

**Arguing AGAINST generated checklist items:**

1. **Generated items create false completeness.** The analysisStep generates 20+ items from prior stages. The team dutifully checks them off. But the REAL pre-build blockers are things the AI couldn't predict: the CTO is on vacation, the AWS account is still being approved, the payment provider requires a 2-week KYC process. The most important checklist items are the ones users ADD, not the ones generated.

2. **Readiness percentage is misleading.** 85% readiness sounds great until you realize the 15% incomplete includes "set up production database" -- which blocks everything. A single critical item at 0% is more important than 20 non-critical items at 100%. The priority system helps, but percentage-based readiness still creates false confidence.

3. **Go/no-go gates add friction to the BUILD LOOP.** THE BUILD LOOP is supposed to be iterative and fast. Adding a formal go/no-go decision between checklist and sprint planning adds ceremony. In practice, teams start building while finishing setup tasks in parallel. A hard "NO GO" at 79% readiness when 80% is the threshold is bureaucratic.

4. **What could go wrong**: Teams spend a week completing every generated checklist item to reach "GO" status, when they could have started building with 3 critical items complete and finished the rest in Sprint 1. The checklist becomes a bottleneck instead of an enabler.

**Counter-argument**: Without generated items, teams forget critical setup tasks (no CI/CD, no staging environment, no auth configured). Without go/no-go, ventures start building without basic infrastructure. The generated checklist is a starting point, not a complete list. The priority system (critical vs non-critical) addresses the "percentage is misleading" concern -- critical_readiness_pct matters more than overall readiness_pct. And "conditional_go" exists precisely for the "start building while finishing setup" pattern.

**Verdict**: Keep generated items as seeds (not final list). Users add/remove/modify. Make the go/no-go decision based on CRITICAL items only, not overall readiness. And include a "conditional_go" path for the common case of "mostly ready, a few things in parallel."
