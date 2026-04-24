# marketing_pipeline_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-24T02:57:22.920Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| pipeline_type | `text` | **NO** | - | - |
| invocation_id | `text` | **NO** | - | - |
| status | `text` | **NO** | `'started'::text` | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| error_details | `jsonb` | YES | - | - |
| metrics | `jsonb` | **NO** | `'{}'::jsonb` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `marketing_pipeline_runs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `marketing_pipeline_runs_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `marketing_pipeline_runs_invocation_id_key`: UNIQUE (invocation_id)

### Check Constraints
- `marketing_pipeline_runs_status_check`: CHECK ((status = ANY (ARRAY['started'::text, 'running'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_marketing_pipeline_runs_status`
  ```sql
  CREATE INDEX idx_marketing_pipeline_runs_status ON public.marketing_pipeline_runs USING btree (status, started_at DESC) WHERE (status = ANY (ARRAY['started'::text, 'running'::text, 'failed'::text]))
  ```
- `idx_marketing_pipeline_runs_venture_type`
  ```sql
  CREATE INDEX idx_marketing_pipeline_runs_venture_type ON public.marketing_pipeline_runs USING btree (venture_id, pipeline_type, started_at DESC)
  ```
- `marketing_pipeline_runs_invocation_id_key`
  ```sql
  CREATE UNIQUE INDEX marketing_pipeline_runs_invocation_id_key ON public.marketing_pipeline_runs USING btree (invocation_id)
  ```
- `marketing_pipeline_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX marketing_pipeline_runs_pkey ON public.marketing_pipeline_runs USING btree (id)
  ```

## RLS Policies

### 1. service_role_all_marketing_pipeline_runs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. venture_read_marketing_pipeline_runs (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE ((auth.uid())::text = (ventures.created_by)::text)))`

---

[← Back to Schema Overview](../database-schema-overview.md)
