# hold_state_contract_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 9
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| surface | `text` | **NO** | - | Which of the 4 hold-state-contract surfaces produced this violation: sd_park | exec_boundary_hold | min_tier_rank | quick_fix_defer. |
| reason | `text` | YES | - | - |
| owner | `text` | YES | - | - |
| review_at | `text` | YES | - | - |
| release_condition | `text` | YES | - | - |
| errors | `jsonb` | **NO** | - | Array of validateHoldStamp() error strings (e.g. ["reason is required"]). |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| release_condition_predicate | `jsonb` | YES | - | Machine-evaluable predicate form of release_condition (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A FR-3), additive alongside the existing free-text release_condition column (which remains the raw-text log, unchanged). Shape: {type: "test_green"|"manual_flag"|"db_row_exists", params: {...}}. Evaluated via lib/governance/release-condition-predicate.js evaluate(predicate, state) -- state is caller-injected, never read live by the evaluator itself, so it stays pure/testable in isolation. NULL for existing rows and for any release_condition that has not yet been expressed as a predicate. |

## Constraints

### Primary Key
- `hold_state_contract_violations_pkey`: PRIMARY KEY (id)

## Indexes

- `hold_state_contract_violations_pkey`
  ```sql
  CREATE UNIQUE INDEX hold_state_contract_violations_pkey ON public.hold_state_contract_violations USING btree (id)
  ```
- `idx_hold_state_contract_violations_surface_created_at`
  ```sql
  CREATE INDEX idx_hold_state_contract_violations_surface_created_at ON public.hold_state_contract_violations USING btree (surface, created_at DESC)
  ```

## RLS Policies

### 1. hold_state_contract_violations_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
