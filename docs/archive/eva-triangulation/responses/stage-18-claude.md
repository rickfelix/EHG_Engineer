---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 18 "Sprint Planning" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Roadmap-to-Sprint Derivation](#3-roadmap-to-sprint-derivation)
  - [4. Capacity Planning Decision](#4-capacity-planning-decision)
  - [5. Stage 17 Readiness Gate](#5-stage-17-readiness-gate)
  - [6. Phase Alignment](#6-phase-alignment)
  - [7. Budget Tracking Decision](#7-budget-tracking-decision)
  - [8. SD Bridge Enhancement](#8-sd-bridge-enhancement)
  - [9. CLI Superiorities (preserve these)](#9-cli-superiorities-preserve-these)
  - [10. Recommended Stage 18 Schema](#10-recommended-stage-18-schema)
  - [11. Minimum Viable Change (Priority-Ordered)](#11-minimum-viable-change-priority-ordered)
  - [12. Cross-Stage Impact](#12-cross-stage-impact)
  - [13. Dependency Conflicts (with Stages 1-17 decisions)](#13-dependency-conflicts-with-stages-1-17-decisions)
  - [14. Contrarian Take](#14-contrarian-take)

> Independent response to the Stage 18 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Sprint item generation from roadmap | MoSCoW features (must/should/nice to have) | None (all user-provided) | **5 Critical** | Users must manually translate 13 stages of structured data into sprint items. Stage 13 has typed deliverables with priority -- they should become items. | CLOSE | The LLM has deliverables (typed, prioritized), architecture, team -- it can generate a sprint backlog. |
| Roadmap-to-sprint derivation | Sprint tied to MVP features | No Stage 13 connection | **5 Critical** | Sprint items disconnected from product roadmap. Could sprint on features not in the roadmap. | CLOSE | Challenge: Not ALL deliverables fit in one sprint. Filter by "now" priority + current phase. |
| Capacity planning | Velocity/capacity tracking | total_story_points (no capacity) | **4 High** | Sprint planned with 100 story points when team has capacity for 30. Over-commitment at sprint start. | ADD | Challenge: Story points are estimates. But capacity comparison catches gross over-planning. |
| Stage 17 readiness gate | N/A | No Stage 17 connection | **4 High** | Sprint starts with no CI/CD, no database provisioned, no team onboarded. | ADD | Stage 17 build_readiness should be checked. If no_go, sprint shouldn't start. |
| Phase alignment | N/A | No phase_ref | **3 Medium** | Sprint not linked to roadmap phase. Can't validate sprint goal against phase goals. | ADD | Simple: add phase_ref to sprint. |
| Item status tracking | backlog→in_progress→review→done | Static (planned only) | **2 Low** | Status is Stage 19's concern. At PLANNING, items are by definition "planned." | DEFER | Status tracking is BUILD (Stage 19), not PLANNING (Stage 18). CLI is correct to omit it here. |
| Budget tracking | N/A | No cost tracking | **3 Medium** | Sprint cost unknown relative to phase budget from Stage 16. | ADD | Challenge: Sprint cost = team cost × duration (from Stage 15/16). Simple calculation, useful for budget coherence. |
| SD Bridge enrichment | N/A (no SD concept) | Basic field copy | **3 Medium** | SD payloads lack architecture context and team assignments. | ENHANCE | Add architecture_layer_ref and suggested_assignee based on Stage 14/15 data. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 13**: Current phase deliverables with priority (now/next/later), typed (feature/infrastructure/integration/content), milestones, outcomes
- **Stage 14**: Architecture layers with technologies, data_entities with complexity, integration_points
- **Stage 15**: Team members with skills, allocation_pct, phase_ref, cost_monthly
- **Stage 16**: Cost_by_phase (current phase budget), financial projections
- **Stage 17**: build_readiness decision, completed/incomplete checklist items, remaining blockers

**Process (single LLM call)**:

1. **Phase selection**: Identify current phase from Stage 13 (the phase with "now" deliverables or the first incomplete phase).

2. **Deliverable → sprint item mapping**:
   - Stage 13 deliverables with priority "now" → sprint items
   - Deliverable type maps to SD type:
     - `feature` → `feature`
     - `infrastructure` → `infra`
     - `integration` → `feature` or `infra` (depending on scope)
     - `content` → `enhancement`
   - Each deliverable gets: title (from deliverable name), description (from deliverable + architecture context), priority (from deliverable priority), scope (from architecture layer), success_criteria (from milestone outcomes)

3. **Architecture context enrichment**: For each sprint item, identify the relevant Stage 14 architecture layer(s) and technologies. "Build user authentication" → scope: "backend (Node.js) + data (PostgreSQL)"

4. **Capacity estimation**: Sum team allocation × sprint_duration from Stage 15. Compare to estimated story points. Warn if over-committed.

5. **Sprint goal derivation**: Generate sprint_goal from the current phase goal + milestone objectives.

6. **Budget estimation**: Sprint cost = (sum of active team_members.cost_monthly × sprint_duration_days / 30). Compare to Stage 16 phase budget allocation.

7. **Incomplete Stage 17 items**: If build_readiness = conditional_go, add incomplete critical items as "infra" type sprint items.

**Output**: Complete sprint (name, duration, goal, items with SD bridge payloads, capacity_check, budget_check)

### 3. Roadmap-to-Sprint Derivation

**Stage 13 deliverables → sprint items via priority filter.**

```
Stage 13 Phase "Foundation":
  Milestone 1: "Core Platform"
    Deliverable: "User authentication" (type: feature, priority: now)
    Deliverable: "Database schema" (type: infrastructure, priority: now)
    Deliverable: "Payment integration" (type: integration, priority: next)
  Milestone 2: "MVP Launch"
    Deliverable: "Landing page" (type: content, priority: next)

Sprint 1 items (derived from "now" priority):
  → "User authentication" (type: feature, SD type: feature)
  → "Database schema" (type: infrastructure, SD type: infra)
```

**Rules**:
- Only "now" priority deliverables enter the sprint
- If "now" deliverables exceed capacity, split by milestone (Milestone 1 first)
- "next" deliverables become the backlog for Sprint 2
- "later" deliverables stay in the roadmap

**Sprint goal**: Derived from the milestone that contains the most "now" deliverables.

### 4. Capacity Planning Decision

**Add capacity check. Warning, not blocker.**

```javascript
capacity_check: {
  team_capacity_points: number,  // Estimated from Stage 15
  planned_points: number,         // Sum of item story_points
  utilization_pct: number,        // planned / capacity × 100
  warning: string | null,         // If utilization > 120%
}
```

**Capacity estimation**:
- Each team member: allocation_pct × sprint_duration_days = available person-days
- Total capacity in story points: total person-days × velocity_assumption (default: 1 point per person-day until empirical data exists)
- If total_story_points > capacity × 1.2: warn "Sprint is over-committed by X%"

The first sprint has no velocity data, so capacity is estimated. Future sprints (Stage 18 re-invocations) could use actual velocity from prior sprints.

### 5. Stage 17 Readiness Gate

**Check build_readiness before generating sprint.**

```javascript
// In analysisStep, before generating items:
if (stage17.build_readiness.decision === 'no_go') {
  return {
    error: 'Stage 17 build readiness is NO_GO. Resolve blockers before sprint planning.',
    blockers: stage17.build_readiness.conditions,
  };
}
if (stage17.build_readiness.decision === 'conditional_go') {
  // Add unresolved critical checklist items as sprint items (type: infra)
  const setupItems = stage17.checklist.architecture
    .concat(stage17.checklist.tooling, stage17.checklist.environment)
    .filter(item => item.priority === 'critical' && item.status !== 'complete')
    .map(item => ({
      title: `[SETUP] ${item.name}`,
      type: 'infra',
      priority: 'critical',
      source: 'stage-17-carry-forward',
    }));
}
```

### 6. Phase Alignment

**Add phase_ref and validate sprint_goal.**

```javascript
sprint: {
  sprint_name: 'string',
  phase_ref: 'string',      // NEW: Stage 13 phase name
  sprint_goal: 'string',    // EXISTING but now validated
  sprint_duration_days: 'number',
}
```

The analysisStep sets phase_ref to the current phase. sprint_goal is generated from phase goal + milestone objectives. User can override but the default is derived.

### 7. Budget Tracking Decision

**Add sprint_budget as derived field.**

```javascript
sprint_budget: {
  estimated_cost: number,     // team_cost × (sprint_days / 30)
  phase_budget: number,       // From Stage 16 cost_by_phase
  phase_budget_remaining: number,
  warning: string | null,     // If sprint cost > remaining budget
}
```

This is a simple calculation: team members active in this phase × cost_monthly × (sprint_duration / 30). Compare to Stage 16 phase budget. Warn if sprint cost exceeds remaining phase budget.

### 8. SD Bridge Enhancement

**Enrich SD payloads with architecture and team context.**

Current SD bridge: copies title, description, priority, type, scope, success_criteria, dependencies, risks, target_application.

Enhanced:
```javascript
sd_bridge_payloads: items.map(item => ({
  // Existing fields...
  title: item.title,
  description: item.description,
  priority: item.priority,
  type: item.type,
  scope: item.scope,
  success_criteria: item.success_criteria,
  dependencies: item.dependencies,
  risks: item.risks,
  target_application: item.target_application,
  // NEW: architecture context
  architecture_layers: ['backend', 'data'],  // From Stage 14
  technologies: ['Node.js', 'PostgreSQL'],   // From Stage 14
  // NEW: team context
  suggested_assignee_role: 'Backend Engineer',  // From Stage 15 skill match
  // NEW: source traceability
  deliverable_ref: 'stage-13.milestones[0].deliverables[1]',
}))
```

This makes the SD payload richer for the LEO Protocol, enabling better team assignment and architecture alignment during execution.

### 9. CLI Superiorities (preserve these)

- **SD Bridge**: The single most powerful feature. Bridging EVA lifecycle → LEO Protocol execution is unique. No other venture planning tool generates execution directives. Preserve and enhance.
- **SD_TYPES enum**: feature/bugfix/enhancement/refactor/infra covers the essential work types. Well-chosen.
- **PRIORITY_VALUES**: critical/high/medium/low -- consistent with the pattern established across stages.
- **Required success_criteria**: Forces definition of "done" at planning time. Important for execution clarity.
- **target_application**: Enables multi-application ventures (frontend app, backend API, mobile app).
- **Sprint metadata**: sprint_name + sprint_goal + sprint_duration_days is clean and minimal.

### 10. Recommended Stage 18 Schema

```javascript
const TEMPLATE = {
  id: 'stage-18',
  slug: 'sprint-planning',
  title: 'Sprint Planning',
  version: '2.0.0',
  schema: {
    // === Existing (enhanced) ===
    sprint_name: { type: 'string', required: true },
    sprint_duration_days: { type: 'number', min: 1, max: 30, required: true },
    sprint_goal: { type: 'string', minLength: 10, required: true },
    phase_ref: { type: 'string' },  // NEW: Stage 13 phase

    items: {
      type: 'array', minItems: 1,
      items: {
        title: { type: 'string', required: true },
        description: { type: 'string', required: true },
        priority: { type: 'enum', values: ['critical', 'high', 'medium', 'low'], required: true },
        type: { type: 'enum', values: ['feature', 'bugfix', 'enhancement', 'refactor', 'infra'], required: true },
        scope: { type: 'string', required: true },
        success_criteria: { type: 'string', required: true },
        dependencies: { type: 'array' },
        risks: { type: 'array' },
        target_application: { type: 'string', required: true },
        story_points: { type: 'number', min: 1 },
        deliverable_ref: { type: 'string' },  // NEW: Stage 13 deliverable reference
        architecture_layers: { type: 'array' },  // NEW: from Stage 14
      },
    },

    // === Existing derived (unchanged) ===
    total_items: { type: 'number', derived: true },
    total_story_points: { type: 'number', derived: true },

    // === Updated: SD Bridge with enrichment ===
    sd_bridge_payloads: {
      type: 'array', derived: true,
      // Each payload now includes architecture_layers, technologies, suggested_assignee_role, deliverable_ref
    },

    // === NEW: capacity check ===
    capacity_check: {
      type: 'object', derived: true,
      properties: {
        team_capacity_points: { type: 'number' },
        planned_points: { type: 'number' },
        utilization_pct: { type: 'number' },
        warning: { type: 'string', nullable: true },
      },
    },

    // === NEW: sprint budget ===
    sprint_budget: {
      type: 'object', derived: true,
      properties: {
        estimated_cost: { type: 'number' },
        phase_budget: { type: 'number' },
        phase_budget_remaining: { type: 'number' },
        warning: { type: 'string', nullable: true },
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` for sprint item generation**. Single LLM call consuming Stages 13/14/15/16/17. Derives items from "now" priority deliverables in current phase. Maps deliverable types to SD types. Generates sprint_goal from milestone objectives.

2. **P0: Add roadmap-to-sprint derivation**. Stage 13 "now" deliverables → sprint items. deliverable_ref on items for traceability. architecture_layers from Stage 14.

3. **P1: Add `phase_ref`**. Links sprint to Stage 13 phase. Sprint goal derived from phase goal.

4. **P1: Add `capacity_check`**. Team capacity from Stage 15 allocation × sprint duration. Compare to total_story_points. Warning if over-committed.

5. **P1: Check Stage 17 build_readiness**. If no_go → block sprint. If conditional_go → add setup items as type:infra.

6. **P1: Enrich SD Bridge payloads**. Add architecture_layers, technologies, suggested_assignee_role, deliverable_ref to each payload.

7. **P2: Add `sprint_budget`**. Team cost × sprint duration vs Stage 16 phase budget. Warning if exceeds.

8. **P3: Do NOT add item status tracking**. Status is Stage 19 (Build Execution), not Stage 18 (Sprint Planning).
9. **P3: Do NOT add MoSCoW priority**. critical/high/medium/low is sufficient and consistent with the existing pattern.
10. **P3: Do NOT add technical debt tracking**. Tech debt emerges during build (Stage 19+), not planning.
11. **P3: Do NOT add velocity tracking**. No historical data on first sprint. Future sprints could use actual velocity.

### 12. Cross-Stage Impact

| Change | Stage 19 (Build Execution) | Stage 20+ (QA/Review/Deploy) | SD Bridge (LEO Protocol) |
|--------|--------------------------|---------------------------|------------------------|
| Generated items from roadmap | Build team works on roadmap-aligned items, not ad hoc features. | QA validates against milestone outcomes. | SD payloads have clear provenance from roadmap. |
| Capacity planning | Sprint is right-sized. No over-commitment. | Realistic timeline for QA cycle. | SDs are feasible within sprint capacity. |
| Architecture enrichment in SD Bridge | Build knows which layers/technologies are involved. | QA knows architecture scope to test. | LEO Protocol has architecture context for each SD. |
| Phase alignment | Build output maps to phase milestones. | Review validates against phase goals. | SDs connect to venture lifecycle phase. |

### 13. Dependency Conflicts (with Stages 1-17 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 13 → 18 (deliverables → items) | **OK** | Deliverables have name, type, priority (now/next/later). Direct mapping to sprint items. |
| Stage 13 → 18 (phases → phase_ref) | **OK** | Phase names and goals available. |
| Stage 14 → 18 (layers/technologies → architecture context) | **OK** | Technologies per layer available for SD Bridge enrichment. |
| Stage 15 → 18 (team → capacity) | **OK** | allocation_pct and cost_monthly available per member. |
| Stage 16 → 18 (cost_by_phase → sprint budget) | **OK** | Phase costs available for budget comparison. |
| Stage 17 → 18 (build_readiness → gate check) | **OK** | Decision enum (go/conditional_go/no_go) available. |

**Soft issue**: Stage 13 deliverable → sprint item mapping depends on deliverables being specific enough. "Build the frontend" is too broad for a sprint item. But Stage 13 consensus requires typed deliverables with milestones, which should be granular enough.

### 14. Contrarian Take

**Arguing AGAINST roadmap-to-sprint derivation:**

1. **Roadmap deliverables are not sprint-ready.** Stage 13 deliverables like "User authentication system" are too coarse for a sprint. A sprint item needs to be achievable in days, not weeks. The analysisStep will either generate items that are too broad (and need manual decomposition) or decompose them (and guess wrong).

2. **Sprint planning is inherently human.** The best sprint plans come from team discussions: "What can we realistically ship this week?" "What technical risks should we address first?" An AI-generated sprint backlog short-circuits this team alignment. The founder knows the CTO is only available Tuesday-Thursday. The AI doesn't.

3. **Capacity planning creates false precision.** Story points are estimates. Team capacity is an estimate. Comparing two estimates and generating a "utilization: 87%" number creates false confidence. In reality, Sprint 1 is pure discovery -- you don't know your velocity, you don't know the codebase complexity, you don't know how the tech stack behaves.

4. **What could go wrong**: The analysisStep generates a perfect-looking sprint plan that the team follows blindly, instead of adapting to what they discover during Sprint 1. The plan becomes a straitjacket. Startups need to pivot within sprints, not just between them.

**Counter-argument**: Without the analysisStep, users start from a blank sprint with no connection to their roadmap. Without capacity planning, the first sprint is either absurdly over-committed or timidly under-committed. The generated sprint is a STARTING POINT -- the user reviews, adjusts, adds items. And the SD Bridge is the whole point: converting venture planning into execution directives. Without roadmap derivation, the bridge has no planned provenance.

**Verdict**: Generate the sprint items as suggestions, clearly labeled as "derived from roadmap." User reviews and modifies. Capacity check is a warning, not a constraint. The sprint plan is owned by the team, not the AI.
