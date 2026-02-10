# integrity_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-10T12:28:46.954Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source | `text` | **NO** | - | - |
| workflow_run_id | `bigint(64)` | YES | - | - |
| total_gaps | `integer(32)` | YES | `0` | - |
| sd_metadata_gaps | `integer(32)` | YES | `0` | - |
| prd_contract_gaps | `integer(32)` | YES | `0` | - |
| backlog_shape_issues | `integer(32)` | YES | `0` | - |
| traceability_gaps | `integer(32)` | YES | `0` | - |
| dependency_issues | `integer(32)` | YES | `0` | - |
| orphan_items | `integer(32)` | YES | `0` | - |
| stage_coverage_gaps | `integer(32)` | YES | `0` | - |
| stages_not_ready | `integer(32)` | YES | `0` | - |
| ventures_without_governance | `integer(32)` | YES | `0` | - |
| recommendation_count | `integer(32)` | YES | `0` | - |
| top_recommendations | `jsonb` | YES | `'[]'::jsonb` | - |
| previous_total_gaps | `integer(32)` | YES | - | - |
| gap_delta | `integer(32)` | YES | - | - |
| status | `text` | YES | `'success'::text` | - |
| execution_time_ms | `integer(32)` | YES | - | - |
| dry_run | `boolean` | YES | `false` | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `integrity_metrics_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `unique_workflow_run`: UNIQUE (source, workflow_run_id)

## Indexes

- `idx_integrity_metrics_created`
  ```sql
  CREATE INDEX idx_integrity_metrics_created ON public.integrity_metrics USING btree (created_at DESC)
  ```
- `idx_integrity_metrics_source`
  ```sql
  CREATE INDEX idx_integrity_metrics_source ON public.integrity_metrics USING btree (source)
  ```
- `idx_integrity_metrics_total_gaps`
  ```sql
  CREATE INDEX idx_integrity_metrics_total_gaps ON public.integrity_metrics USING btree (total_gaps)
  ```
- `integrity_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX integrity_metrics_pkey ON public.integrity_metrics USING btree (id)
  ```
- `unique_workflow_run`
  ```sql
  CREATE UNIQUE INDEX unique_workflow_run ON public.integrity_metrics USING btree (source, workflow_run_id)
  ```

## RLS Policies

### 1. authenticated_read_integrity_metrics (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_integrity_metrics (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
