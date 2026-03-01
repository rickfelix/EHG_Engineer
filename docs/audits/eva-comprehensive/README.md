# EVA Comprehensive Audit: Vision & Architecture Compliance

**Orchestrator**: `SD-EVA-QA-AUDIT-ORCH-001`
**Created**: 2026-02-14
**Priority**: Critical
**Gold Standard**: Vision v4.7 + Architecture v1.6 Section 8

## Purpose

Validate the EVA venture lifecycle (25 stages, Phases A-E, 33 SDs) against the gold standard specifications. Built rapidly across 6 days by multiple orchestrator children — patterns diverged. All Phase A-E SDs were built before PRD field consumption wiring (PR #1222).

## Structure: 12 Children across 2 Tiers

### Tier 1 — Independent (9 SDs, can run in parallel)

| SD Key | Title | Output Dir |
|--------|-------|------------|
| `SD-EVA-QA-AUDIT-TRUTH-001` | Phase 1: THE TRUTH (Stages 1-5) | `phase-1-truth/` |
| `SD-EVA-QA-AUDIT-ENGINE-001` | Phase 2: THE ENGINE (Stages 6-9) | `phase-2-engine/` |
| `SD-EVA-QA-AUDIT-IDENTITY-001` | Phase 3: THE IDENTITY (Stages 10-12) | `phase-3-identity/` |
| `SD-EVA-QA-AUDIT-BLUEPRINT-001` | Phase 4: THE BLUEPRINT (Stages 13-16) | `phase-4-blueprint/` |
| `SD-EVA-QA-AUDIT-BUILDLOOP-001` | Phase 5: THE BUILD LOOP (Stages 17-22) | `phase-5-buildloop/` |
| `SD-EVA-QA-AUDIT-LAUNCH-001` | Phase 6: LAUNCH & LEARN (Stages 23-25) | `phase-6-launch/` |
| `SD-EVA-QA-AUDIT-INFRA-001` | Infrastructure Quality | `infrastructure/` |
| `SD-EVA-QA-AUDIT-DBSCHEMA-001` | Database Schema Compliance | `database-schema/` |
| `SD-EVA-QA-AUDIT-PRD-EXEC-001` | PRD-EXEC Retroactive Gap | `prd-exec-gap/` |

### Tier 2 — Depend on Phase Audits (3 SDs)

| SD Key | Title | Blocked By | Output Dir |
|--------|-------|------------|------------|
| `SD-EVA-QA-AUDIT-CROSSCUT-001` | Cross-Cutting Consistency | Children 1-6 | `cross-cutting/` |
| `SD-EVA-QA-AUDIT-VISION-001` | Vision Compliance | Children 1-6 | `vision-compliance/` |
| `SD-EVA-QA-AUDIT-DOSSIER-001` | Dossier Reconciliation | Children 1-6 | `dossier-reconciliation/` |

### Dependency Graph

```
Tier 1 (parallel):  [TRUTH] [ENGINE] [IDENTITY] [BLUEPRINT] [BUILDLOOP] [LAUNCH]  [INFRA] [DBSCHEMA] [PRD-EXEC]
                       \       \        |         /          /          /
Tier 2 (after):       [CROSSCUT]     [VISION]           [DOSSIER]
```

## Gold Standard Documents

- `docs/plans/eva-venture-lifecycle-vision.md` (v4.7, 2026-02-12) — Section 5: Stage Inventory
- `docs/plans/eva-platform-architecture.md` (v1.6, 2026-02-12) — Section 8: 25-Stage Lifecycle Specifications (lines 559-1085)

## Preliminary Findings

Already identified from sampling 20+ files:

### Critical
- Retryability conflict: event-router string-matches errors; handlers set `.retryable` flag router ignores
- 3+ table names for stage data: inconsistent fallback ordering between handlers
- Event bus: 0 unit tests (4 handlers + router + registry)

### High
- 3 competing error patterns: throw Error, ServiceError, result-object
- 4 competing logging patterns: console.log prefix, injected logger, structured JSON, none
- parseJSON() duplicated 25 times: identical function in every stage file
- Chairman decision watcher: 0 tests

### Medium
- DI parameter naming: `db` vs `supabase` with translation at call site

## Files

- [Dossier Reconciliation Report](dossier-reconciliation-report.md)
- [Phase 4 Blueprint](phase-4-blueprint.md)
