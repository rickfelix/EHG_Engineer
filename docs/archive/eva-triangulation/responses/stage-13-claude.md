---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 13 "Product Roadmap" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Milestone Structure Decision](#3-milestone-structure-decision)
  - [4. Feature Prioritization Decision](#4-feature-prioritization-decision)
  - [5. Dependency Management Decision](#5-dependency-management-decision)
  - [6. Sales Model → Roadmap Alignment](#6-sales-model-roadmap-alignment)
  - [7. Kill Gate Enhancement](#7-kill-gate-enhancement)
  - [8. Phase Structure Decision](#8-phase-structure-decision)
  - [9. CLI Superiorities (preserve these)](#9-cli-superiorities-preserve-these)
  - [10. Recommended Stage 13 Schema](#10-recommended-stage-13-schema)
  - [11. Minimum Viable Change (priority-ordered)](#11-minimum-viable-change-priority-ordered)
  - [12. Cross-Stage Impact](#12-cross-stage-impact)
  - [13. Dependency Conflicts (with Stages 1-12 decisions)](#13-dependency-conflicts-with-stages-1-12-decisions)
  - [14. Contrarian Take](#14-contrarian-take)

> Independent response to the Stage 13 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Roadmap generation | N/A (not built) | None (all user-provided) | **5 Critical** | Without AI generation, users must design a product roadmap from scratch despite having 12 stages of validated data. The analysisStep is essential. | CLOSE | The LLM has sales model, pricing, GTM, brand, exit strategy -- it can propose milestones aligned to the venture's identity. |
| Feature prioritization | N/A | None (deliverables are untyped strings) | **4 High** | Without prioritization, Stage 14 architecture has no signal about what to build first. Critical path is invisible. | CLOSE | Challenge: Full RICE/MoSCoW is heavy for BLUEPRINT. But some ordering signal is needed -- even a simple P0/P1/P2 tier. |
| Sales model → roadmap alignment | N/A | None (no cross-stage consumption) | **5 Critical** | The sales_model (self-serve vs enterprise) fundamentally changes what product features matter. Without this, the roadmap is generic. | CLOSE | A self-serve roadmap needs onboarding, activation, self-service billing. An enterprise roadmap needs SSO, audit logs, admin console. The sales model IS the roadmap filter. |
| Deliverable typing | N/A | Untyped string array | **3 Medium** | Typed deliverables (feature, infrastructure, integration) enable Stage 14 to categorize architecture needs. Without typing, architecture planning is manual. | CLOSE | Challenge: At BLUEPRINT, the distinction matters. "Build payment integration" is different from "Set up CI/CD" -- one drives architecture, the other is infrastructure. |
| Resource/effort estimation | N/A | None | **2 Low** | Stage 15 (Resource Planning) handles this. Adding effort estimates here would duplicate. | DEFER | Correct to defer. Stage 13 defines WHAT and WHEN. Stage 15 defines WHO and HOW MUCH. |
| Dependency graph | N/A | Flat array per milestone | **2 Low** | At BLUEPRINT phase, milestones are sequential enough that a flat list is sufficient. Complex DAGs are execution-time. | KEEP | A simple flat array of milestone names is adequate. The phases structure already implies ordering. |
| Kill gate rigor | N/A | Count + completeness + timeline | **4 High** | Current gate only checks structure. A roadmap with 3 milestones, all trivial deliverables, and 4 months timeline would pass. | ENHANCE | Add quality checks: milestone-deliverable ratio, sales model alignment verification. |
| Phase-milestone relationship | N/A | Phases and milestones are independent | **3 Medium** | Phases have date ranges but no connection to milestones. Cannot verify that milestones fall within phase boundaries. | ADAPT | Link milestones to phases. Each milestone should reference its phase. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 1**: Problem statement, key assumptions (what problem the product solves)
- **Stage 5**: Unit economics (CAC, LTV, payback) -- constrains investment horizon
- **Stage 7**: Pricing model, value metrics (what users pay for = what product must deliver)
- **Stage 8**: BMC Key Activities, Value Propositions (what the product IS)
- **Stage 9**: Exit strategy (PE → metrics-driven features; strategic acquisition → differentiation features)
- **Stage 10**: Brand positioning (premium → polish/UX features; accessible → speed/simplicity)
- **Stage 11**: GTM channels, personas, pain_points (what user problems to solve first)
- **Stage 12**: Sales model (self-serve → onboarding/activation; enterprise → admin/security), customer journey triggers (each trigger maps to a product feature)

**Process (single LLM call)**:
1. **Vision synthesis**: Generate vision_statement from Stages 1/8/10 (problem + value prop + brand).
2. **Feature extraction**: Mine Stage 12 customer_journey triggers as feature requirements. Map Stage 11 persona pain_points to features. Map Stage 7 value metrics to must-have capabilities.
3. **Sales model filter**: Apply sales_model to prioritize features:
   - Self-serve: onboarding, self-service billing, activation metrics, product-led growth hooks
   - Inside-sales: demo environment, trial management, CRM integration
   - Enterprise: SSO, RBAC, audit logs, compliance, admin console, SLA monitoring
   - Hybrid: core product + enterprise add-on tier
   - Marketplace: supply/demand matching, trust/safety, payment escrow
   - Channel: partner portal, white-labeling, API/SDK
4. **Milestone construction**: Group features into 3-6 milestones ordered by priority.
5. **Phase mapping**: Assign milestones to 2-4 phases (e.g., Foundation → Growth → Scale).
6. **Timeline estimation**: Duration based on complexity and team assumptions from Stage 11 budget.

**Output**: Complete Stage 13 data (vision_statement, milestones with typed deliverables and priorities, phases with milestone mapping)

### 3. Milestone Structure Decision

**Enhance milestones with priority and deliverable typing.**

Current:
```javascript
{ name, date, deliverables: string[], dependencies: string[] }
```

Proposed:
```javascript
{
  name: string,
  date: string,
  phase: string,           // NEW: which phase this belongs to
  priority: enum,          // NEW: P0 (must-have) / P1 (should-have) / P2 (nice-to-have)
  deliverables: [{
    name: string,
    type: enum,            // NEW: feature / infrastructure / integration / content
    priority: enum,        // NEW: P0 / P1 / P2 (can differ from milestone priority)
  }],
  dependencies: string[],  // Keep flat (milestone names)
}
```

Why `priority` at both levels:
- **Milestone priority**: "MVP Launch" is P0, "Enterprise Tier" is P1. This drives the kill gate.
- **Deliverable priority**: Within "MVP Launch", "user auth" is P0 but "dark mode" is P2. This drives Stage 14 architecture decisions.

### 4. Feature Prioritization Decision

**Use a simple 3-tier priority (P0/P1/P2), NOT full RICE/MoSCoW.**

| Approach | Complexity | Value at BLUEPRINT |
|----------|-----------|-------------------|
| P0/P1/P2 | Low | High -- forces triage without false precision |
| MoSCoW | Medium | Medium -- "Could have" vs "Won't have" distinction isn't useful pre-build |
| RICE | High | Low -- Reach/Impact/Confidence/Effort require data we don't have |
| Weighted scoring | High | Low -- Score weights are arbitrary at this phase |

**P0** = Must ship in this milestone for the venture to be viable
**P1** = Should ship; significantly improves the milestone's value
**P2** = Nice to have; can be deferred without consequence

The analysisStep should assign priorities based on:
- Sales model requirements (SSO is P0 for enterprise, P2 for self-serve)
- Stage 7 value metrics (features that deliver the value metric are P0)
- Stage 11 persona pain points (top pain point → P0 feature)

### 5. Dependency Management Decision

**Keep flat dependency array. Not worth a DAG at BLUEPRINT.**

Rationale:
- At BLUEPRINT phase, milestones are typically sequential (Foundation → Growth → Scale).
- A directed acyclic graph adds complexity for modeling something that's inherently speculative.
- The `phases` structure already implies ordering.
- Real dependency tracking belongs in project management tools during THE BUILD LOOP (Stages 17-22).

The flat array is sufficient: `dependencies: ["MVP Launch"]` means this milestone can't start until MVP Launch is complete.

### 6. Sales Model → Roadmap Alignment

**The sales_model is the most important roadmap filter.** Each model implies a distinct feature set:

| Sales Model | P0 Features | P1 Features | Architecture Implication |
|-------------|-------------|-------------|------------------------|
| self-serve | Onboarding flow, self-service billing, activation metrics | Usage analytics, in-app help, referral system | Product-led, low-latency, scalable frontend |
| inside-sales | Demo environment, trial management, lead scoring | CRM integration, email sequences, proposals | Demo-optimized, data export, integrations |
| enterprise | SSO/SAML, RBAC, audit logs, admin console | SLA monitoring, compliance reports, custom integrations | Multi-tenant, security-first, API-heavy |
| hybrid | Core product (self-serve) + enterprise add-ons | Tiered access control, usage-based billing | Modular architecture, feature flags |
| marketplace | Supply/demand matching, trust & safety, escrow | Reviews/ratings, dispute resolution, analytics | Two-sided, high-availability, payment processing |
| channel | Partner portal, white-labeling, API/SDK | Revenue sharing dashboard, partner analytics | Multi-tenant, theming, extensible API |

The analysisStep should:
1. Read `sales_model` from Stage 12
2. Apply the corresponding P0 feature template
3. Cross-reference with Stage 11 persona pain_points (are pain points addressed by P0 features?)
4. Flag misalignment (e.g., self-serve model but roadmap has no onboarding milestone)

### 7. Kill Gate Enhancement

**Current gate is necessary but insufficient.** It checks structure but not substance.

Current checks (preserve):
- ≥ 3 milestones
- Each milestone has deliverables
- Timeline ≥ 3 months

Proposed additions:
1. **P0 coverage check**: At least one P0 milestone must exist. A roadmap with only P1/P2 milestones has no critical path.
2. **Sales model alignment**: At least one deliverable must address the sales_model's P0 feature category. A "self-serve" venture with no onboarding deliverable should trigger a warning (not a hard kill).
3. **Vision-deliverable coherence**: Vision statement keywords should appear in at least one deliverable (fuzzy match). A vision about "democratizing X" with deliverables about "enterprise compliance" is incoherent.
4. **Minimum deliverables**: Total deliverables across all milestones ≥ 8 (prevents trivial roadmaps).

Gate logic: Keep hard kills for structural issues (count, completeness, timeline). Add **warnings** for quality issues (alignment, coherence, deliverable count) that don't block but are surfaced.

### 8. Phase Structure Decision

**Link phases to milestones. Make phases the grouping mechanism.**

Current: phases and milestones are independent lists with no relationship.

Proposed: Each milestone references a `phase` by name. Phases become the organizational layer:

```
Phase: "Foundation" (months 1-3)
  ├── Milestone: "Core MVP" (P0)
  └── Milestone: "Auth & Billing" (P0)

Phase: "Growth" (months 4-6)
  ├── Milestone: "Analytics Dashboard" (P1)
  └── Milestone: "Integration Marketplace" (P1)

Phase: "Scale" (months 7-12)
  └── Milestone: "Enterprise Tier" (P2)
```

This provides:
- Clear temporal grouping
- Phase-level resource allocation (Stage 15 can plan per phase)
- Milestone sequencing within phases
- Phase boundaries as natural review points

### 9. CLI Superiorities (preserve these)

- **Deterministic kill gate**: `evaluateKillGate()` is a pure exported function. Testable, predictable.
- **Clean separation of milestones and phases**: Better than a single flat list.
- **Date-based timeline computation**: Derived, not user-entered.
- **Deliverables per milestone**: Granular tracking of what each milestone produces.
- **Dependencies as milestone references**: Simple, sufficient for BLUEPRINT.
- **Exported constants**: `MIN_MILESTONES`, `MIN_TIMELINE_MONTHS`, `MIN_DELIVERABLES_PER_MILESTONE` enable cross-stage validation.

### 10. Recommended Stage 13 Schema

```javascript
const TEMPLATE = {
  id: 'stage-13',
  slug: 'product-roadmap',
  title: 'Product Roadmap',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    vision_statement: { type: 'string', minLength: 20, required: true },

    // === Updated: milestones with priority, phase, typed deliverables ===
    milestones: {
      type: 'array', minItems: 3,
      items: {
        name: { type: 'string', required: true },
        date: { type: 'string', required: true },
        phase: { type: 'string' },  // NEW: references phases[].name
        priority: { type: 'enum', values: ['P0', 'P1', 'P2'] },  // NEW
        deliverables: {
          type: 'array', minItems: 1,
          items: {
            name: { type: 'string', required: true },
            type: { type: 'enum', values: ['feature', 'infrastructure', 'integration', 'content'] },  // NEW
            priority: { type: 'enum', values: ['P0', 'P1', 'P2'] },  // NEW
          },
        },
        dependencies: { type: 'array' },  // Keep flat
      },
    },

    // === Existing (unchanged) ===
    phases: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        start_date: { type: 'string', required: true },
        end_date: { type: 'string', required: true },
      },
    },

    // === Existing derived (enhanced) ===
    timeline_months: { type: 'number', derived: true },
    milestone_count: { type: 'number', derived: true },
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
    warnings: { type: 'array', derived: true },  // NEW: quality warnings (non-blocking)

    // === NEW: Provenance ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 11. Minimum Viable Change (priority-ordered)

1. **P0: Add `analysisStep` for roadmap generation**. Single LLM call consuming Stages 1-12. Produces vision_statement, milestones with typed deliverables, phases. Sales model drives feature selection.

2. **P0: Wire sales_model → feature prioritization**. Stage 12 sales_model determines which features are P0. This is the most impactful cross-stage connection.

3. **P1: Add `priority` (P0/P1/P2) to milestones and deliverables**. Simple 3-tier system. Enables kill gate enhancement and Stage 14 architecture prioritization.

4. **P1: Add `type` enum to deliverables**. feature/infrastructure/integration/content. Enables Stage 14 to categorize architecture needs.

5. **P1: Add `phase` reference to milestones**. Links milestones to phases for grouping.

6. **P2: Enhance kill gate with quality warnings**. P0 coverage check, sales model alignment, vision coherence. Warnings only (not hard kills).

7. **P3: Do NOT add resource/effort estimates**. Stage 15 (Resource Planning) handles this.
8. **P3: Do NOT add dependency DAG**. Flat array is sufficient at BLUEPRINT.
9. **P3: Do NOT add full RICE/MoSCoW scoring**. P0/P1/P2 is the right level of precision.

### 12. Cross-Stage Impact

| Change | Stage 14 (Technical Architecture) | Stage 15 (Resource Planning) | Stage 16 (Financial Projections) |
|--------|----------------------------------|----------------------------|---------------------------------|
| Typed deliverables | Architecture decisions map directly to deliverable types. Features → application architecture. Infrastructure → DevOps. Integrations → API design. | Resource allocation per deliverable type. Infrastructure needs different skills than features. | Cost estimation per deliverable type (infrastructure = hosting, features = engineering). |
| Priority (P0/P1/P2) | Architecture must support P0 deliverables first. Design for what matters most. | Resource allocation follows priority. P0 gets full team; P2 can wait. | Financial projections weighted by priority. P0 costs are committed; P2 is optional. |
| Sales model alignment | Architecture aligned to sales model (self-serve → scalable frontend; enterprise → security-first). | Team composition matches sales model (self-serve → more engineers; enterprise → more sales engineers). | Revenue model tied to sales model (self-serve → volume; enterprise → high-ACV). |
| Phase structure | Architecture can be phased (Foundation arch → Growth arch → Scale arch). | Resource ramp-up follows phases. Phase 1 = small team; Phase 3 = full team. | Financial projections per phase (burn rate changes with phase). |

### 13. Dependency Conflicts (with Stages 1-12 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 12 → 13 (sales_model for feature filtering) | **OK** | Stage 12 sales_model is a clean enum, directly consumable. |
| Stage 11 → 13 (persona pain_points for features) | **OK** | Stage 11 consensus added pain_points to tiers. Available for feature extraction. |
| Stage 7 → 13 (value metrics for must-have features) | **OK** | Stage 7 has pricing model and value metrics. |
| Stage 12 → 13 (customer_journey triggers) | **OK** | Stage 12 consensus added triggers to journey steps. Each trigger is a potential feature requirement. |
| Stage 5 → 13 (unit economics for timeline) | **OK** | Payback period from Stage 5 constrains how long the roadmap can be before revenue. |

**One potential issue**: Stage 12 Economy Check validates that funnel math works. If Stage 13's roadmap timeline exceeds the payback period from Stage 5, there's a coherence issue. But this is Stage 15/16's concern (resource costs vs financial projections), not a Stage 13 dependency conflict.

### 14. Contrarian Take

**Arguing AGAINST typed deliverables and priority tiers:**

1. **False precision at BLUEPRINT.** We're asking ventures to classify features as P0/P1/P2 before they've built anything. The act of classification creates premature commitment. A deliverable classified as P2 might turn out to be the breakthrough feature. At BLUEPRINT, everything is speculation.

2. **Typing deliverables is categorization theater.** Is "payment processing" a feature or an integration? Is "API documentation" content or infrastructure? The boundaries are fuzzy. Forcing a type adds cognitive load without clear analytical benefit. Stage 14 (Architecture) can infer categories from deliverable descriptions.

3. **The analysisStep will dominate.** If the LLM generates the roadmap, it will assign priorities and types. Users will accept the defaults. The fields exist but add no human insight. We're building schema for the LLM to fill, not for humans to think about.

4. **What could go wrong**: Ventures spend time debating whether a deliverable is P0 or P1, or feature vs infrastructure, instead of focusing on whether the roadmap makes strategic sense. The classification becomes the discussion, not the substance.

**Counter-argument**: Without ANY prioritization, Stage 14 has no signal about what to architect first. Without typing, Stage 15 can't estimate resources by category. Even imperfect classification is better than treating all deliverables as equal.

**Verdict**: Keep priority (essential for downstream) but consider dropping deliverable `type` to optional-only. Let the analysisStep suggest types, but don't validate their presence.
