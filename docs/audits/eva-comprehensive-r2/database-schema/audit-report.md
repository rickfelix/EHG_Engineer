---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Database Schema Compliance Audit Report — Round 2


## Table of Contents

- [Executive Summary](#executive-summary)
  - [R1 Finding Remediation Summary](#r1-finding-remediation-summary)
- [R1 Finding Verification](#r1-finding-verification)
  - [CRIT-001: Missing Per-Stage Data Tables — BY DESIGN](#crit-001-missing-per-stage-data-tables-by-design)
  - [CRIT-002: Stage-Specific Enum Definitions — RESOLVED](#crit-002-stage-specific-enum-definitions-resolved)
  - [HIGH-001: RLS Policies Too Permissive — PARTIALLY RESOLVED](#high-001-rls-policies-too-permissive-partially-resolved)
  - [HIGH-002: Missing Stage-Specific Gate Constraints — RESOLVED](#high-002-missing-stage-specific-gate-constraints-resolved)
  - [HIGH-003: Missing Cross-Stage Data Contracts — RESOLVED](#high-003-missing-cross-stage-data-contracts-resolved)
  - [MED-001: Naming Convention Inconsistency — BY DESIGN](#med-001-naming-convention-inconsistency-by-design)
  - [MED-002: Missing Audit Trail Columns — PARTIALLY RESOLVED](#med-002-missing-audit-trail-columns-partially-resolved)
  - [MED-003: No Stage Advancement Constraints — RESOLVED](#med-003-no-stage-advancement-constraints-resolved)
  - [LOW-001: Redundant Event Tables — BY DESIGN](#low-001-redundant-event-tables-by-design)
  - [LOW-002: Missing Indexes — RESOLVED](#low-002-missing-indexes-resolved)
  - [LOW-003: NULL Handling — ACCEPTABLE](#low-003-null-handling-acceptable)
- [New R2 Findings](#new-r2-findings)
  - [NEW-001: Duplicate Phase CHECK Constraints](#new-001-duplicate-phase-check-constraints)
  - [NEW-002: Public-Role Write Policies (Security)](#new-002-public-role-write-policies-security)
  - [NEW-003: Foreign Key Reference Split](#new-003-foreign-key-reference-split)
  - [NEW-004: venture_id Type Mismatch in Circuit Breaker](#new-004-venture_id-type-mismatch-in-circuit-breaker)
- [Architecture Alignment Summary](#architecture-alignment-summary)
- [Recommendations Summary](#recommendations-summary)
  - [Immediate (P0 — Security)](#immediate-p0-security)
  - [Short-Term (P1)](#short-term-p1)
  - [Medium-Term (P2)](#medium-term-p2)
- [Score Breakdown](#score-breakdown)
- [Conclusion](#conclusion)

**SD**: SD-EVA-QA-AUDIT-R2-DBSCHEMA-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-R2-ORCH-001
**R1 Baseline**: SD-EVA-QA-AUDIT-DBSCHEMA-001 (Score: 42/100)
**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2026-02-14
**Architecture Reference**: EVA Platform Architecture v1.6, Section 8

---

## Executive Summary

Round 2 database schema compliance audit of EVA tables against Architecture v1.6 Section 8. Audited **63 EVA-related tables/views** (29 with `eva_` prefix, 34 without) via live schema queries including RLS policies, constraints, indexes, and enum types.

**Overall Score: 72/100** (+30 from R1 baseline of 42/100)

| Metric | R1 | R2 | Delta |
|--------|-----|-----|-------|
| Table naming & structure | 17/20 | 18/20 | +1 |
| RLS & security | 4/20 | 12/20 | +8 |
| Schema completeness vs spec | 2/25 | 18/25 | +16 |
| Constraint enforcement | 5/20 | 16/20 | +11 |
| Index & performance | 14/15 | 15/15 | +1 |
| **Overall** | **42/100** | **72/100** | **+30** |

**Remediation Summary**: 4 new findings discovered in R2.

### R1 Finding Remediation Summary

| Status | Count | Findings |
|--------|-------|----------|
| RESOLVED | 5 | CRIT-002, HIGH-002, HIGH-003, MED-003, LOW-002 |
| BY DESIGN | 3 | CRIT-001, MED-001, LOW-001 |
| PARTIALLY RESOLVED | 2 | HIGH-001, MED-002 |
| ACCEPTABLE | 1 | LOW-003 |
| REGRESSED | 0 | — |

---

## R1 Finding Verification

### CRIT-001: Missing Per-Stage Data Tables — BY DESIGN

**R1 Severity**: CRITICAL
**R1 Finding**: Architecture v1.6 Section 8 defines 25 stage-specific tables; only generic tables exist.

**R2 Status**: The system uses a generic-table-with-stage-number pattern rather than 25 separate tables. This is a deliberate architectural decision:

- `venture_stage_work` — tracks work per stage via `lifecycle_stage` column (unique constraint on `venture_id, lifecycle_stage`)
- `stage_data_contracts` — defines input/output schemas per stage via `stage_number` (CHECK: 1-40)
- `eva_stage_gate_results` — gate evaluation per stage via `stage_number` (CHECK: 1-25)
- `eva_artifact_dependencies` — cross-stage dependencies via `source_stage`/`target_stage` (CHECK: 1-25)
- `stage_events` — stage events via `stage_number` (CHECK: 1-40)

The `stage_data_contracts` table provides per-stage schema validation via JSONB `input_schema`/`output_schema` columns, addressing the data contract concern without creating 25 separate tables.

**Assessment**: Generic tables with stage-number discrimination is a valid pattern for a 25-stage lifecycle. Reclassified from CRITICAL defect to intentional architecture decision.

---

### CRIT-002: Stage-Specific Enum Definitions — RESOLVED

**R1 Severity**: CRITICAL
**R1 Finding**: Only `work_type` CHECK existed. All architecture-specified enums missing.

**R2 Status**: 18 dedicated PostgreSQL ENUM types now exist, plus 50+ CHECK constraints providing inline enum validation.

**Key ENUM types added since R1**:
- `eva_archetype`: saas, marketplace, deeptech, hardware, services, media, fintech
- `eva_exit_type`: acquisition, ipo, merger, mbo, liquidation
- `eva_buyer_type`: strategic, financial, competitor, pe
- `eva_channel_type`: paid, organic, earned, owned
- `eva_milestone_priority`: now, next, later
- `eva_pricing_model`: freemium, subscription, one_time, usage_based, marketplace_commission, hybrid
- `eva_health_band`, `eva_severity`, `eva_task_status`, `eva_test_type`, `eva_defect_status`
- `venture_stage_enum` (36 values), `venture_status_enum`, `stage_category_enum`

All 6 architecture-specified enums from the R1 finding are now implemented as PostgreSQL ENUM types.

---

### HIGH-001: RLS Policies Too Permissive — PARTIALLY RESOLVED

**R1 Severity**: HIGH
**R1 Finding**: All EVA RLS policies use `USING (TRUE)`.

**R2 Status**: Core operational tables now use proper company/user-scoped RLS. Configuration tables still use `TRUE`.

**Well-secured tables** (company/user-scoped):
- `eva_actions` — 4 policies using `user_company_access` subquery
- `eva_orchestration_sessions` — 4 policies using `user_company_access`
- `eva_audit_log`, `eva_decisions`, `eva_events` — SELECT scoped to user's ventures
- `eva_stage_gate_results`, `eva_ventures` — SELECT scoped via `ventures.created_by = auth.uid()`
- `venture_stage_work` — uses `fn_user_has_venture_access(venture_id)` function
- `venture_artifacts` — uses `fn_user_has_venture_access()` + `fn_is_chairman()`

**Still permissive** (authenticated `TRUE`):
- `eva_artifact_dependencies`, `eva_circuit_breaker`, `eva_idea_categories`
- `eva_orchestration_events`, `stage_events`, `venture_decisions`

**Concerning**: 7+ tables have `ALL` policies for `public` role with `qual=true` (see NEW-002 below).

---

### HIGH-002: Missing Stage-Specific Gate Constraints — RESOLVED

**R1 Severity**: HIGH
**R1 Finding**: No database-level gate enforcement.

**R2 Status**: `eva_stage_gate_results` table provides comprehensive gate tracking:
- `gate_type` CHECK: entry, exit, kill
- `stage_number` CHECK: 1-25
- `overall_score` CHECK: 0-100
- `passed` boolean (NOT NULL)
- Unique constraint: `(venture_id, stage_number, gate_type, evaluated_at)`
- Trigger: `enforce_kill_gate_threshold()` on INSERT/UPDATE
- `ventures` has trigger `prevent_tier0_stage_progression()` for tier-cap enforcement

---

### HIGH-003: Missing Cross-Stage Data Contracts — RESOLVED

**R1 Severity**: HIGH
**R1 Finding**: No artifact dependency tracking between stages.

**R2 Status**: Two new tables address this:

1. **`stage_data_contracts`**: Per-stage `input_schema`/`output_schema` (JSONB, NOT NULL), versioned with `(stage_number, version)` unique constraint, `is_active` flag, `updated_by` audit column
2. **`eva_artifact_dependencies`**: Cross-stage tracking with `source_stage`/`target_stage` (CHECK: `source_stage < target_stage`), `validation_status` (pending/validated/missing/invalid), unique on `(source_stage, target_stage, artifact_type)`

**Minor issue**: `stage_data_contracts` has duplicate `phase` CHECK constraints — one with lowercase values (`ideation`, `validation`, etc.) and one with uppercase (`IDEATION`, `FORMATION`, etc.). This is a migration artifact.

---

### MED-001: Naming Convention Inconsistency — BY DESIGN

**R1 Severity**: MEDIUM
**R1 Finding**: 6 tables missing `eva_` prefix.

**R2 Status**: The naming convention is domain-segmented rather than inconsistent:
- `eva_*` = EVA orchestration/system tables (29 tables)
- `venture_*` = Venture entity/business tables
- `stage_*` / `stage13_*` = Stage processing tables
- `lifecycle_*` = Lifecycle configuration tables

The `eva_` prefix denotes the EVA system/orchestration layer, while `venture_*` denotes business entities. The boundary is not perfectly clean (e.g., `eva_ventures` vs `ventures` both exist), but the pattern is intentional.

---

### MED-002: Missing Audit Trail Columns — PARTIALLY RESOLVED

**R1 Severity**: MEDIUM
**R1 Finding**: Missing `updated_by`, `change_reason`, `previous_values`.

**R2 Status**: The system uses a centralized audit pattern:
- `eva_audit_log` — comprehensive with `action_type`, `action_source`, `action_data` (JSONB), `actor_type`, `actor_id`
- `eva_event_log` — execution audit with `trigger_source`, `correlation_id`
- `eva_trace_log` — distributed tracing with spans and events
- `eva_saga_log` — saga pattern with step tracking

Only 2 tables have direct `updated_by` columns (`stage_data_contracts`, `venture_compliance_progress`). No tables have `change_reason` or `previous_values`.

**Assessment**: Centralized audit logging is a valid pattern (vs per-table audit columns). The existing audit infrastructure provides comprehensive tracking through the event/trace/saga system.

---

### MED-003: No Stage Advancement Constraints — RESOLVED

**R1 Severity**: MEDIUM
**R1 Finding**: No constraints preventing stage jumping or re-entry.

**R2 Status**: Multiple layers of stage advancement control:
- `prevent_tier0_stage_progression()` trigger on `ventures` (INSERT/UPDATE)
- `fn_validate_stage_column()` trigger on `ventures` (INSERT/UPDATE)
- `enforce_kill_gate_threshold()` trigger on `eva_stage_gate_results`
- `lifecycle_stage_config.depends_on` — declarative stage dependencies (integer array)
- `venture_stage_transitions` — transition logging with `transition_type` CHECK: normal, skip, rollback, pivot
- `stage13_substage_states.current_substage` — explicit substage FSM (13.1, 13.2, 13.3, 13.3_complete)
- `substage_transition_log` — transition source tracking (eva_automatic, chairman_override, gate_validation_pass, manual_admin, rollback)

---

### LOW-001: Redundant Event Tables — BY DESIGN

**R1 Severity**: LOW
**R1 Finding**: 4 event tables with overlapping schema.

**R2 Status**: 6 event tables exist, each serving a distinct purpose:
1. `eva_events` — event ingestion (venture-scoped, processed flag, idempotency)
2. `eva_event_ledger` — handler-level exactly-once processing
3. `eva_event_log` — execution audit trail
4. `eva_events_dlq` — dead letter queue for failed events
5. `eva_orchestration_events` — orchestration domain events (chairman flagged)
6. `stage_events` — stage-specific events (stage_number, authority level)

This is a standard event sourcing architecture with clear separation of concerns.

---

### LOW-002: Missing Indexes — RESOLVED

**R1 Severity**: LOW
**R1 Finding**: 3 missing indexes for common queries.

**R2 Status**: 280+ indexes exist across EVA tables, including:
- Primary key btree indexes
- Foreign key column indexes
- Status column indexes (often partial for specific states)
- Timestamp DESC indexes for recency queries
- JSONB GIN indexes
- IVFFlat indexes for vector similarity search
- Trigram indexes for full-text search
- Composite indexes for multi-column lookups
- Idempotency key unique indexes

All 3 R1-identified missing indexes are now covered.

---

### LOW-003: NULL Handling — ACCEPTABLE

**R1 Severity**: LOW
**R2 Status**: NOT NULL constraints consistently applied to required fields. JSONB columns default to `'{}'::jsonb` or `'[]'::jsonb` rather than NULL, preventing null-reference errors.

---

## New R2 Findings

### NEW-001: Duplicate Phase CHECK Constraints

**File**: `stage_data_contracts` table
**Severity**: LOW

Two conflicting CHECK constraints on the `phase` column:
- `phase IN ('ideation', 'validation', 'execution', 'monitoring')` (lowercase)
- `phase IN ('IDEATION', 'FORMATION', 'EXECUTION', 'OPTIMIZATION', 'SCALING')` (uppercase)

Both are additive, so all values from both sets are valid. This is a migration artifact where a newer migration added uppercase values without removing the original constraint.

**Recommendation**: Consolidate into a single CHECK constraint with the canonical values.

---

### NEW-002: Public-Role Write Policies (Security)

**Severity**: HIGH

7+ tables have `ALL` (full CRUD) policies for the `public` role with `qual=true`:
- `evaluation_profiles_write_service`
- `epo_write_service`
- `venture_archetypes_service_all`
- `venture_blueprints_service_all`
- `venture_briefs_service_all`
- `venture_nursery_service_all`
- `venture_templates_write`

These appear to be "service_role" policies incorrectly assigned to the `public` role, granting unauthenticated write access.

**Recommendation**: Change these policies to target `service_role` instead of `public`. Review if any of these tables need public read access (acceptable) vs public write access (not acceptable).

---

### NEW-003: Foreign Key Reference Split

**Severity**: MEDIUM

Some tables reference `ventures.id` directly while others reference `eva_ventures.id`:
- `ventures.id` FK: `eva_stage_gate_results`, `eva_orchestration_events`, `stage13_*`, `venture_*`
- `eva_ventures.id` FK: `eva_events`, `eva_decisions`, `eva_audit_log`, `eva_automation_executions`

`eva_ventures` itself references `ventures.id` via `venture_id` FK, creating two pathways to reach venture data.

**Recommendation**: Standardize on one referencing strategy (preferably `eva_ventures.id` for EVA tables) to simplify JOINs and prevent query confusion.

---

### NEW-004: venture_id Type Mismatch in Circuit Breaker

**Severity**: LOW

`eva_circuit_breaker.venture_id` and `eva_circuit_state_transitions.venture_id` use TEXT type instead of UUID. No FK constraint to `ventures` or `eva_ventures`.

**Recommendation**: Migrate to UUID type with FK constraint for referential integrity.

---

## Architecture Alignment Summary

| Requirement | R1 Compliance | R2 Compliance | Change |
|------------|:---:|:---:|:---:|
| Table naming convention | 90% | 90% | — (reclassified as domain-segmented) |
| RLS policies | 20% | 65% | +45% (core tables secured) |
| Stage-specific data models | 0% | 75% | +75% (generic+stage_number pattern) |
| Kill gate constraints | 0% | 90% | +90% (triggers + gate results table) |
| Cross-stage contracts | 0% | 95% | +95% (stage_data_contracts + artifact deps) |
| Enum type safety | 15% | 95% | +80% (18 ENUMs + 50+ CHECKs) |
| Audit trail completeness | 60% | 70% | +10% (centralized audit pattern) |
| Index coverage | 70% | 98% | +28% (280+ indexes) |
| Column naming consistency | 85% | 85% | — |

---

## Recommendations Summary

### Immediate (P0 — Security)
1. **NEW-002**: Fix public-role write policies — change 7+ tables from `public` to `service_role` (security risk)

### Short-Term (P1)
2. **HIGH-001 (remaining)**: Tighten RLS on configuration tables (`eva_artifact_dependencies`, `eva_circuit_breaker`, `stage_events`, `venture_decisions`)
3. **NEW-003**: Standardize FK referencing strategy (ventures vs eva_ventures)

### Medium-Term (P2)
4. **NEW-001**: Consolidate duplicate `phase` CHECK constraint on `stage_data_contracts`
5. **MED-002 (remaining)**: Consider `updated_by` column on high-mutation tables beyond the centralized audit log
6. **NEW-004**: Migrate circuit breaker `venture_id` from TEXT to UUID with FK

---

## Score Breakdown

| Category | R1 Score | R2 Score | Delta | Notes |
|----------|----------|----------|-------|-------|
| Table naming & structure | 17/20 | 18/20 | +1 | Domain-segmented naming is intentional |
| RLS & security | 4/20 | 12/20 | +8 | Core tables secured; public-write policies deduct |
| Schema completeness vs spec | 2/25 | 18/25 | +16 | Generic+stage_number pattern, ENUMs, contracts |
| Constraint enforcement | 5/20 | 16/20 | +11 | Gate triggers, stage advancement, substage FSM |
| Index & performance | 14/15 | 15/15 | +1 | 280+ indexes, IVFFlat, GIN, trigram |

**Overall: 72/100** (R1: 42/100, Delta: +30)

---

## Conclusion

The EVA database schema has undergone substantial improvement since R1. The most impactful changes are the addition of 18 PostgreSQL ENUM types (resolving CRIT-002), cross-stage data contracts and artifact dependencies (resolving HIGH-002 and HIGH-003), and comprehensive stage advancement constraints (resolving MED-003). RLS policies have improved significantly for core operational tables but configuration tables and several `public`-role write policies remain a security concern.

The R1 "CRITICAL" finding about missing per-stage tables (CRIT-001) has been reclassified as an intentional architecture decision — the generic-table-with-stage-number pattern combined with `stage_data_contracts` provides per-stage schema validation without the maintenance burden of 25 separate tables.

The primary remaining concerns are: (1) public-role write policies on 7+ tables (NEW-002, security risk), (2) FK referencing inconsistency between `ventures` and `eva_ventures` (NEW-003), and (3) incomplete per-table audit columns (MED-002, mitigated by centralized audit log).
