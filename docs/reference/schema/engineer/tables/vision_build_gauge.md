# vision_build_gauge Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 631
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| overall_pct | `integer(32)` | YES | - | - |
| available | `boolean` | **NO** | `true` | - |
| per_layer | `jsonb` | **NO** | `'{}'::jsonb` | - |
| components | `jsonb` | **NO** | `'[]'::jsonb` | - |
| denominator | `integer(32)` | **NO** | `0` | - |
| total_capabilities | `integer(32)` | **NO** | `0` | - |
| unknown_count | `integer(32)` | **NO** | `0` | - |
| source | `text` | **NO** | `'vdr'::text` | - |
| measured_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `vision_build_gauge_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_vision_build_gauge_measured_at`
  ```sql
  CREATE INDEX idx_vision_build_gauge_measured_at ON public.vision_build_gauge USING btree (measured_at DESC)
  ```
- `vision_build_gauge_pkey`
  ```sql
  CREATE UNIQUE INDEX vision_build_gauge_pkey ON public.vision_build_gauge USING btree (id)
  ```

## RLS Policies

### 1. vision_build_gauge_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. vision_build_gauge_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
