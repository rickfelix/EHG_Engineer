---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# 25-Stage Venture Lifecycle Overview



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Visual Overview](#visual-overview)
- [The 6 Phases](#the-6-phases)
  - [Phase 1: THE TRUTH (Stages 1-5)](#phase-1-the-truth-stages-1-5)
  - [Phase 2: THE ENGINE (Stages 6-9)](#phase-2-the-engine-stages-6-9)
  - [Phase 3: THE IDENTITY (Stages 10-12)](#phase-3-the-identity-stages-10-12)
  - [Phase 4: THE BLUEPRINT (Stages 13-17)](#phase-4-the-blueprint-stages-13-16)
  - [Phase 5: THE BUILD LOOP (Stages 18-23)](#phase-5-the-build-loop-stages-17-22)
  - [Phase 6: LAUNCH & LEARN (Stages 24-26)](#phase-6-launch-learn-stages-23-25)
- [Phase 7: THE ORBIT (Post-Stage 25)](#phase-7-the-orbit-post-stage-25)
- [Key Mechanisms](#key-mechanisms)
  - [1. Work Types](#1-work-types)
  - [2. Advisory Checkpoints](#2-advisory-checkpoints)
  - [3. Golden Nuggets](#3-golden-nuggets)
  - [4. Token Budget Profiles](#4-token-budget-profiles)
- [Stage Dependencies](#stage-dependencies)
- [Artifacts by Phase](#artifacts-by-phase)
- [Integration with LEO Protocol](#integration-with-leo-protocol)
- [Evolution from 40-Stage Model](#evolution-from-40-stage-model)
- [Quick Reference Card](#quick-reference-card)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-19
- **Tags**: api, unit, schema, security

**Version**: 2.1 (Venture Vision v2.0 -- Implementation Aligned)
**Status**: Active
**Last Updated**: 2026-03-05
**Technical Reference**: [`stages_v2.yaml`](./stages_v2.yaml)

> **Implementation Alignment Note** (2026-03-05): Stage titles in this document have been updated to reflect the **actual codebase implementation** (`lib/eva/stage-templates/stage-XX.js`). Phase 5 spans stages 17-22 and Phase 6 spans stages 23-25 in the implementation (the original design spec had Phase 5: 17-20 and Phase 6: 21-25).

---

## Executive Summary

The 25-Stage Venture Lifecycle is EHG's structured framework for taking a venture idea from initial concept to optimized, scaling product. It consolidates the original 40-stage model into a streamlined 25-stage workflow organized into 6 phases, each with a distinct purpose.

**Design Philosophy**:
- **Solo AI Entrepreneur**: Optimized for AI-assisted venture development
- **Phase-Gated Progression**: Clear boundaries prevent premature advancement
- **Decision Gates**: Explicit kill/revise/proceed checkpoints
- **Artifact-Driven**: Every stage produces measurable outputs

---

## Visual Overview

```
+---------------------------------------------------------------------------+
|                        25-STAGE VENTURE LIFECYCLE                           |
+---------------------------------------------------------------------------+
|                                                                             |
|   PHASE 1              PHASE 2           PHASE 3          PHASE 4          |
|   THE TRUTH            THE ENGINE        THE IDENTITY     THE BLUEPRINT    |
|   +---------+          +---------+       +---------+      +---------+      |
|   | 1  2  3 | -------+ | 6  7  8 | ----+|10 11 12| ---+ |13 14 15|      |
|   | 4  5    |          | 9       |       |         |      |16       |      |
|   +---------+          +---------+       +---------+      +---------+      |
|        |                                                        |           |
|        v                                                        v           |
|   [Kill Gate]                                            [Schema Gate]      |
|                                                                             |
|                        PHASE 5                    PHASE 6                   |
|                        THE BUILD LOOP             LAUNCH & LEARN            |
|                        +-------------+            +-------------+           |
|                        |17 18 19 20  | --------+  |23 24        |           |
|                        |21 22        |            |25           |           |
|                        +-------------+            +-------------+           |
|                                                         |                   |
|                                                         v                   |
|                                                   [LIVE PRODUCT]            |
|                                                         |                   |
|                                                         v                   |
|                                              +------------------+           |
|                                              |   PHASE 7        |           |
|                                              |   THE ORBIT      |           |
|                                              | (Active Ops)     |           |
|                                              +------------------+           |
+---------------------------------------------------------------------------+
```

---

## The 6 Phases

### Phase 1: THE TRUTH (Stages 1-5)
**Purpose**: Validate the idea before investing significant resources.

> "Is this idea worth pursuing? Does the market want it? Can we make money?"

| Stage | Implementation Title | Purpose | Key Output |
|-------|---------------------|---------|------------|
| 1 | Idea Capture | Capture and validate initial venture idea | Structured idea document |
| 2 | Idea Analysis | Multi-agent review from different perspectives | Critique report, risk assessment |
| 3 | **Kill Gate** | Validate problem-solution fit and WTP | Validation report (score >= 6 to proceed) |
| 4 | Competitive Landscape | Analyze competitive landscape | Competitive analysis, gap identification |
| 5 | **Kill Gate (Financial)** | Financial modeling and unit economics | Financial model, ROI projections |

**Decision Gates**: Stage 3 and Stage 5 are **kill gates** where ventures can be killed, revised, or rejected.

**Key Metrics**:
- Validation score (1-10)
- Gross margin target (40%+)
- CAC:LTV ratio (1:3+)
- Breakeven months (<18)

---

### Phase 2: THE ENGINE (Stages 6-9)
**Purpose**: Build the business model foundation.

> "How will this venture make money and sustain itself?"

| Stage | Implementation Title | Purpose | Key Output |
|-------|---------------------|---------|------------|
| 6 | Risk Assessment | Identify and mitigate risks | Risk matrix, mitigation strategies |
| 7 | Revenue Architecture | Develop pricing model and tiers | Revenue model, pricing tiers |
| 8 | Business Model Canvas | Complete BMC documentation | Business Model Canvas |
| 9 | Exit Strategy | Plan for eventual exit | Exit strategy, valuation targets |

**Key Insight**: Even early-stage ventures should design for exit. This prevents architectural decisions that make acquisition difficult later.

---

### Phase 3: THE IDENTITY (Stages 10-12)
**Purpose**: Establish brand, positioning, and go-to-market strategy.

> "Who are we? How do we reach customers?"

| Stage | Implementation Title | Purpose | Key Output |
|-------|---------------------|---------|------------|
| 10 | **Customer & Brand Foundation** | Customer personas + brand genome + Chairman gate | Customer personas, brand genome, naming candidates |
| 11 | Naming & Visual Identity | Visual identity system and cultural design style | Brand name, visual identity specs |
| 12 | GTM & Sales Strategy | Go-to-market and sales playbook | GTM plan, sales playbook |

**Cultural Design Styles** (configured in Stage 10 via brand genome):
- **Wabi-sabi (Japanese)**: Organic, imperfect, natural - for wellness, artisanal, sustainability
- **Swiss Minimal**: Grid precision, trust, legibility - for fintech, enterprise B2B, healthcare
- **Bauhaus**: Form follows function, geometric - for architecture, manufacturing, design tools
- **California Modern**: Optimistic, warm, approachable - for consumer apps, SaaS, startups

---

### Phase 4: THE BLUEPRINT (Stages 13-17)
**Purpose**: Product planning and financial validation before build.

> "What's the roadmap? What are the risks? Can we afford to build?"

| Stage | Implementation Title | Purpose | Key Output |
|-------|---------------------|---------|------------|
| 13 | **Product Roadmap** | Roadmap with milestones, dependencies, timeline | Product roadmap, milestone plan |
| 14 | Technical Architecture | Architecture layers, security, data entities | Architecture spec, integration points |
| 15 | Risk Register | Risk identification, severity, mitigation | Risk register with mitigation plans |
| 16 | **Financial Projections** | Revenue/cost projections, runway, break-even | Financial model, runway calculation |

**Kill Gate**: Stage 13 enforces roadmap completeness (minimum 3 milestones, at least one `priority: now`).
**Promotion Gate**: Stage 16 is the **Phase 4->5 Promotion Gate** -- positive runway and defined projections required before build begins.

---

### Phase 5: THE BUILD LOOP (Stages 18-23)
**Purpose**: Implementation and development.

> "Plan the build, execute it, review it, and confirm it's ready to ship."

| Stage | Implementation Title | Purpose | Key Output |
|-------|---------------------|---------|------------|
| 17 | Pre-Build Checklist | Validate environment and dependencies are ready | Pre-build checklist artifact |
| 18 | Sprint Planning | Sprint plan with stories, capacity, acceptance criteria | Sprint plan artifact |
| 19 | Build Execution | Core build with feature implementation and integrations | Build execution record |
| 20 | Quality Assurance | QA including security, performance, and accessibility | QA report, security audit |
| 21 | Build Review | Integration testing and acceptance verification | Build review report |
| 22 | **Release Readiness** | Final release gate before launch | Release readiness checklist |

**Promotion Gate**: Stage 22 is the **Phase 5->6 Promotion Gate** -- all pre-launch checks must pass before entering Launch & Learn.

---

### Phase 6: LAUNCH & LEARN (Stages 24-26)
**Purpose**: Prepare, launch, and go live.

> "Get marketing ready, confirm you're ready to launch, and execute."

| Stage | Implementation Title | Purpose | Key Output |
|-------|---------------------|---------|------------|
| 23 | Marketing Preparation | Pre-launch marketing assets and channel readiness | Marketing assets, channel plan |
| 24 | Launch Readiness | Launch readiness score and distribution channel activation | Launch readiness score |
| 25 | **Launch Execution** | Go-live execution, channel activation, operations handoff | Live product, `pipeline_mode: 'operations'` |

**Authorization Gate**: Stage 25 calls `verifyLaunchAuthorization()` before activating distribution channels and transitioning the venture to operations mode.

---

## Phase 7: THE ORBIT (Post-Stage 25)

After Stage 25, ventures that don't immediately exit enter **The Orbit** - a continuous operational phase.

See: [Phase 7 Orbit Verification](./phase7-orbit-verification.md)

**Key Concepts**:
- Feature expansion through market feedback
- Recurring stages 15-21 for continuous iteration
- Explicit expansion vs. exit decision criteria
- Sunset score algorithm for ventures that should exit

---

## Key Mechanisms

### 1. Work Types

Each stage has a `work_type` that determines how work is tracked:

| Work Type | Description | SD Required? |
|-----------|-------------|--------------|
| `artifact_only` | Produces artifacts, no formal SD | No |
| `automated_check` | AI-driven automated validation | No |
| `decision_gate` | Requires Chairman decision | Sometimes |
| `sd_required` | Requires Strategic Directive | Yes |

### 2. Advisory Checkpoints

Six stages have **gates** where the venture must pass criteria before advancing:

| Stage | Implementation Title | Gate Type | Trigger |
|-------|---------------------|-----------|---------|
| 3 | Kill Gate | Kill Gate | validation_score < 6 |
| 5 | Kill Gate (Financial) | Kill Gate | gross_margin < threshold OR breakeven_months > threshold |
| 13 | Product Roadmap | Kill Gate | milestones < 3 OR no `priority: now` milestone |
| 16 | Financial Projections | Promotion Gate (Phase 4->5) | runway <= 0 OR projections incomplete |
| 22 | Release Readiness | Promotion Gate (Phase 5->6) | release_checklist incomplete |
| 25 | Launch Execution | Authorization Gate | `verifyLaunchAuthorization()` fails |

### 3. Golden Nuggets

Advanced mechanisms integrated into the lifecycle:

| Nugget | Purpose | Stages Involved |
|--------|---------|-----------------|
| **Assumptions vs Reality** | Track assumptions and compare to actual outcomes | 2, 3, 5, 23, 24, 25 |
| **Token Budget Profiles** | Treat compute as capital with explicit budgets | 5 (profile selection) |
| **Four Buckets** | Classify all outputs (Facts/Assumptions/Simulations/Unknowns) | 3, 5, 16 (epistemic gates) |
| **Crew Tournament** | Multi-agent competition for Stage 11 brand messaging | 11 (pilot) |

### 4. Token Budget Profiles

Ventures are assigned a compute budget profile:

| Profile | Total Tokens | Use Case |
|---------|--------------|----------|
| Exploratory | 75,000 | Quick validation, kill fast |
| Standard | 375,000 | Normal venture progression |
| Deep Due Diligence | 1,500,000 | High-stakes, complex markets |
| Custom | Variable | Chairman override |

**Standard Profile Allocation**:
- THE TRUTH: 25%
- THE ENGINE: 15%
- THE IDENTITY: 10%
- THE BLUEPRINT: 20%
- THE BUILD LOOP: 20%
- LAUNCH & LEARN: 10%

---

## Stage Dependencies

```
Stage 1 -> Stage 2 -> Stage 3 -> Stage 4 -> Stage 5
                                              |
                                              v
          Stage 9 <- Stage 8 <- Stage 7 <- Stage 6
              |
              v
         Stage 10 -> Stage 11 -> Stage 12
                                     |
                                     v
         Stage 16 <- Stage 15 <- Stage 14 <- Stage 13
              |
              v
         Stage 17 -> Stage 18 -> Stage 19 -> Stage 20
                                                  |
                                                  v
         Stage 25 <- Stage 24 <- Stage 23 <- Stage 22 <- Stage 21
```

---

## Artifacts by Phase

> Artifact types follow the `{phase_prefix}_{descriptive_name}` naming convention.
> Single source of truth: `lib/eva/artifact-types.js` (SD-LEO-INFRA-EVA-ARTIFACT-NAMING-001).

### Stage 0: Intake
- `intake_venture_analysis`

### Phase 1: THE TRUTH (Stages 1-5)
- `truth_idea_brief`
- `truth_ai_critique`
- `truth_validation_decision`
- `truth_competitive_analysis`
- `truth_financial_model`
- `truth_problem_statement`
- `truth_target_market_analysis`
- `truth_value_proposition`

### Phase 2: THE ENGINE (Stages 6-9)
- `engine_risk_matrix`
- `engine_pricing_model`
- `engine_business_model_canvas`
- `engine_exit_strategy`
- `engine_risk_assessment`
- `engine_revenue_model`

### Phase 3: THE IDENTITY (Stages 10-12)
- `identity_persona_brand`
- `identity_brand_guidelines`
- `identity_naming_visual`
- `identity_brand_name`
- `identity_gtm_sales_strategy`

### Phase 4: THE BLUEPRINT (Stages 13-17)
- `blueprint_product_roadmap`
- `blueprint_technical_architecture`
- `blueprint_data_model`
- `blueprint_erd_diagram`
- `blueprint_api_contract`
- `blueprint_schema_spec`
- `blueprint_risk_register`
- `blueprint_user_story_pack`
- `blueprint_wireframes`
- `blueprint_financial_projection`
- `blueprint_launch_readiness`
- `blueprint_sprint_plan`
- `blueprint_promotion_gate`
- `blueprint_project_plan`

### Phase 5: THE BUILD (Stages 17-20)
- `build_system_prompt`
- `build_cicd_config`
- `build_security_audit`
- `build_mvp_build`
- `build_test_coverage_report`

### Phase 6: LAUNCH & LEARN (Stages 21-25)
- `launch_test_plan`
- `launch_uat_report`
- `launch_deployment_runbook`
- `launch_marketing_checklist`
- `launch_analytics_dashboard`
- `launch_health_scoring`
- `launch_churn_triggers`
- `launch_retention_playbook`
- `launch_optimization_roadmap`
- `launch_assumptions_vs_reality`
- `launch_launch_metrics`
- `launch_user_feedback_summary`
- `launch_production_app`

### Cross-cutting
- `system_devils_advocate_review`

---

## Integration with LEO Protocol

The 25-stage lifecycle integrates with the LEO Protocol governance system:

1. **SDs for Implementation**: Stages marked `sd_required: true` require Strategic Directives
2. **Phase Boundary Gates**: Risk re-calibration at phase transitions (see [Risk Re-calibration Protocol](../../04_features/risk-recalibration-protocol.md))
3. **Capability Sharing**: Secondary outputs feed the Capability Library (see [Capability Router Protocol](../../04_features/capability-router-protocol.md))
4. **Compliance Gate**: Stage 20 includes security/compliance certification (see [Stage 20 Compliance Gate](../../04_features/stage20-compliance-gate.md))

---

## Evolution from 40-Stage Model

The 25-stage model consolidates the original 40-stage workflow:

| 40-Stage Concern | 25-Stage Approach |
|------------------|-------------------|
| Stage 32-36: Customer Success | Integrated into Stage 24 + SD-LIFECYCLE-GAP-001 |
| Stage 37: Strategic Risk | Phase boundary gates + SD-LIFECYCLE-GAP-005 |
| Stage 39: Multi-Venture Coord | Capability Router Protocol + SD-LIFECYCLE-GAP-004 |
| Security Certification | Stage 20 Compliance Gate + SD-LIFECYCLE-GAP-002 |
| Active Operations | Phase 7: The Orbit + SD-LIFECYCLE-GAP-003 |

See: [Venture Lifecycle Gap Remediation Overview](../../04_features/venture-lifecycle-gap-remediation-overview.md)

---

## Quick Reference Card

```
+---------------------------------------------------------------+
|                 25-STAGE QUICK REFERENCE                      |
+---------------------------------------------------------------+
| Phase 1: THE TRUTH (1-5)       -> Validate idea                |
| Phase 2: THE ENGINE (6-9)      -> Build business model         |
| Phase 3: THE IDENTITY (10-12)  -> Brand and GTM                |
| Phase 4: THE BLUEPRINT (13-17) -> Roadmap, architecture, risk  |
| Phase 5: THE BUILD LOOP (18-23)-> Plan, build, review, release |
| Phase 6: LAUNCH & LEARN (24-26)-> Prepare, launch, go live     |
+---------------------------------------------------------------+
| Kill Gates: Stage 3 (validation), Stage 5 (financial),        |
|             Stage 13 (roadmap)                                |
| Promotion Gates: Stage 16 (Phase 4->5), Stage 22 (Phase 5->6)  |
| Authorization Gate: Stage 25 (go-live)                        |
+---------------------------------------------------------------+
| Token Budgets: Exploratory (75K) | Standard (375K) | Deep (1.5M)|
+---------------------------------------------------------------+
| Technical Reference: docs/guides/workflow/stages_v2.yaml      |
| Code Reference: lib/eva/stage-templates/stage-XX.js           |
+---------------------------------------------------------------+
```

---

## Related Documentation

- **Technical Configuration**: [`stages_v2.yaml`](./stages_v2.yaml) - Complete stage definitions
- **Phase 7**: [`phase7-orbit-verification.md`](./phase7-orbit-verification.md) - Post-Stage 25 operations
- **Lifecycle Gap Remediation**: [`venture-lifecycle-gap-remediation-overview.md`](../../04_features/venture-lifecycle-gap-remediation-overview.md)
- **Risk Re-calibration**: [`risk-recalibration-protocol.md`](../../04_features/risk-recalibration-protocol.md)
- **Capability Router**: [`capability-router-protocol.md`](../../04_features/capability-router-protocol.md)
- **Stage 20 Compliance**: [`stage20-compliance-gate.md`](../../04_features/stage20-compliance-gate.md)

---

**Document Status**: ACTIVE
**Owner**: EHG Engineering
**Maintainer**: LEO Protocol Team
