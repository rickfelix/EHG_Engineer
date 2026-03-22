---
category: guide
status: approved
version: 1.0.0
author: Documentation Sub-Agent (DOCMON)
last_updated: 2026-03-22
tags: [guide, venture-workflow, stage-17, vision-v2, blueprint-review, promotion-gate, phase-4]
---
# Stage 17: Blueprint Review Gate

> **Phase**: 4 (THE BLUEPRINT) | **Gate Type**: Promotion | **Work Type**: `decision_gate`

## Metadata
- **Stage ID**: 17
- **Phase**: 4 (THE BLUEPRINT)
- **Slug**: `blueprint-review`
- **Template**: `lib/eva/stage-templates/stage-17.js`
- **Analysis Step**: `lib/eva/stage-templates/analysis-steps/stage-17-blueprint-review.js`
- **Work Type**: `decision_gate`
- **SD Required**: No
- **Advisory Enabled**: No
- **Artifact Type**: `blueprint_review_summary`
- **Implementation Status**: Implemented (SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001)

## Overview

The Blueprint Review Gate is the final checkpoint before a venture enters the BUILD phase. It aggregates all artifacts from stages 1-16, computes per-phase quality scores, identifies missing or below-threshold artifacts, and produces a gate recommendation (PASS / FAIL / REVIEW_NEEDED).

This is a **promotion gate** — the Chairman must approve advancement. Ventures below the quality threshold (70%) are blocked from entering BUILD.

## Purpose

Ensure that a venture has completed sufficient pre-build analysis before committing to implementation. The gate prevents ventures with critical gaps from entering the expensive BUILD phase.

## Inputs

All current artifacts from stages 1-16, grouped by phase:
- **THE TRUTH** (Stages 1-5): Idea brief, AI critique, validation decision, competitive analysis, financial model
- **THE ENGINE** (Stages 6-9): Risk matrix, pricing model, business model canvas, exit strategy
- **THE IDENTITY** (Stages 10-12): Persona/brand, naming/visual identity, GTM/sales strategy
- **THE BLUEPRINT** (Stages 13-16): Product roadmap, data model, user story pack, API contract

## Outputs

| Output | Description |
|--------|-------------|
| `phase_summaries` | Per-phase quality scores, completeness, and gap lists |
| `overall_quality_score` | Weighted average of phase quality scores (0-100) |
| `overall_completeness_pct` | Percentage of required artifacts present |
| `critical_gaps` | Array of missing/below-threshold artifacts with severity |
| `gate_recommendation` | `PASS`, `FAIL`, or `REVIEW_NEEDED` |
| `blueprint_review_summary` | Stored artifact with full review data |

## Gate Logic

| Condition | Recommendation |
|-----------|---------------|
| Quality >= 70, no critical gaps, completeness >= 80% | **PASS** |
| Quality >= 50, <= 2 critical gaps | **REVIEW_NEEDED** |
| Quality < 50 or > 2 critical gaps | **FAIL** |

Chairman override is supported for all decisions.

## JSON Export

The `export_blueprint_review(p_venture_id)` RPC function returns a comprehensive JSONB payload with all artifacts grouped by phase, including quality scores and validation status. This enables downstream AI processors to consume the full pre-build artifact set programmatically.

## Dependencies

- **Previous Stage**: Stage 16 (Financial Projections)
- **Next Stage**: Stage 18 (Build Readiness)
- **Database Migration**: `20260322_stage_renumbering_blueprint_review.sql`
- **RPC Function**: `20260322_export_blueprint_review_rpc.sql`

## Related

- [Phase 4: The Blueprint](../cli-venture-lifecycle/stages/phase-04-the-blueprint.md)
- [Promotion Gates Reference](../cli-venture-lifecycle/reference/promotion-gates.md)
- [Stage 16: Financial Projections](stage-16-spec-driven-schema-generation.md)
- [Stage 18: Build Readiness](stage-18-build-readiness.md)
