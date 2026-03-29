# eva_architecture_decisions Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-29T20:40:29.893Z
**Rows**: 3
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| decision_type | `text` | **NO** | - | - |
| decision | `text` | **NO** | - | - |
| recommendation | `text` | YES | - | - |
| metrics | `jsonb` | YES | `'{}'::jsonb` | - |
| calibration_report | `jsonb` | YES | - | - |
| decided_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `eva_architecture_decisions_pkey`: PRIMARY KEY (id)

## Indexes

- `eva_architecture_decisions_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_architecture_decisions_pkey ON public.eva_architecture_decisions USING btree (id)
  ```
- `idx_eva_arch_decisions_type`
  ```sql
  CREATE INDEX idx_eva_arch_decisions_type ON public.eva_architecture_decisions USING btree (decision_type)
  ```

## RLS Policies

### 1. Service role full access (ALL)

- **Roles**: {public}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
