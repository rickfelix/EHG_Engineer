# telemetry_analysis_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T13:25:26.330Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (20 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | **NO** | - | - |
| scope_type | `text` | **NO** | `'workspace'::text` | - |
| scope_id | `text` | YES | - | - |
| status | `text` | **NO** | `'QUEUED'::text` | - |
| triggered_by | `text` | **NO** | `'SESSION_START'::text` | - |
| triggered_at | `timestamp with time zone` | **NO** | `now()` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| finished_at | `timestamp with time zone` | YES | - | - |
| correlation_id | `text` | YES | - | - |
| output_ref | `jsonb` | YES | - | - |
| findings_count | `integer(32)` | YES | `0` | - |
| top_bottleneck_category | `text` | YES | - | - |
| reason_code | `text` | YES | - | - |
| error_class | `text` | YES | - | - |
| error_message | `text` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `telemetry_analysis_runs_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `telemetry_analysis_runs_run_id_key`: UNIQUE (run_id)

### Check Constraints
- `telemetry_analysis_runs_scope_type_check`: CHECK ((scope_type = ANY (ARRAY['workspace'::text, 'user'::text, 'global'::text])))
- `telemetry_analysis_runs_status_check`: CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'TIMED_OUT'::text, 'CANCELLED'::text, 'FAILED_ENQUEUE'::text])))
- `telemetry_analysis_runs_triggered_by_check`: CHECK ((triggered_by = ANY (ARRAY['SESSION_START'::text, 'MANUAL'::text, 'SCHEDULED'::text, 'CLI'::text])))

## Indexes

- `idx_telemetry_runs_active`
  ```sql
  CREATE INDEX idx_telemetry_runs_active ON public.telemetry_analysis_runs USING btree (scope_type, scope_id, status) WHERE (status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text]))
  ```
- `idx_telemetry_runs_correlation`
  ```sql
  CREATE INDEX idx_telemetry_runs_correlation ON public.telemetry_analysis_runs USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)
  ```
- `idx_telemetry_runs_scope_status`
  ```sql
  CREATE INDEX idx_telemetry_runs_scope_status ON public.telemetry_analysis_runs USING btree (scope_type, scope_id, status, finished_at DESC)
  ```
- `telemetry_analysis_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX telemetry_analysis_runs_pkey ON public.telemetry_analysis_runs USING btree (id)
  ```
- `telemetry_analysis_runs_run_id_key`
  ```sql
  CREATE UNIQUE INDEX telemetry_analysis_runs_run_id_key ON public.telemetry_analysis_runs USING btree (run_id)
  ```

## RLS Policies

### 1. telemetry_analysis_runs_anon_read (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. telemetry_analysis_runs_service_all (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_telemetry_runs_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_telemetry_runs_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
