# pipeline_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| metric_name | `text` | **NO** | - | - |
| metric_value | `numeric` | **NO** | - | - |
| labels | `jsonb` | YES | `'{}'::jsonb` | - |
| recorded_at | `timestamp with time zone` | YES | `now()` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `pipeline_metrics_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_pipeline_metrics_labels`
  ```sql
  CREATE INDEX idx_pipeline_metrics_labels ON public.pipeline_metrics USING gin (labels)
  ```
- `idx_pipeline_metrics_name_time`
  ```sql
  CREATE INDEX idx_pipeline_metrics_name_time ON public.pipeline_metrics USING btree (metric_name, recorded_at DESC)
  ```
- `pipeline_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX pipeline_metrics_pkey ON public.pipeline_metrics USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can read pipeline_metrics (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. Service role full access to pipeline_metrics (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
