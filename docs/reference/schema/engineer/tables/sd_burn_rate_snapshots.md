# sd_burn_rate_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-30T16:28:26.191Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| baseline_id | `uuid` | YES | - | - |
| snapshot_date | `date` | **NO** | - | - |
| total_sds_planned | `integer(32)` | YES | - | - |
| total_sds_completed | `integer(32)` | YES | - | - |
| total_effort_planned_hours | `numeric(8,2)` | YES | - | - |
| total_effort_actual_hours | `numeric(8,2)` | YES | - | - |
| planned_velocity | `numeric(6,2)` | YES | - | - |
| actual_velocity | `numeric(6,2)` | YES | - | - |
| burn_rate_ratio | `numeric(4,2)` | YES | - | - |
| forecasted_completion_date | `date` | YES | - | - |
| confidence_level | `text` | YES | - | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_burn_rate_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_burn_rate_snapshots_baseline_id_fkey`: baseline_id → sd_execution_baselines(id)

### Unique Constraints
- `sd_burn_rate_snapshots_baseline_id_snapshot_date_key`: UNIQUE (baseline_id, snapshot_date)

### Check Constraints
- `sd_burn_rate_snapshots_confidence_level_check`: CHECK ((confidence_level = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])))

## Indexes

- `idx_burn_rate_baseline`
  ```sql
  CREATE INDEX idx_burn_rate_baseline ON public.sd_burn_rate_snapshots USING btree (baseline_id)
  ```
- `idx_burn_rate_date`
  ```sql
  CREATE INDEX idx_burn_rate_date ON public.sd_burn_rate_snapshots USING btree (snapshot_date DESC)
  ```
- `sd_burn_rate_snapshots_baseline_id_snapshot_date_key`
  ```sql
  CREATE UNIQUE INDEX sd_burn_rate_snapshots_baseline_id_snapshot_date_key ON public.sd_burn_rate_snapshots USING btree (baseline_id, snapshot_date)
  ```
- `sd_burn_rate_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_burn_rate_snapshots_pkey ON public.sd_burn_rate_snapshots USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
