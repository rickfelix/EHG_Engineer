# 25-Stage Venture Lifecycle Documentation Index

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 2.2
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-03-05
- **Tags**: venture-workflow, stages, vision-v2, index, documentation-standards-compliant
- **Compliance**: documentation-standards.md v1.1.0

## Overview

This directory contains comprehensive documentation for each of the 25 stages in the Vision V2 Venture Lifecycle. Each stage document provides detailed information about purpose, inputs, outputs, gates, metrics, and implementation guidance.

> **⚠️ Implementation Alignment Note** (2026-03-05): Stage titles and phase boundaries in this index reflect the **actual codebase implementation** (`lib/eva/stage-templates/stage-XX.js`). The original design spec (`stages_v2.yaml` pre-2026-03-05) used different names — these are preserved as `design_spec_title` in the YAML. Individual stage `.md` files below still use the original design-spec filenames and may reference the old titles in their content.

## Canonical Source

**`stages_v2.yaml`** is the single source of truth for stage definitions (updated 2026-03-05 to align with codebase).

---

## Phase 1: THE TRUTH (Stages 1-5)

*Validation and market reality assessment*

| Stage | Implementation Title | Design Spec Title | Work Type | SD Required |
|-------|---------------------|-------------------|-----------|-------------|
| [1](stage-01-draft-idea-and-chairman-review.md) | Idea Capture | Draft Idea & Chairman Review | artifact_only | No |
| [2](stage-02-ai-multi-model-critique.md) | Idea Analysis | AI Multi-Model Critique | automated_check | No |
| [3](stage-03-market-validation-and-rat.md) | **Kill Gate** | Market Validation & RAT | **decision_gate** | No |
| [4](stage-04-competitive-intelligence.md) | Competitive Landscape | Competitive Intelligence | artifact_only | No |
| [5](stage-05-profitability-forecasting.md) | **Kill Gate (Financial)** | Profitability Forecasting | **decision_gate** | No |

**Key Decision Points**: Stage 3 and Stage 5 are **kill gates** where ventures can be killed, revised, or rejected.

---

## Phase 2: THE ENGINE (Stages 6-9)

*Business model and strategy foundation*

| Stage | Implementation Title | Design Spec Title | Work Type | SD Required |
|-------|---------------------|-------------------|-----------|-------------|
| [6](stage-06-risk-evaluation-matrix.md) | Risk Assessment | Risk Evaluation Matrix | artifact_only | No |
| [7](stage-07-pricing-strategy.md) | Revenue Architecture | Pricing Strategy | artifact_only | No |
| [8](stage-08-business-model-canvas.md) | Business Model Canvas | Business Model Canvas | artifact_only | No |
| [9](stage-09-exit-oriented-design.md) | Exit Strategy | Exit-Oriented Design | artifact_only | No |

---

## Phase 3: THE IDENTITY (Stages 10-12)

*Brand, positioning, and go-to-market*

| Stage | Implementation Title | Design Spec Title | Work Type | SD Required |
|-------|---------------------|-------------------|-----------|-------------|
| [10](stage-10-strategic-naming.md) | **Customer & Brand Foundation** | Strategic Naming | **sd_required** | Yes (BRAND) |
| [11](stage-11-go-to-market-strategy.md) | Naming & Visual Identity | Go-to-Market Strategy | artifact_only | No |
| [12](stage-12-sales-and-success-logic.md) | GTM & Sales Strategy | Sales & Success Logic | artifact_only | No |

**Key Feature**: Stage 10 includes Chairman governance gate for brand approval. Stage 11 includes the **Crew Tournament Pilot** for brand messaging competition.

---

## Phase 4: THE BLUEPRINT (Stages 13-16)

*Product planning and financial validation*

| Stage | Implementation Title | Design Spec Title | Work Type | SD Required |
|-------|---------------------|-------------------|-----------|-------------|
| [13](stage-13-tech-stack-interrogation.md) | **Product Roadmap** | Tech Stack Interrogation | **decision_gate** | No |
| [14](stage-14-data-model-and-architecture.md) | Technical Architecture | Data Model & Architecture | artifact_only | No |
| [15](stage-15-epic-and-user-story-breakdown.md) | Design Studio | Design Studio | artifact_only | No |
| [16](stage-16-spec-driven-schema-generation.md) | **Financial Projections** | Spec-Driven Schema Generation | **promotion_gate** | No |

**Key Decision Points**: Stage 13 is a **kill gate** enforcing roadmap completeness. Stage 16 is the **Phase 4→5 Promotion Gate** requiring positive runway and defined projections.

---

## Phase 5: THE BUILD LOOP (Stages 17-22)

*Implementation and development cycle*

| Stage | Implementation Title | Design Spec Title | Work Type | SD Required |
|-------|---------------------|-------------------|-----------|-------------|
| [17](stage-17-environment-and-agent-config.md) | Pre-Build Checklist | Environment & Agent Config | artifact_only | No |
| [18](stage-18-mvp-development-loop.md) | Sprint Planning | MVP Development Loop | artifact_only | No |
| [19](stage-19-integration-and-api-layer.md) | Build Execution | Integration & API Layer | artifact_only | No |
| [20](stage-20-security-and-performance.md) | Quality Assurance | Security & Performance | artifact_only | No |
| [21](stage-21-qa-and-uat.md) | Build Review | QA & UAT | artifact_only | No |
| [22](stage-22-deployment-and-infrastructure.md) | **Release Readiness** | Deployment & Infrastructure | **promotion_gate** | No |

**Key Decision Point**: Stage 22 is the **Phase 5→6 Promotion Gate** — release readiness must be confirmed before launch.

---

## Phase 6: LAUNCH & LEARN (Stages 23-25)

*Deployment, distribution, and go-live*

| Stage | Implementation Title | Design Spec Title | Work Type | SD Required |
|-------|---------------------|-------------------|-----------|-------------|
| [23](stage-23-production-launch.md) | Marketing Preparation | Production Launch | artifact_only | No |
| [24](stage-24-analytics-and-feedback.md) | Launch Readiness | Analytics & Feedback | artifact_only | No |
| [25](stage-25-optimization-and-scale.md) | **Launch Execution** | Optimization & Scale | **decision_gate** | No |

**Key Feature**: Stage 25 activates distribution channels and transitions venture `pipeline_mode` to `'operations'`.

---

## Quick Reference

### Work Types
| Type | Description |
|------|-------------|
| `artifact_only` | Produces artifacts without requiring an SD |
| `automated_check` | AI-driven automated validation |
| `decision_gate` | Kill/revise/proceed decision point |
| `promotion_gate` | Phase transition gate — must pass to advance |
| `sd_required` | Requires Strategic Directive creation |

### Kill & Promotion Gates
| Stage | Implementation Title | Gate Type |
|-------|---------------------|-----------|
| 3 | Kill Gate | Kill Gate (market validation score) |
| 5 | Kill Gate (Financial) | Kill Gate (profitability benchmarks) |
| 13 | Product Roadmap | Kill Gate (roadmap completeness) |
| 16 | Financial Projections | Promotion Gate (Phase 4→5) |
| 22 | Release Readiness | Promotion Gate (Phase 5→6) |
| 25 | Launch Execution | Authorization Gate (go-live) |

### Golden Nuggets Integration
| Feature | Stages (by implementation number) |
|---------|-----------------------------------|
| Assumptions vs Reality | 2, 3, 5, 23, 24, 25 |
| Token Budget Profiles | 5 |
| Four Buckets (Epistemic) | 3, 5, 6, 16 |
| Crew Tournament | 11 |

---

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml) - Canonical stage configuration (updated 2026-03-05)
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md) - High-level lifecycle overview
- [Workflow README](../README.md) - Workflow documentation home
- [Stage Templates](../../../../lib/eva/stage-templates/) - Actual stage implementations (source of truth for titles)

---

## Implementation Status

All 25 stages are **✅ Implemented in EHG** (`lib/eva/stage-templates/stage-01.js` through `stage-25.js`).

**Note on individual stage .md files**: Files in this directory were generated from the original `stages_v2.yaml` design spec. File names and internal content may reflect the original design-spec titles rather than the final implementation titles shown in the tables above.

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Last Updated: 2026-03-05 (aligned with codebase implementation)*
