---
category: guide
status: approved
version: 4.0.0
author: LEO Orchestrator
last_updated: 2026-04-07
tags: [guide, stage-15, design-studio, phase-4]
---
# Stage 15: Design Studio

> **Implementation Note**: This stage was restructured from "Risk Register" to "Design Studio" (`slug: design-studio`, `id: stage-15`) in PRs #2798/#2799. Risk register logic moved to Stage 14 (Technical Architecture).

## Metadata
- **Stage ID**: 15
- **Phase**: 4 (THE BLUEPRINT)
- **Slug**: `design-studio`
- **Version**: 4.0.0
- **Work Type**: `artifact_only`
- **SD Required**: No
- **Advisory Enabled**: No
- **Depends On**: Stage 14 (Technical Architecture)

## Overview

Design Studio handles wireframe generation, visual convergence, and design materialization. It translates the technical architecture (Stage 14) and brand genome (Stage 10) into visual design artifacts.

## Analysis Steps

1. **Wireframe Generation** (`stage-15-wireframe-generator.js`) - Generates wireframe screens from brand genome + technical architecture. Conditional on Stage 10 brand data availability.
2. **Visual Convergence** (`stage-19-visual-convergence.js`) - 5 expert LLM passes on generated wireframes for design quality assessment.

## Output Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wireframes` | object | No | Generated wireframe screens |
| `wireframe_convergence` | object | No | Visual convergence report |

## Artifacts

- `blueprint_wireframes` - Persisted via `artifact-persistence-service.js`

## History

- **v1.0-v2.0**: Epic & User Story Breakdown
- **v3.0**: Risk Register (risk identification, severity classification, budget coherence)
- **v4.0**: Design Studio (wireframe generation + visual convergence) — Risk register moved to Stage 14
