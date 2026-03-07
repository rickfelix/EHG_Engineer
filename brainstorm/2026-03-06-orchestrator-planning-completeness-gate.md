# Brainstorm: Universal Planning Completeness Framework

## Metadata
- **Date**: 2026-03-06
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All (cross-cutting protocol improvement affecting venture workflow + SD workflow)

---

## Problem Statement

### The Data
Analysis of 1,644 strategic directives, 11,308 handoffs, and 2,206 retrospectives reveals that orchestrator children achieve "within scope but objectives not met" at **3x the rate of standalones** (18.6% vs 6.0%). While children are more process-compliant (56.7% first-attempt pass vs 37.6% standalone), they are less outcome-effective (66% objectives-met vs 76% standalone).

### The Deeper Problem
The orchestrator child gap is a symptom of a larger issue: **the LEO protocol enforces process compliance (did you run the gates?) but does not enforce planning completeness (did you think through what you're building?)**. This applies at every level:

- **Standalone SDs** can pass PLAN-TO-EXEC with just a PRD and no wireframes, no persona definition, no acceptance scenarios — the implementer guesses at intent
- **Orchestrator children** proceed to EXEC individually without cross-child coherence validation — each child's plan is reviewed in isolation
- **Ventures** can spawn SDs before foundational planning (personas, market validation, business model) is complete — building starts before thinking is done

### The Principle
**Don't start building until thinking is done.** This is the 25-stage venture workflow principle: vision, validation, and blueprints must be complete before building begins. This brainstorm designs the enforcement mechanism that makes that principle structural rather than aspirational — at every level of the system.

## Discovery Summary

### Data-Driven Evidence
- **Standalone vs Child gap**: 18.6% of child retros are "within scope but objectives not met" vs 6.0% standalone
- **Process compliance paradox**: Children pass gates more often (56.7% first-attempt) but meet objectives less often (66%)
- **Type-specific patterns**: Documentation children worst (31% objectives-met), feature children better (73%)
- **Orchestrator size effect**: 7-10 child orchestrators worst (42% objectives-met), 16+ best (99%)
- **Time trend**: Gap has closed in Feb-Mar 2026, but structural fix warranted for durability

### Industry Best Practices
The framework draws from established industry patterns:

- **Definition of Ready (DoR)**: Agile best practice where backlog items must meet readiness criteria before work begins. Research from [Atlassian](https://www.atlassian.com/agile/project-management/definition-of-ready) and [Hyperdrive Agile](https://hyperdriveagile.com/articles/definition-of-ready-in-agile-teams-complete-guide-with-examples-73) emphasizes that **DoR criteria should vary by work type** — features need design mockups, infrastructure needs security/compliance baked in.
- **SAFe Solution Intent**: The Scaled Agile Framework uses [Solution Intent](https://premieragile.com/what-is-solution-intent-in-safe/) as a single source of truth for what a large solution does and plans to do — specifications, design artifacts, and validation tests must exist before execution begins.
- **Multi-Team Coordination**: Research from [Scaling Patterns Library](https://scalingpatterns.org/plays/multi-team-planning/) and [Springer](https://link.springer.com/chapter/10.1007/978-3-030-78098-2_9) shows that cross-team artifact coherence — interface contracts, dependency maps, shared understanding — is the primary predictor of multi-team delivery success.
- **TOGAF Architectural Artifacts**: The Open Group's [architecture framework](https://pubs.opengroup.org/architecture/togaf91-doc/arch/chap35.html) defines interface contracts, data flow diagrams, and application interaction matrices as standard enterprise planning artifacts.

### Design Decisions (Evolved Through Discussion)
1. **Three concentric rings**: Venture → Orchestrator → Individual SD, each with appropriate artifact requirements
2. **sd_type-driven artifacts**: Artifact requirements map directly to `sd_type` (feature, infrastructure, database, security, etc.) — no need for separate "context" categories
3. **Cross-ring coherence**: Artifacts at each level validate against the level above (child wireframes match orchestrator architecture, orchestrator architecture matches venture vision)
4. **Universal application**: Standalone SDs use ring 3 only. Orchestrators use rings 2+3. Venture-building uses all three rings.
5. **Ship declaration + existence gate together**: No phased rollout — deliver the full declaration + gate as one unit. Defer coherence validation (cross-reference checks) until the gate proves its value.

## The Three-Ring Framework

### Ring 1: Venture-Level Artifacts
*Validated before any SDs are created for a venture*

These artifacts ensure that foundational thinking is complete before any building begins. They answer: **What are we building, for whom, and why?**

| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Personas** | User profiles with goals, behaviors, pain points, and decision-making context | Without personas, features are built for imagined users. Every feature decision should trace to a persona need. |
| **Market Validation** | Hypothesis statement, evidence gathered, competitive landscape analysis | Prevents building solutions to problems nobody has. Forces evidence over intuition. |
| **Business Model Canvas** | Value proposition, revenue model, cost structure, key resources | Ensures viability thinking happens before engineering investment. |
| **Wireframes / UI Mockups** | Key screens, navigation flow, interaction patterns for primary user journeys | Visual thinking catches UX problems that text requirements miss. Shared visual artifact aligns all downstream SDs. |
| **User Journeys** | End-to-end flows for primary use cases, including edge cases and error states | Maps the full experience, not just happy paths. Reveals gaps between features. |
| **Information Architecture** | Data model overview, navigation structure, content hierarchy | Structural blueprint that all SDs build against. Prevents conflicting data models across SDs. |
| **Success Metrics Definition** | KPIs, measurement plan, baseline values, target values | Defines what "done" looks like at the venture level. Without this, individual SDs can succeed while the venture fails. |

### Ring 2: Orchestrator-Level Artifacts
*Validated before any child enters EXEC*

These artifacts ensure cross-child coherence. They answer: **How do the pieces fit together?**

| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Architecture Plan** | Component design, technology choices, system boundaries | The technical blueprint that all children implement against. Without it, children make conflicting technology choices. |
| **Cross-Child Dependency Map** | Which children depend on which, in what order, producing what outputs | Prevents children from starting EXEC before their dependencies are ready. Makes execution ordering explicit. |
| **Interface Contracts** | API surfaces between children — endpoints, request/response shapes, error handling | The "handshake agreement" between sibling children. If Child A produces an API and Child B consumes it, the contract must be defined before either builds. |
| **Shared Data Model** | Tables, schemas, and data structures that multiple children read or write | Prevents conflicting schema designs. If two children both need a `user_preferences` table, the structure is agreed upon once. |
| **Integration Sequence** | Execution ordering based on dependencies, with milestones and checkpoints | Makes the build order explicit. Which child ships first? What must be true before the next child starts? |
| **Risk Register** | Cross-cutting risks that affect multiple children, with mitigation strategies | Risks that span children (e.g., "if the auth system changes, 3 children are affected") need orchestrator-level awareness. |

### Ring 3: Individual SD Artifacts (Per sd_type)
*Validated before that SD enters EXEC — applies to standalones AND orchestrator children*

These artifacts ensure that individual SD planning is complete for its work type. They answer: **Is this specific piece of work ready to build?**

#### Feature SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Acceptance Scenarios** | Given/When/Then specifications for each user story | Defines "done" in testable terms. Without these, the implementer and reviewer have different definitions of success. |
| **Wireframes / UI Mockups** | Screen designs for new or modified UI | Visual specification prevents ambiguity. "Add a settings page" means different things to different implementers. |
| **Data Model Changes** | New tables, columns, constraints, indexes needed | Forces schema thinking before code. Prevents mid-EXEC "we need a new table" discoveries. |
| **API Surface** | Endpoints, inputs, outputs, authentication, error responses | Contract between frontend and backend. Without it, integration is discovered during EXEC. |
| **User Journey Mapping** | How this feature fits into the broader user experience | Prevents features that work in isolation but break the overall flow. |
| **Accessibility Requirements** | WCAG compliance targets, screen reader behavior, contrast requirements | Accessibility retrofitting is 3-5x more expensive than building it in. Specify upfront. |

#### Infrastructure SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **API Contracts** | Input/output specifications for any new APIs or modified interfaces | Infrastructure is consumed by other systems — contracts define the surface. |
| **Configuration Specification** | Environment variables, feature flags, deployment parameters | Infrastructure without config spec creates "works on my machine" problems. |
| **Dependency Map** | What systems depend on this infrastructure, and what this depends on | Infrastructure changes have blast radius. Map it before building. |
| **Monitoring / Observability Plan** | What metrics to track, alerting thresholds, dashboard requirements | Infrastructure without monitoring is invisible infrastructure. Define observability upfront. |
| **Migration Plan** | Steps to move from current state to new state, with rollback | Infrastructure changes are often irreversible in production. Plan the transition. |
| **Rollback Strategy** | How to revert if the change causes problems | The escape hatch. Must be designed, not improvised. |

#### Database SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Schema Design** | Tables, columns, types, constraints, indexes, foreign keys | The most expensive artifact to change post-EXEC. Get it right in planning. |
| **Migration Plan (Up/Down)** | Forward migration SQL and rollback SQL | Database changes in production require tested, reversible migrations. |
| **RLS Policy Specification** | Row-level security rules for each new table or modified table | Security is not optional. RLS must be designed, not added as an afterthought. |
| **Data Backfill Strategy** | How existing data is migrated to new schema | If modifying existing tables, the backfill plan is as important as the schema change. |
| **Performance Impact Analysis** | Query patterns, expected data volume, index strategy | A table that works at 100 rows may fail at 1M. Analyze before building. |
| **Rollback Plan** | How to revert schema changes if they cause problems | Database rollbacks are the hardest rollbacks. Must be explicitly planned. |

#### Security SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Threat Model** | STRIDE or equivalent analysis of threats to the system | Security work without threat modeling is guessing at what to fix. |
| **Attack Surface Inventory** | All entry points, data flows, trust boundaries | Maps what needs protection. Prevents "we secured the front door but left the back door open." |
| **Mitigation Strategy** | Specific countermeasure for each identified threat | Connects threats to actions. Without it, security work is ad-hoc. |
| **Security Test Plan** | Penetration testing approach, automated security scanning, edge cases | Verification plan for security changes. How do we know the fix works? |
| **Compliance Checklist** | OWASP Top 10, relevant regulations, internal security policies | External standard that validates completeness. Not just "did we fix the bug" but "are we secure." |

#### Refactor SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Before/After Architecture Comparison** | Current structure vs. target structure, with clear boundaries | Refactors without a target architecture drift into rewrites. Define the destination. |
| **Regression Test Plan** | Tests that prove existing behavior is preserved | The whole point of a refactor is "same behavior, better structure." Prove it. |
| **Backward Compatibility Assessment** | What external interfaces (APIs, imports, configs) must remain stable | Breaking changes in a refactor are a different kind of failure. Identify and protect boundaries. |
| **File Modification Scope** | Explicit list of files that change and files that must NOT change | Scope containment. Refactors that touch "just one more file" are the ones that fail. |
| **Performance Baseline** | Before/after benchmarks for critical paths | Refactors should not degrade performance. Measure before, measure after. |

#### Bugfix SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Root Cause Analysis** | 5-Whys or equivalent investigation of why the bug exists | Fixing symptoms without understanding causes leads to recurring bugs. |
| **Reproduction Steps** | Exact steps to reproduce the bug, including environment and data state | If you can't reproduce it, you can't verify the fix. |
| **Fix Strategy** | Approach to the fix — not just "fix it" but how and why this approach | Multiple fix strategies often exist. Choosing the right one requires planning. |
| **Regression Test Plan** | Tests that prove the fix works AND doesn't break related functionality | Bug fixes are the #1 source of new bugs. Regression testing is mandatory. |
| **Related Issues Assessment** | Are there similar bugs elsewhere? Is this a pattern or an isolated incident? | Prevents fixing one instance while leaving 5 others. |

#### Enhancement SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Impact Analysis** | What existing behavior changes, who is affected, what breaks | Enhancements modify existing systems. Understand the blast radius. |
| **Acceptance Scenarios** | Given/When/Then for the enhanced behavior | Same as feature — defines "done" in testable terms. |
| **Data Model Changes** | Schema modifications needed, if any | Same as feature — forces schema thinking upfront. |
| **Backward Compatibility Assessment** | Will existing users/integrations be affected? | Enhancements that break existing users are bugs, not enhancements. |

#### Documentation SDs
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Content Outline** | Section structure, topics covered, depth per section | Even docs need a plan. Prevents rambling, ensures coverage. |
| **Target Audience Definition** | Who reads this, what do they already know, what do they need to learn | Docs written for the wrong audience are worse than no docs. |
| **Coverage Checklist** | What must be documented, what's out of scope | Scope control for documentation. Prevents infinite scope creep. |
| **Review Criteria** | How to evaluate the documentation quality | Docs need acceptance criteria too. "Is it accurate? Is it complete? Is it findable?" |

#### Orchestrator SDs (as parent)
| Artifact | Description | Why Required |
|----------|-------------|--------------|
| **Vision Document** | What this orchestrator achieves, why it matters, success criteria | The north star that all children align to. Without it, children optimize locally. |
| **Architecture Plan** | Technical blueprint, component design, technology choices | Same as Ring 2 — but owned by the orchestrator SD itself. |
| **Child Decomposition Rationale** | Why these specific children, what each contributes, where boundaries are | Makes the decomposition decision explicit and reviewable. Prevents arbitrary splitting. |
| **Required Artifact Declarations** | Which Ring 3 artifacts each child must produce, based on its sd_type | The orchestrator declares what planning completeness means for its children. |
| **Cross-Child Dependency Map** | Same as Ring 2 — owned by the orchestrator, validated at the gate | Makes execution ordering explicit. |

## Cross-Ring Coherence

The power of the three-ring framework is not just that each ring has artifacts — it's that **artifacts at each level validate against the level above**:

| Validation | What It Checks |
|------------|----------------|
| **Child → Orchestrator** | Does this child's API contract match the orchestrator's architecture plan? Does the data model align with the shared data model? |
| **Orchestrator → Venture** | Does the architecture plan implement the venture's wireframes? Does the dependency map cover all user journeys? |
| **Child → Venture** (transitive) | Does this child's feature acceptance scenario trace back to a venture persona need? |

**Implementation note**: Cross-ring coherence is a deferred capability. The initial implementation enforces artifact *existence* at each ring. Coherence *validation* (automated cross-reference checking) is a future enhancement once the framework proves its value.

## Validation Approach

### Principle: Structural Validation, Not Quality Scoring

The gate does **not** attempt to measure whether an artifact is *good* — that's a subjective judgment best left to human review and EVA/HEAL scoring. Instead, it validates three things:

1. **Existence** — Does the artifact record exist?
2. **Structure** — Does it contain the required sections/fields for its type?
3. **Anti-Dummy** — Is it real content, not placeholder or boilerplate?

This mirrors the proven validation patterns already in the LEO codebase.

### Existing Codebase Patterns to Reuse

The LEO protocol already has battle-tested validation infrastructure. The planning completeness gate should reuse these patterns rather than inventing new ones:

| Pattern | Source File | What It Does | How We Reuse It |
|---------|-------------|--------------|-----------------|
| **Placeholder Detection** | `scripts/modules/prd-quality-validation.js` | 14 regex patterns: `'to be defined'`, `'tbd'`, `'placeholder'`, `'insert here'`, `'lorem ipsum'`, etc. | Apply same patterns to all artifact text fields. Any match → artifact flagged as incomplete. |
| **Boilerplate Percentage** | `scripts/modules/handoff-content-quality-validation.js` | 42 boilerplate action_item patterns, 20 deliverables patterns. If ≥75% of items match boilerplate → block. | Calculate boilerplate % for each artifact's content. Same 75% threshold. |
| **Structural Validation** | `scripts/modules/sd-creation/validate-sd-fields.js` | Checks `Array.isArray(items) && items.every(item => item.criterion && item.measure)` | Define per-artifact-type structural schemas. Validate required fields exist and have correct types. |
| **Minimum Content Thresholds** | `scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js` | `objectivesText.length >= 100`, `executive_summary >= 50 chars` | Set per-artifact-type minimum character counts. A 3-word persona description fails. |
| **SD-Type-Aware Scoring** | `scripts/modules/prd-quality-validation.js` | `reducedPenaltyTypes` — infrastructure/documentation get lighter weights | Same principle: bugfix/docs artifacts have advisory-only requirements. Feature/security artifacts are blocking. |
| **Gate Result Schema** | `scripts/modules/handoff/validation/gate-result-schema.js` | Standard return format: `{ passed, score, maxScore, issues, warnings, details }` | Planning completeness gate returns this exact format. Integrates cleanly with existing gate pipeline. |
| **Gate Policy Resolver** | `scripts/modules/handoff/gate-policy-resolver.js` | Queries `validation_gate_registry` DB table per SD type + validation profile | Register the planning completeness gate in the existing registry. SD-type-aware policy comes free. |
| **Advisory vs Blocking** | `scripts/modules/handoff/executors/plan-to-lead/gates/architecture-plan-validation.js` | Advisory-only gate pattern (always passes, reports warnings) | Low-risk sd_types (bugfix, docs) use advisory mode. High-risk (feature, security) use blocking mode. |
| **Decision Verb Presence** | `scripts/modules/handoff-content-quality-validation.js` | Checks that action items contain actual decision verbs, not passive descriptions | Applicable to fix strategy, mitigation strategy, and rollback plan artifacts. |
| **SMART Criteria Keywords** | `scripts/modules/handoff/verifiers/lead-to-plan/sd-validation.js` | Checks for measurable, time-bound language in success criteria | Applicable to acceptance scenarios and success metrics artifacts. |

### Validation Hierarchy (Per Artifact)

Each artifact goes through a 4-level validation cascade. Failure at any level stops evaluation:

```
Level 1: EXISTENCE
  └─ Does the artifact record exist in the database?
  └─ Pattern: PRD exists check in prd-gates.js

Level 2: STRUCTURE
  └─ Does it contain the required fields/sections for its artifact type?
  └─ Pattern: validate-sd-fields.js structural checks

Level 3: ANTI-DUMMY
  └─ Is any field a placeholder? (14 placeholder patterns from prd-quality-validation.js)
  └─ Is >75% of content boilerplate? (threshold from handoff-content-quality-validation.js)
  └─ Does it meet minimum character thresholds? (per-artifact-type minimums)

Level 4: SUBSTANCE
  └─ SD-type-specific checks (decision verbs in strategies, SMART keywords in criteria)
  └─ Only applied to blocking artifact requirements (high-risk sd_types)
```

### Hard vs Soft Requirements by sd_type

| sd_type | Gate Mode | Incomplete Artifact Behavior |
|---------|-----------|------------------------------|
| `feature` | **Blocking** | Gate fails, SD cannot enter EXEC |
| `database` | **Blocking** | Gate fails — schema changes are highest-risk |
| `security` | **Blocking** | Gate fails — security without threat model is guessing |
| `infrastructure` | **Blocking** | Gate fails — infrastructure blast radius requires planning |
| `refactor` | **Blocking** | Gate fails — refactors without regression plan cause regressions |
| `enhancement` | **Advisory** | Gate warns but passes — enhancement artifacts are recommended |
| `bugfix` | **Advisory** | Gate warns but passes — RCA/repro steps are strongly recommended |
| `documentation` | **Advisory** | Gate warns but passes — docs artifacts are lightweight |

### Gate Integration Point

The planning completeness gate fires at the **PLAN-TO-EXEC** handoff boundary, after PRD validation and before implementation begins. It:

1. Looks up the SD's `sd_type` from `strategic_directives_v2`
2. Queries the artifact registry for required artifacts (per sd_type)
3. If orchestrator child: also validates Ring 2 artifacts on the parent
4. If venture-linked: also validates Ring 1 artifacts on the venture
5. Runs the 4-level validation cascade on each required artifact
6. Returns standard gate result (`{ passed, score, maxScore, issues, warnings, details }`)
7. Gate policy (blocking vs advisory) determined by `gate-policy-resolver.js` based on sd_type

## Analysis

### Arguments For
1. **Data-backed**: The 3x gap in "within scope but not objectives met" (18.6% vs 6.0%) directly traces to insufficient planning
2. **Universal principle**: "Don't build until thinking is done" applies at every level — venture, orchestrator, and standalone
3. **Industry-validated**: Definition of Ready, SAFe Solution Intent, and TOGAF all enforce planning artifact completeness before execution
4. **Structural guarantee**: Makes planning completeness a gate rather than a guideline — durable improvement, not statistical noise
5. **Catches problems early**: The most expensive bugs are ones discovered in EXEC that should have been caught in PLAN
6. **Enables confident parallel execution**: Once all plans are validated, children can execute simultaneously

### Arguments Against
1. **Complexity**: Three rings with per-sd_type artifact matrices is a significant amount of structure to maintain
2. **Overhead for simple work**: A small bugfix SD now needs 5 artifacts before EXEC — may feel heavy
3. **Artifact quality vs existence**: The gate checks "does it exist" not "is it good" — risks checkbox compliance without real thinking
4. **Self-correcting trend**: The orchestrator gap has closed naturally in recent months

### Mitigation
- **Complexity**: sd_type already exists on every SD — the artifact matrix is a lookup, not a new classification system
- **Overhead**: Bugfix artifacts (RCA, repro steps, fix strategy) are things you should be doing anyway — the gate just enforces it
- **Quality**: Start with existence checks. If checkbox compliance emerges, add quality validation later
- **Trend**: Structural guarantees are worth having even when trends are favorable — they prevent regression

## Team Perspectives

### Challenger (Updated for Expanded Scope)
- **Blind Spots**:
  1. Three rings is ambitious — the orchestrator ring alone would have been a significant protocol change. Adding venture-level and standalone enforcement multiplies the surface area.
  2. Artifact completeness ≠ artifact quality. Bad personas pass an existence check with flying colors. The gate catches missing artifacts, not bad thinking.
  3. The bugfix artifact list (5 items) may feel like bureaucracy for a 10-line fix. Risk of routing work as quick-fixes to avoid the gate.
- **Assumptions at Risk**:
  1. That planning artifact absence is the root cause of the 18.6% gap — could also be poor goal-setting or inadequate decomposition
  2. That artifact requirements can be standardized per sd_type — some features need wireframes, others don't
- **Worst Case**: Teams produce low-quality artifacts to pass the gate. Cycle time increases. Quick-fix routing increases to avoid overhead. Net effect: more process, same outcomes.

### Visionary (Updated for Expanded Scope)
- **Opportunities**:
  1. A universal planning framework becomes the backbone of the entire LEO protocol — every SD, at every level, has a clear "Definition of Ready"
  2. Artifact registry becomes a knowledge base — past wireframes, threat models, architecture plans are discoverable and reusable across ventures
  3. EVA/HEAL integration: vision scores can validate artifact quality, creating a feedback loop that improves planning over time
- **Synergies**: Connects venture workflow (25-stage), LEO protocol (LEAD→PLAN→EXEC), EVA scoring (vision documents), HEAL loops (artifact quality), and the claim system (coherence-validated children can be safely claimed by parallel sessions)
- **Upside Scenario**: Planning completeness becomes the primary driver of SD success. Objectives-met rate across all SD types rises to 90%+. Rework drops by 50%. New ventures launch with complete thinking before the first line of code.

### Pragmatist (Updated for Expanded Scope)
- **Feasibility**: 7/10 — more complex than the original orchestrator-only gate, but the building blocks are the same
  - Database: artifact type registry (new table), gate state tracking (new columns on sd_phase_handoffs)
  - Gate logic: integrates into `unified-handoff-system.js` at PLAN-TO-EXEC boundary, parameterized by sd_type
  - Venture ring: leverages existing `eva_vision_documents` and `eva_architecture_plans` tables
- **Resource Requirements**: 1 orchestrator SD with ~5-6 children: schema, gate logic, artifact registry, per-sd_type definitions, venture integration, testing
- **Constraints**:
  1. Must not break existing in-flight SDs — gate enforces only on SDs created after the framework is active
  2. Artifact definitions need a database registry with soft requirements (recommended) vs hard requirements (blocking)
  3. Quick-fix workflow must remain exempt — QFs are explicitly lightweight
- **Recommended Path**: Ship declaration schema + existence gate as one unit. Defer cross-ring coherence validation. Test on 5+ orchestrators and 10+ standalones before making default.

### Synthesis
- **Consensus**: All perspectives agree the expanded scope is justified. The principle "don't build until thinking is done" is universal, not just an orchestrator concern.
- **Tension**: Challenger warns about bureaucracy for simple bugfixes vs. Visionary arguing that even bugfixes benefit from RCA + repro steps. Pragmatist sides with Visionary but recommends soft vs hard artifact requirements to handle this.
- **Composite Risk**: Medium-High — the concept is sound and industry-validated, but the implementation surface area is larger. Mitigate by: (1) hard requirements only for high-risk sd_types (feature, database, security), (2) soft/recommended requirements for low-risk types (bugfix, documentation), (3) quick-fix workflow exempt.

## Protocol-Specific Evaluation: Friction/Value/Risk Analysis

### Friction Reduction (Score: 9/10)
- **Current friction level**: 5/5 — SDs enter EXEC with incomplete planning across all levels. Rework, scope creep, and "within scope but not objectives met" are systemic.
- **Friction breadth**: 4/5 — Affects ALL SDs (standalone + orchestrator + venture), not just orchestrator children.

### Value Addition (Score: 9/10)
- **Direct value**: 5/5 — Addresses the root cause of the objectives-met gap at every level. Industry-validated approach.
- **Compound value**: 4/5 — Creates an artifact registry, enables EVA/HEAL integration, enables confident parallel execution, and builds institutional knowledge.

### Risk Profile (Score: 6/10)
- **Breaking change risk**: 3/5 — Must not break existing workflows. Activation gating mitigates.
- **Regression risk**: 3/5 — Larger surface area than original proposal. Soft vs hard requirements reduce risk of over-blocking.

### Decision: **(Friction 9 + Value 9) = 18 > Risk 6 * 2 = 12 → IMPLEMENT**

## Open Questions
1. **Soft vs Hard artifacts**: Which artifacts are blocking (gate fails if missing) vs recommended (warning but gate passes)? Proposal: high-risk sd_types (feature, database, security) get hard requirements; low-risk types (bugfix, docs) get soft requirements.
2. **Artifact storage**: Database records (structured, queryable) vs file references (flexible, rich content) vs hybrid?
3. **Venture ring activation**: How does the venture workflow trigger Ring 1 validation? Is it tied to the first SD created for a venture, or a separate venture-level gate?
4. **Retroactive application**: Only new SDs, or existing in-flight SDs too?
5. **Quick-fix boundary**: QFs are exempt. But what about Tier 2 QFs (31-75 LOC) — should they have lightweight artifact requirements?
6. **Artifact templates**: Should the framework provide templates for each artifact type, or just validate existence?
7. **Cross-ring coherence automation**: What machine-evaluable checks can validate that a child's artifacts are consistent with its orchestrator's architecture plan?

## Suggested Next Steps
1. **Create an SD** via `/leo create` targeting this as a protocol infrastructure improvement
2. The SD should be an orchestrator with children covering:
   - **Child A**: Database schema — artifact type registry, per-sd_type artifact definitions, gate state tracking
   - **Child B**: Gate logic — integration into unified-handoff-system.js at PLAN-TO-EXEC boundary, parameterized by sd_type
   - **Child C**: Ring 3 implementation — standalone SD artifact validation (all sd_types)
   - **Child D**: Ring 2 implementation — orchestrator-level artifact validation (cross-child checks)
   - **Child E**: Ring 1 implementation — venture-level artifact validation (integration with eva_vision_documents)
   - **Child F**: Testing, templates, and rollout — test suite, artifact templates, activation gating, documentation
3. **Priority**: High — this is a foundational protocol improvement that affects all future SD work
