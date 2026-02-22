# sd_execution_actuals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-22T16:51:20.959Z
**Rows**: 15
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `text` | **NO** | - | - |
| baseline_id | `uuid` | YES | - | - |
| actual_start_date | `timestamp with time zone` | YES | - | - |
| actual_end_date | `timestamp with time zone` | YES | - | - |
| actual_effort_hours | `numeric(6,2)` | YES | - | - |
| status | `text` | YES | `'not_started'::text` | - |
| blockers | `jsonb` | YES | `'[]'::jsonb` | - |
| blocked_by_sd_ids | `ARRAY` | YES | - | - |
| blocked_since | `timestamp with time zone` | YES | - | - |
| completion_notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_execution_actuals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_execution_actuals_baseline_id_fkey`: baseline_id → sd_execution_baselines(id)

### Unique Constraints
- `sd_execution_actuals_sd_id_baseline_id_key`: UNIQUE (sd_id, baseline_id)

### Check Constraints
- `sd_execution_actuals_status_check`: CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'blocked'::text, 'deferred'::text])))

## Indexes

- `idx_execution_actuals_baseline`
  ```sql
  CREATE INDEX idx_execution_actuals_baseline ON public.sd_execution_actuals USING btree (baseline_id)
  ```
- `idx_execution_actuals_sd`
  ```sql
  CREATE INDEX idx_execution_actuals_sd ON public.sd_execution_actuals USING btree (sd_id)
  ```
- `idx_execution_actuals_status`
  ```sql
  CREATE INDEX idx_execution_actuals_status ON public.sd_execution_actuals USING btree (status)
  ```
- `sd_execution_actuals_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_execution_actuals_pkey ON public.sd_execution_actuals USING btree (id)
  ```
- `sd_execution_actuals_sd_id_baseline_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_execution_actuals_sd_id_baseline_id_key ON public.sd_execution_actuals USING btree (sd_id, baseline_id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### tr_execution_actuals_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_execution_actuals_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
