# sd_baseline_items Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-24T02:31:56.951Z
**Rows**: 203
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| baseline_id | `uuid` | **NO** | - | - |
| sd_id | `text` | **NO** | - | - |
| sequence_rank | `integer(32)` | **NO** | - | - |
| track | `text` | YES | - | - |
| track_name | `text` | YES | - | - |
| estimated_effort_hours | `numeric(6,2)` | YES | - | - |
| planned_start_date | `date` | YES | - | - |
| planned_end_date | `date` | YES | - | - |
| dependencies_snapshot | `jsonb` | YES | - | - |
| dependency_health_score | `numeric(3,2)` | YES | - | - |
| is_ready | `boolean` | YES | `false` | - |
| notes | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sd_baseline_items_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_baseline_items_baseline_id_fkey`: baseline_id → sd_execution_baselines(id)

### Unique Constraints
- `sd_baseline_items_baseline_id_sd_id_key`: UNIQUE (baseline_id, sd_id)

### Check Constraints
- `sd_baseline_items_track_check`: CHECK ((track = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'STANDALONE'::text, 'DEFERRED'::text])))

## Indexes

- `idx_baseline_items_baseline`
  ```sql
  CREATE INDEX idx_baseline_items_baseline ON public.sd_baseline_items USING btree (baseline_id)
  ```
- `idx_baseline_items_sd`
  ```sql
  CREATE INDEX idx_baseline_items_sd ON public.sd_baseline_items USING btree (sd_id)
  ```
- `idx_baseline_items_track`
  ```sql
  CREATE INDEX idx_baseline_items_track ON public.sd_baseline_items USING btree (track)
  ```
- `sd_baseline_items_baseline_id_sd_id_key`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_items_baseline_id_sd_id_key ON public.sd_baseline_items USING btree (baseline_id, sd_id)
  ```
- `sd_baseline_items_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_baseline_items_pkey ON public.sd_baseline_items USING btree (id)
  ```

## RLS Policies

### 1. Allow all for anon (ALL)

- **Roles**: {anon}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
