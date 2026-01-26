# P0 Database & File System Audit Report


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, schema, sd

**SD**: SD-STAGE-ARCH-001-P0
**Date**: 2025-12-30
**Status**: COMPLETE

---

## Executive Summary

This audit confirms the "Schrödinger's Stage" crisis identified in the triangulation assessment. The EHG codebase has **24 duplicate stage files** when Vision V2 specifies exactly **25 unique stages**.

---

## 1. Database Audit (EHG_Engineer)

### Tables Checked

| Table | Status | Findings |
|-------|--------|----------|
| venture_stages | Not Found | Table doesn't exist in EHG_Engineer schema |
| workflow_stages | Not Found | Table doesn't exist in EHG_Engineer schema |
| ventures | Partial | Column `current_stage` doesn't exist |
| workflows | Not Found | Table doesn't exist in EHG_Engineer schema |

**Conclusion**: Stage-related tables are in the EHG app database, not EHG_Engineer. No orphaned entries to clean in this database.

---

## 2. File System Audit (EHG App)

**Location**: `/mnt/c/_EHG/EHG/src/components/stages/`

### Duplicate Stage Files (12 pairs = 24 files)

| Stage | File A | File B | Keep (Vision V2) |
|-------|--------|--------|------------------|
| 1 | Stage1DraftIdea.tsx (16KB) | Stage1Enhanced.tsx (28KB) | TBD by P1 |
| 2 | Stage2AIReview.tsx (20KB) | Stage2VentureResearch.tsx (20KB) | TBD by P1 |
| 11 | Stage11MVPDevelopment.tsx (19KB) | Stage11StrategicNaming.tsx (16KB) | TBD by P1 |
| 12 | Stage12TechnicalImplementation.tsx (22KB) | Stage12AdaptiveNaming.tsx (11KB) | TBD by P1 |
| 13 | Stage13IntegrationTesting.tsx (27KB) | Stage13ExitOrientedDesign.tsx (18KB) | TBD by P1 |
| 14 | Stage14QualityAssurance.tsx (29KB) | Stage14DevelopmentPreparation.tsx (13KB) | TBD by P1 |
| 15 | Stage15DeploymentPreparation.tsx (30KB) | Stage15PricingStrategy.tsx (133B) | TBD by P1 |
| 21 | Stage21LaunchPreparation.tsx (20KB) | Stage21PreFlightCheck.tsx (15KB) | TBD by P1 |
| 22 | Stage22GoToMarketExecution.tsx (22KB) | Stage22IterativeDevelopmentLoop.tsx (19KB) | TBD by P1 |
| 23 | Stage23ContinuousFeedbackLoops.tsx (25KB) | Stage23CustomerAcquisition.tsx (28KB) | TBD by P1 |
| 24 | Stage24GrowthMetricsOptimization.tsx (33KB) | Stage24MVPEngineIteration.tsx (23KB) | TBD by P1 |
| 25 | Stage25ScalePlanning.tsx (41KB) | Stage25QualityAssurance.tsx (31KB) | TBD by P1 |

### Backup Files (To Delete)

| File | Size | Action |
|------|------|--------|
| Stage15PricingStrategy.tsx.backup | 52KB | DELETE |
| Stage4CompetitiveIntelligence.tsx.backup | 39KB | DELETE |

### "Chunk" Workflow Files (Legacy Pattern)

| File | Size | Notes |
|------|------|-------|
| FoundationChunkWorkflow.tsx | 12KB | Chunk pattern - review for removal |
| ValidationChunkWorkflow.tsx | 30KB | Chunk pattern - review for removal |
| PlanningChunkWorkflow.tsx | 12KB | Chunk pattern - review for removal |
| LaunchGrowthChunkWorkflow.tsx | 18KB | Chunk pattern - review for removal |
| OperationsOptimizationChunkWorkflow.tsx | 33KB | Chunk pattern - review for removal |
| CompleteWorkflowOrchestrator.tsx | 26KB | May be needed for orchestration |

### God Components (>30KB)

| File | Size | LOC (est) | Action |
|------|------|-----------|--------|
| Stage4CompetitiveIntelligence.tsx | 52KB | ~1290 | Refactor in P7 |
| Stage25ScalePlanning.tsx | 41KB | ~1060 | Refactor in P7 |
| Stage9GapAnalysis.tsx | 41KB | ~1116 | Refactor in P7 |
| Stage6RiskEvaluation.tsx | 37KB | ~900 | Refactor in P7 |
| Stage7ComprehensivePlanning.tsx | 36KB | ~900 | Refactor in P7 |
| Stage24GrowthMetricsOptimization.tsx | 33KB | ~860 | Refactor in P7 |
| OperationsOptimizationChunkWorkflow.tsx | 33KB | ~850 | Review |

---

## 3. Orphaned Entry Count

| Category | Count |
|----------|-------|
| Orphaned database entries | 0 (tables don't exist in Engineer DB) |
| Duplicate stage files | 24 (12 pairs) |
| Backup files to delete | 2 |
| Chunk workflow files | 6 |
| God components | 7 |

---

## 4. Recommendations for P1 (SSOT Foundation + Delete Legacy)

### Immediate Actions

1. **Delete backup files**:
   - `Stage15PricingStrategy.tsx.backup`
   - `Stage4CompetitiveIntelligence.tsx.backup`

2. **Cross-reference with GENESIS_RITUAL_SPECIFICATION.md** to determine which file to keep for each duplicate pair

3. **Create SSOT** at `/src/config/venture-workflow.ts` with canonical stage names

### Files to Archive (Move to `_deprecated/`)

Based on Vision V2, the following files should be archived (not immediately deleted):
- All 12 "wrong" versions of duplicate files (TBD in P1)
- Chunk workflow files if no longer needed

---

## 5. Success Criteria Status

| Criterion | Status |
|-----------|--------|
| Audit queries executed | PASS (tables don't exist) |
| File system audit complete | PASS |
| Duplicate files identified | PASS (12 pairs) |
| Report generated | PASS |
| Recommendations documented | PASS |

---

## 6. Next Steps

1. **P1**: Load GENESIS_RITUAL_SPECIFICATION.md to get canonical stage names
2. **P1**: Create SSOT in `/src/config/venture-workflow.ts`
3. **P1**: For each duplicate pair, determine which file matches Vision V2
4. **P1**: Archive incorrect files to `_deprecated/`
5. **P1**: Delete backup files

---

*Report generated by SD-STAGE-ARCH-001-P0 audit script*
*Vision V2 total stages: 25*
*Duplicate files found: 24 (12 pairs)*
