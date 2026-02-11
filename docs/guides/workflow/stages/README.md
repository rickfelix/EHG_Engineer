# 25-Stage Venture Lifecycle Documentation Index

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 2.1
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: 2026-01-19
- **Tags**: venture-workflow, stages, vision-v2, index, documentation-standards-compliant
- **Compliance**: DOCUMENTATION_STANDARDS.md v1.1.0

## Overview

This directory contains comprehensive documentation for each of the 25 stages in the Vision V2 Venture Lifecycle. Each stage document provides detailed information about purpose, inputs, outputs, gates, metrics, and implementation guidance.

## Canonical Source

**`stages_v2.yaml`** is the single source of truth for stage definitions. These documents are generated from and should be consistent with that file.

---

## Phase 1: THE TRUTH (Stages 1-5)

*Validation and market reality assessment*

| Stage | Title | Work Type | SD Required |
|-------|-------|-----------|-------------|
| [1](stage-01-draft-idea-and-chairman-review.md) | Draft Idea & Chairman Review | artifact_only | No |
| [2](stage-02-ai-multi-model-critique.md) | AI Multi-Model Critique | automated_check | No |
| [3](stage-03-market-validation-and-rat.md) | Market Validation & RAT | **decision_gate** | No |
| [4](stage-04-competitive-intelligence.md) | Competitive Intelligence | artifact_only | No |
| [5](stage-05-profitability-forecasting.md) | Profitability Forecasting | **decision_gate** | No |

**Key Decision Point**: Stage 3 is a **kill gate** where ventures can be killed, revised, or rejected based on validation score.

---

## Phase 2: THE ENGINE (Stages 6-9)

*Business model and strategy foundation*

| Stage | Title | Work Type | SD Required |
|-------|-------|-----------|-------------|
| [6](stage-06-risk-evaluation-matrix.md) | Risk Evaluation Matrix | artifact_only | No |
| [7](stage-07-pricing-strategy.md) | Pricing Strategy | artifact_only | No |
| [8](stage-08-business-model-canvas.md) | Business Model Canvas | artifact_only | No |
| [9](stage-09-exit-oriented-design.md) | Exit-Oriented Design | artifact_only | No |

---

## Phase 3: THE IDENTITY (Stages 10-12)

*Brand, positioning, and go-to-market*

| Stage | Title | Work Type | SD Required |
|-------|-------|-----------|-------------|
| [10](stage-10-strategic-naming.md) | Strategic Naming | **sd_required** | Yes (BRAND) |
| [11](stage-11-go-to-market-strategy.md) | Go-to-Market Strategy | artifact_only | No |
| [12](stage-12-sales-and-success-logic.md) | Sales & Success Logic | artifact_only | No |

**Key Feature**: Stage 11 includes the **Crew Tournament Pilot** for brand messaging competition.

---

## Phase 4: THE BLUEPRINT (Stages 13-16)

*Technical architecture and specification - "Kochel Firewall"*

| Stage | Title | Work Type | SD Required |
|-------|-------|-----------|-------------|
| [13](stage-13-tech-stack-interrogation.md) | Tech Stack Interrogation | **decision_gate** | No |
| [14](stage-14-data-model-and-architecture.md) | Data Model & Architecture | **sd_required** | Yes (DATAMODEL) |
| [15](stage-15-epic-and-user-story-breakdown.md) | Epic & User Story Breakdown | **sd_required** | Yes (STORIES) |
| [16](stage-16-spec-driven-schema-generation.md) | Spec-Driven Schema Generation | **decision_gate** | Yes (SCHEMA) |

**Key Decision Point**: Stage 16 is the **Schema Firewall** - a critical advisory checkpoint before implementation begins.

---

## Phase 5: THE BUILD LOOP (Stages 17-20)

*Implementation and development cycle*

| Stage | Title | Work Type | SD Required |
|-------|-------|-----------|-------------|
| [17](stage-17-environment-and-agent-config.md) | Environment & Agent Config | **sd_required** | Yes (ENVCONFIG) |
| [18](stage-18-mvp-development-loop.md) | MVP Development Loop | **sd_required** | Yes (MVP) |
| [19](stage-19-integration-and-api-layer.md) | Integration & API Layer | **sd_required** | Yes (INTEGRATION) |
| [20](stage-20-security-and-performance.md) | Security & Performance | **sd_required** | Yes (SECURITY) |

---

## Phase 6: LAUNCH & LEARN (Stages 21-25)

*Deployment, analytics, and optimization*

| Stage | Title | Work Type | SD Required |
|-------|-------|-----------|-------------|
| [21](stage-21-qa-and-uat.md) | QA & UAT | **sd_required** | Yes (QA) |
| [22](stage-22-deployment-and-infrastructure.md) | Deployment & Infrastructure | **sd_required** | Yes (DEPLOY) |
| [23](stage-23-production-launch.md) | Production Launch | **decision_gate** | No |
| [24](stage-24-analytics-and-feedback.md) | Analytics & Feedback | artifact_only | No |
| [25](stage-25-optimization-and-scale.md) | Optimization & Scale | **sd_required** | Yes (OPTIMIZE) |

**Key Feature**: Stages 23-25 collect **Assumptions vs Reality** data and generate the calibration report.

---

## Quick Reference

### Work Types
| Type | Description |
|------|-------------|
| `artifact_only` | Produces artifacts without requiring an SD |
| `automated_check` | AI-driven automated validation |
| `decision_gate` | Kill/revise/proceed decision point |
| `sd_required` | Requires Strategic Directive creation |

### Advisory Checkpoints
| Stage | Checkpoint Name |
|-------|-----------------|
| 3 | Validation Checkpoint |
| 5 | Profitability Gate |
| 16 | Schema Firewall |

### Golden Nuggets Integration
| Feature | Stages |
|---------|--------|
| Assumptions vs Reality | 2, 3, 5, 23, 24, 25 |
| Token Budget Profiles | 5 |
| Four Buckets (Epistemic) | 3, 5, 6, 16 |
| Crew Tournament | 11 |

---

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml) - Canonical stage configuration
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md) - High-level lifecycle overview
- [Workflow README](../README.md) - Workflow documentation home
- [Golden Nuggets Plan](../../vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md) - Feature specifications

---

## Implementation Status

All 25 stages are **✅ Implemented in EHG** with:
- Full UI components (`Stage*.tsx`)
- Stage-specific viewers (`Stage*Viewer.tsx`)
- Database tracking (`ventures.current_workflow_stage`)
- E2E test coverage (stages 1-25)
- Phase-based navigation accordion

**Verified**: EHG codebase audit completed 2026-01-19. See [Implementation Audit Report](../../reports/EHG_STAGE_IMPLEMENTATION_AUDIT_2026-01-19.md) for details.

## Generation Information

These stage documents were generated from `stages_v2.yaml` using:
```bash
node scripts/generate-stage-docs.cjs
```

**Compliance**: Generator updated 2026-01-19 to meet `DOCUMENTATION_STANDARDS.md` v1.1.0:
- ✅ Complete metadata headers (Category, Status, Version, Author, Tags)
- ✅ Implementation status verified against EHG codebase
- ✅ Accurate UI component references
- ✅ Database-first documentation approach

To regenerate after YAML changes:
```bash
# Remove existing files first
rm docs/workflow/stages/stage-*.md

# Regenerate all 25 stages
node scripts/generate-stage-docs.cjs
```

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Last Generated: 2026-01-19 (DOCUMENTATION_STANDARDS.md v1.1.0 compliant)*
