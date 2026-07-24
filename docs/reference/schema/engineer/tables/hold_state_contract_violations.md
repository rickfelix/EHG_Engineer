# hold_state_contract_violations Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 6
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

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
