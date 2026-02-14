# EVA Audit: Dossier Reconciliation

**SD**: SD-EVA-QA-AUDIT-DOSSIER-001
**Auditor**: Claude Opus 4.6
**Date**: 2026-02-14
**Scope**: 25 stage dossiers vs current 25-stage Vision v4.7 architecture

## Executive Summary

Only 5 of 25 expected stage dossiers exist. Of those 5, 4 have incorrect stage names sourced from the old `stages.yaml` instead of Vision v4.7. Phase groupings use a 9-phase model instead of the canonical 6-phase model. The dossier system is severely out of sync with the current architecture.

**Overall Compliance**: 32/100 (critical gap)
**Critical Gaps**: 3
**High Gaps**: 2
**Medium Gaps**: 2

## Dossier Inventory

### Found (5/25)

| Stage | Dossier Name | Vision v4.7 Name | Name Match | Files | Completeness |
|-------|-------------|-----------------|:---:|------:|:---:|
| 1 | Draft Idea | Idea Capture | ✅ | 1/11 | 9% |
| 7 | Comprehensive Planning | Revenue Architecture | ❌ | 2/11 | 18% |
| 9 | Gap Analysis & Market Opportunity | Exit Strategy | ❌ | 1/11 | 9% |
| 15 | Pricing Strategy & Revenue Architecture | Resource Planning | ❌ | 1/11 | 9% |
| 25 | Quality Assurance | Venture Review | ❌ | 7/11 | 64% |

### Missing (20/25)

Stages 2-6, 8, 10-14, 16-24 have no dossier directories.

## Findings

### CRITICAL-1: 80% of Dossiers Missing

**Severity**: Critical

Only 5 of 25 stage dossiers exist. The dossier generation effort from 2025-11-06 produced pilot dossiers for 5 stages only. The remaining 20 stages have no documentation.

**Actual harm**: High. Any venture attempting to use the dossier-guided workflow would have no guidance for 80% of the lifecycle stages.

### CRITICAL-2: Stage Names Sourced from Old Architecture

**Severity**: Critical
**Files**: `docs/guides/workflow/dossiers/README.md`, individual stage READMEs

4 of 5 existing dossiers use stage names from the old `stages.yaml` model instead of Vision v4.7:

| Stage | Dossier Says | Vision v4.7 Says |
|-------|-------------|-----------------|
| 7 | Comprehensive Planning | Revenue Architecture |
| 9 | Gap Analysis & Market Opportunity | Exit Strategy |
| 15 | Pricing Strategy & Revenue Architecture | Resource Planning |
| 25 | Quality Assurance | Venture Review |

**Root cause**: Dossier generation script pulled stage names from `docs/workflow/stages.yaml` (old 40-stage model derivative) instead of the canonical vision document.

### CRITICAL-3: Phase Grouping Mismatch

**Severity**: Critical
**Files**: `docs/guides/workflow/dossiers/README.md`

Dossier README uses a 9-phase grouping model. Vision v4.7 defines 6 phases:

| Vision v4.7 Phase | Stages | Dossier Phase Model |
|-------------------|--------|-------------------|
| THE TRUTH | 1-5 | Split across Phases 1-3 |
| THE ENGINE | 6-9 | Split across Phases 4-5 |
| THE IDENTITY | 10-12 | Phase 6 |
| THE BLUEPRINT | 13-16 | Phase 7 |
| THE BUILD LOOP | 17-22 | Phases 8-9 |
| LAUNCH & LEARN | 23-25 | Phase 9 (partial) |

### HIGH-1: Incomplete File Structure in Existing Dossiers

**Severity**: High

The dossier standard specifies 11 files per stage (01-11). No existing dossier is complete:

- Stage 1: 1/11 files (implementation-gaps.md only)
- Stage 7: 2/11 files
- Stage 9: 1/11 files
- Stage 15: 1/11 files
- Stage 25: 7/11 files (most complete)

### HIGH-2: Historical Generation Reports Reference 40-Stage Model

**Severity**: High
**Files**: `FINAL_SUMMARY_REPORT.md`, `DELTA_LOG_PHASE*.md` files

The generation summary from 2025-11-06 claims "All 40 stages (100% complete)" with 440 files. Phases 10-13 reference "Stages 26-40" which are archived. These reports are artifacts of the old architecture and may mislead users into thinking dossiers are complete.

### MEDIUM-1: Stage 25 Canonical Definition Incorrect

**Severity**: Medium
**Files**: `docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md`

Stage 25's canonical definition file defines the stage as "Quality Assurance" with description "Comprehensive quality assurance and testing processes." Vision v4.7 defines Stage 25 as "Venture Review" — a fundamentally different stage focused on overall venture evaluation.

### MEDIUM-2: No Automated Sync Between Vision and Dossiers

**Severity**: Medium

When Vision v4.7 was updated (2026-02-12), there was no mechanism to detect or alert that dossier content was now stale. The dossiers were last generated 2025-11-06 — over 3 months before the latest vision update.

## Gold Standard Comparison

**Source**: `docs/plans/eva-venture-lifecycle-vision.md` (v4.7, Section 5)

### Canonical 25-Stage List

| # | Stage Name | Phase |
|---|-----------|-------|
| 1 | Idea Capture | THE TRUTH |
| 2 | Idea Analysis | THE TRUTH |
| 3 | Kill Gate | THE TRUTH |
| 4 | Competitive Landscape | THE TRUTH |
| 5 | Kill Gate (Financial) | THE TRUTH |
| 6 | Risk Assessment | THE ENGINE |
| 7 | Revenue Architecture | THE ENGINE |
| 8 | Business Model Canvas | THE ENGINE |
| 9 | Exit Strategy | THE ENGINE |
| 10 | Naming/Brand | THE IDENTITY |
| 11 | GTM Strategy | THE IDENTITY |
| 12 | Sales Identity | THE IDENTITY |
| 13 | Product Roadmap | THE BLUEPRINT |
| 14 | Technical Architecture | THE BLUEPRINT |
| 15 | Resource Planning | THE BLUEPRINT |
| 16 | Financial Projections | THE BLUEPRINT |
| 17 | Pre-Build Checklist | THE BUILD LOOP |
| 18 | Sprint Planning | THE BUILD LOOP |
| 19 | Build Execution | THE BUILD LOOP |
| 20 | Quality Assurance | THE BUILD LOOP |
| 21 | Build Review | THE BUILD LOOP |
| 22 | Release Readiness | THE BUILD LOOP |
| 23 | Launch Execution | LAUNCH & LEARN |
| 24 | Metrics & Learning | LAUNCH & LEARN |
| 25 | Venture Review | LAUNCH & LEARN |

## Recommendations

1. **No retroactive regeneration needed for this audit** — This audit documents the gap; a separate SD should handle dossier regeneration
2. **Forward-looking**: Update dossier generation script to pull from Vision v4.7 as canonical source
3. **Rename existing dossiers**: Correct stage names in the 5 existing dossiers to match Vision v4.7
4. **Archive historical reports**: Mark FINAL_SUMMARY_REPORT.md and DELTA_LOG files as "Legacy 40-Stage Model"
5. **Create sync mechanism**: Automated check when vision document changes to flag stale dossier content
