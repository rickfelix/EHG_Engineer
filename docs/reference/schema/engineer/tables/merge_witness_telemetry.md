# merge_witness_telemetry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1,150
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| pr_number | `integer(32)` | **NO** | - | - |
| repo | `text` | YES | - | - |
| work_key | `text` | YES | - | - |
| tier | `text` | YES | - | - |
| lane | `text` | **NO** | - | - |
| via_mergework | `boolean` | **NO** | `true` | - |
| overall | `text` | **NO** | `'observe-only'::text` | - |
| rungs | `jsonb` | **NO** | - | - |
| evaluated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `merge_witness_telemetry_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_merge_witness_telemetry_evaluated_at`
  ```sql
  CREATE INDEX idx_merge_witness_telemetry_evaluated_at ON public.merge_witness_telemetry USING btree (evaluated_at DESC)
  ```
- `idx_merge_witness_telemetry_lane_evaluated_at`
  ```sql
  CREATE INDEX idx_merge_witness_telemetry_lane_evaluated_at ON public.merge_witness_telemetry USING btree (lane, evaluated_at DESC)
  ```
- `idx_merge_witness_telemetry_pr`
  ```sql
  CREATE INDEX idx_merge_witness_telemetry_pr ON public.merge_witness_telemetry USING btree (pr_number)
  ```
- `merge_witness_telemetry_pkey`
  ```sql
  CREATE UNIQUE INDEX merge_witness_telemetry_pkey ON public.merge_witness_telemetry USING btree (id)
  ```

## RLS Policies

### 1. merge_witness_telemetry_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. merge_witness_telemetry_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
