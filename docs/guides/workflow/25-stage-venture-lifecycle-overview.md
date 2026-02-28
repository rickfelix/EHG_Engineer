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
  - [Phase 4: THE BLUEPRINT (Stages 13-16)](#phase-4-the-blueprint-stages-13-16)
  - [Phase 5: THE BUILD LOOP (Stages 17-20)](#phase-5-the-build-loop-stages-17-20)
  - [Phase 6: LAUNCH & LEARN (Stages 21-25)](#phase-6-launch-learn-stages-21-25)
- [Phase 7: THE ORBIT (Post-Stage 25)](#phase-7-the-orbit-post-stage-25)
- [Key Mechanisms](#key-mechanisms)
  - [1. Work Types](#1-work-types)
  - [2. Advisory Checkpoints](#2-advisory-checkpoints)
  - [3. Golden Nuggets](#3-golden-nuggets)
  - [4. Token Budget Profiles](#4-token-budget-profiles)
- [Stage Dependencies](#stage-dependencies)
- [Artifacts by Phase](#artifacts-by-phase)
  - [Phase 1: THE TRUTH](#phase-1-the-truth)
  - [Phase 2: THE ENGINE](#phase-2-the-engine)
  - [Phase 3: THE IDENTITY](#phase-3-the-identity)
  - [Phase 4: THE BLUEPRINT](#phase-4-the-blueprint)
  - [Phase 5: THE BUILD LOOP](#phase-5-the-build-loop)
  - [Phase 6: LAUNCH & LEARN](#phase-6-launch-learn)
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

**Version**: 2.0 (Venture Vision v2.0)
**Status**: Active
**Last Updated**: 2026-01-18
**Technical Reference**: [`stages_v2.yaml`](./stages_v2.yaml)

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
┌─────────────────────────────────────────────────────────────────────────────┐
│                        25-STAGE VENTURE LIFECYCLE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PHASE 1              PHASE 2           PHASE 3          PHASE 4          │
│   THE TRUTH            THE ENGINE        THE IDENTITY     THE BLUEPRINT    │
│   ┌─────────┐          ┌─────────┐       ┌─────────┐      ┌─────────┐      │
│   │ 1  2  3 │ ───────► │ 6  7  8 │ ────► │10 11 12│ ───► │13 14 15│      │
│   │ 4  5    │          │ 9       │       │         │      │16       │      │
│   └─────────┘          └─────────┘       └─────────┘      └─────────┘      │
│        │                                                        │           │
│        ▼                                                        ▼           │
│   [Kill Gate]                                            [Schema Gate]      │
│                                                                             │
│                        PHASE 5                    PHASE 6                   │
│                        THE BUILD LOOP             LAUNCH & LEARN            │
│                        ┌─────────────┐            ┌─────────────┐           │
│                        │17 18 19 20  │ ────────►  │21 22 23 24  │           │
│                        │             │            │25           │           │
│                        └─────────────┘            └─────────────┘           │
│                                                         │                   │
│                                                         ▼                   │
│                                                   [LIVE PRODUCT]            │
│                                                         │                   │
│                                                         ▼                   │
│                                              ┌──────────────────┐           │
│                                              │   PHASE 7        │           │
│                                              │   THE ORBIT      │           │
│                                              │ (Active Ops)     │           │
│                                              └──────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The 6 Phases

### Phase 1: THE TRUTH (Stages 1-5)
**Purpose**: Validate the idea before investing significant resources.

> "Is this idea worth pursuing? Does the market want it? Can we make money?"

| Stage | Title | Purpose | Key Output |
|-------|-------|---------|------------|
| 1 | Draft Idea & Chairman Review | Capture and validate initial idea | Structured idea document |
| 2 | AI Multi-Model Critique | Multi-agent review from different perspectives | Critique report, risk assessment |
| 3 | Market Validation & RAT | Validate problem-solution fit and WTP | Validation report (score >= 6 to proceed) |
| 4 | Competitive Intelligence | Analyze competitive landscape | Competitive analysis, gap identification |
| 5 | Profitability Forecasting | Financial modeling and unit economics | Financial model, ROI projections |

**Decision Gate**: Stage 3 is a **kill gate**. If validation score < 6, the venture can be killed, revised, or rejected.

**Key Metrics**:
- Validation score (1-10)
- Gross margin target (40%+)
- CAC:LTV ratio (1:3+)
- Breakeven months (<18)

---

### Phase 2: THE ENGINE (Stages 6-9)
**Purpose**: Build the business model foundation.

> "How will this venture make money and sustain itself?"

| Stage | Title | Purpose | Key Output |
|-------|-------|---------|------------|
| 6 | Risk Evaluation Matrix | Identify and mitigate risks | Risk matrix, mitigation strategies |
| 7 | Pricing Strategy | Develop pricing model and tiers | Pricing model, discount policies |
| 8 | Business Model Canvas | Complete BMC documentation | Business Model Canvas |
| 9 | Exit-Oriented Design | Plan for eventual exit | Exit strategy, valuation targets |

**Key Insight**: Even early-stage ventures should design for exit. This prevents architectural decisions that make acquisition difficult later.

---

### Phase 3: THE IDENTITY (Stages 10-12)
**Purpose**: Establish brand, positioning, and go-to-market strategy.

> "Who are we? How do we reach customers?"

| Stage | Title | Purpose | Key Output |
|-------|-------|---------|------------|
| 10 | Strategic Naming | Brand naming and visual identity | Brand name, guidelines, cultural design style |
| 11 | Go-to-Market Strategy | Marketing strategy and channels | GTM plan, marketing manifest |
| 12 | Sales & Success Logic | Sales process and customer success | Sales playbook, success workflows |

**Cultural Design Styles** (selected at Stage 10):
- **Wabi-sabi (Japanese)**: Organic, imperfect, natural - for wellness, artisanal, sustainability
- **Swiss Minimal**: Grid precision, trust, legibility - for fintech, enterprise B2B, healthcare
- **Bauhaus**: Form follows function, geometric - for architecture, manufacturing, design tools
- **California Modern**: Optimistic, warm, approachable - for consumer apps, SaaS, startups

---

### Phase 4: THE BLUEPRINT (Stages 13-16)
**Purpose**: Technical architecture and specification before implementation.

> "What exactly are we building? What's the schema?"

| Stage | Title | Purpose | Key Output |
|-------|-------|---------|------------|
| 13 | Tech Stack Interrogation | Challenge and validate tech choices | Tech stack decision, trade-off analysis |
| 14 | Data Model & Architecture | Entity relationships and schema | Data model, ERD diagrams |
| 15 | Epic & User Story Breakdown | Feature decomposition | User story pack, acceptance criteria |
| 16 | Spec-Driven Schema Generation | Generate TypeScript, SQL, API contracts | TypeScript interfaces, SQL schemas, API contracts |

**Schema Firewall**: Stage 16 is a critical gate. Before implementation begins:
- All entities must be named
- All relationships must be explicit
- All fields must be typed
- All constraints must be stated
- API contracts must be generated

---

### Phase 5: THE BUILD LOOP (Stages 17-20)
**Purpose**: Implementation and development.

> "Build the product according to the blueprint."

| Stage | Title | Purpose | Key Output |
|-------|-------|---------|------------|
| 17 | Environment & Agent Config | Dev environment, CI/CD setup | Environment setup, system prompts |
| 18 | MVP Development Loop | Core feature implementation | Working code, feature implementations |
| 19 | Integration & API Layer | System integration, third-party connections | Integrated system, API endpoints |
| 20 | Security & Performance | Hardening, optimization, accessibility | Hardened system, security audit |

**All stages require Strategic Directives (SDs)**: Implementation work is tracked through the LEO Protocol governance system.

---

### Phase 6: LAUNCH & LEARN (Stages 21-25)
**Purpose**: Deploy, measure, and optimize.

> "Ship it, learn from users, and improve."

| Stage | Title | Purpose | Key Output |
|-------|-------|---------|------------|
| 21 | QA & UAT | Quality assurance and user acceptance | Test reports, UAT signoff |
| 22 | Deployment & Infrastructure | Production deployment, monitoring | Deployed system, runbooks |
| 23 | Production Launch | Go-live execution | Live product, launch metrics |
| 24 | Analytics & Feedback | Analytics implementation, feedback collection | Analytics dashboard, KPI tracking |
| 25 | Optimization & Scale | Continuous improvement, scaling | Optimization roadmap, Assumptions vs Reality Report |

**Assumptions vs Reality Report**: Stage 25 generates a calibration report comparing initial assumptions (from Stages 2-5) against actual outcomes.

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

Three stages have **advisory checkpoints** where the Chairman is required to make kill/revise/proceed decisions:

| Stage | Checkpoint | Trigger |
|-------|------------|---------|
| 3 | Validation Checkpoint | validation_score < 6 |
| 5 | Profitability Gate | gross_margin < threshold OR breakeven_months > threshold |
| 16 | Schema Firewall | schema_checklist incomplete |

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
Stage 1 ─► Stage 2 ─► Stage 3 ─► Stage 4 ─► Stage 5
                                              │
                                              ▼
          Stage 9 ◄─ Stage 8 ◄─ Stage 7 ◄─ Stage 6
              │
              ▼
         Stage 10 ─► Stage 11 ─► Stage 12
                                     │
                                     ▼
         Stage 16 ◄─ Stage 15 ◄─ Stage 14 ◄─ Stage 13
              │
              ▼
         Stage 17 ─► Stage 18 ─► Stage 19 ─► Stage 20
                                                  │
                                                  ▼
         Stage 25 ◄─ Stage 24 ◄─ Stage 23 ◄─ Stage 22 ◄─ Stage 21
```

---

## Artifacts by Phase

### Phase 1: THE TRUTH
- `idea_brief`
- `critique_report`
- `validation_report`
- `competitive_analysis`
- `financial_model`

### Phase 2: THE ENGINE
- `risk_matrix`
- `pricing_model`
- `business_model_canvas`
- `exit_strategy`

### Phase 3: THE IDENTITY
- `brand_guidelines`
- `cultural_design_config`
- `gtm_plan`
- `marketing_manifest`
- `sales_playbook`

### Phase 4: THE BLUEPRINT
- `tech_stack_decision`
- `data_model`
- `erd_diagram`
- `user_story_pack`
- `api_contract`
- `schema_spec`

### Phase 5: THE BUILD LOOP
- `system_prompt`
- `cicd_config`
- `security_audit`

### Phase 6: LAUNCH & LEARN
- `test_plan`
- `uat_report`
- `deployment_runbook`
- `launch_checklist`
- `analytics_dashboard`
- `optimization_roadmap`
- `assumptions_vs_reality_report`

---

## Integration with LEO Protocol

The 25-stage lifecycle integrates with the LEO Protocol governance system:

1. **SDs for Implementation**: Stages marked `sd_required: true` require Strategic Directives
2. **Phase Boundary Gates**: Risk re-calibration at phase transitions (see [Risk Re-calibration Protocol](../04_features/risk-recalibration-protocol.md))
3. **Capability Sharing**: Secondary outputs feed the Capability Library (see [Capability Router Protocol](../04_features/capability-router-protocol.md))
4. **Compliance Gate**: Stage 20 includes security/compliance certification (see [Stage 20 Compliance Gate](../04_features/stage20-compliance-gate.md))

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

See: [Venture Lifecycle Gap Remediation Overview](../04_features/venture-lifecycle-gap-remediation-overview.md)

---

## Quick Reference Card

```
┌───────────────────────────────────────────────────────────────┐
│                 25-STAGE QUICK REFERENCE                      │
├───────────────────────────────────────────────────────────────┤
│ Phase 1: THE TRUTH (1-5)      → Validate idea                 │
│ Phase 2: THE ENGINE (6-9)     → Build business model          │
│ Phase 3: THE IDENTITY (10-12) → Brand and GTM                 │
│ Phase 4: THE BLUEPRINT (13-16)→ Technical specification       │
│ Phase 5: THE BUILD LOOP (17-20)→ Implementation               │
│ Phase 6: LAUNCH & LEARN (21-25)→ Deploy and optimize          │
├───────────────────────────────────────────────────────────────┤
│ Kill Gates: Stage 3, Stage 5                                  │
│ Schema Firewall: Stage 16                                     │
│ Compliance Gate: Stage 20                                     │
├───────────────────────────────────────────────────────────────┤
│ Token Budgets: Exploratory (75K) | Standard (375K) | Deep (1.5M)│
├───────────────────────────────────────────────────────────────┤
│ Technical Reference: docs/workflow/stages_v2.yaml             │
└───────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- **Technical Configuration**: [`stages_v2.yaml`](./stages_v2.yaml) - Complete stage definitions
- **Phase 7**: [`phase7-orbit-verification.md`](./phase7-orbit-verification.md) - Post-Stage 25 operations
- **Lifecycle Gap Remediation**: [`venture-lifecycle-gap-remediation-overview.md`](../04_features/venture-lifecycle-gap-remediation-overview.md)
- **Risk Re-calibration**: [`risk-recalibration-protocol.md`](../04_features/risk-recalibration-protocol.md)
- **Capability Router**: [`capability-router-protocol.md`](../04_features/capability-router-protocol.md)
- **Stage 20 Compliance**: [`stage20-compliance-gate.md`](../04_features/stage20-compliance-gate.md)

---

**Document Status**: ACTIVE
**Owner**: EHG Engineering
**Maintainer**: LEO Protocol Team
