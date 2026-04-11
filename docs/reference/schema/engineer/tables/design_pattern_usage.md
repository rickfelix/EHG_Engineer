# design_pattern_usage Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-11T17:33:07.943Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| pattern_id | `text` | **NO** | - | - |
| reference_id | `uuid` | YES | - | - |
| used_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `design_pattern_usage_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `design_pattern_usage_reference_id_fkey`: reference_id → design_reference_library(id)

## Indexes

- `design_pattern_usage_pkey`
  ```sql
  CREATE UNIQUE INDEX design_pattern_usage_pkey ON public.design_pattern_usage USING btree (id)
  ```
- `idx_dpu_pattern_id`
  ```sql
  CREATE INDEX idx_dpu_pattern_id ON public.design_pattern_usage USING btree (pattern_id)
  ```
- `idx_dpu_venture_id`
  ```sql
  CREATE INDEX idx_dpu_venture_id ON public.design_pattern_usage USING btree (venture_id)
  ```
- `idx_dpu_venture_pattern`
  ```sql
  CREATE INDEX idx_dpu_venture_pattern ON public.design_pattern_usage USING btree (venture_id, pattern_id)
  ```

## RLS Policies

### 1. Allow service role full access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
