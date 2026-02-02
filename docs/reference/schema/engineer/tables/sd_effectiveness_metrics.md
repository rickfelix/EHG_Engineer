# sd_effectiveness_metrics Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T23:50:49.998Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| window_start | `timestamp with time zone` | **NO** | - | - |
| window_end | `timestamp with time zone` | **NO** | - | - |
| pre_feedback_count | `integer(32)` | **NO** | `0` | - |
| post_feedback_count | `integer(32)` | **NO** | `0` | - |
| delta_count | `integer(32)` | **NO** | `0` | - |
| pct_change | `numeric(10,4)` | YES | - | - |
| computed_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `sd_effectiveness_metrics_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_effectiveness_metrics_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_sd_effectiveness_metrics_sd_id`
  ```sql
  CREATE INDEX idx_sd_effectiveness_metrics_sd_id ON public.sd_effectiveness_metrics USING btree (sd_id)
  ```
- `sd_effectiveness_metrics_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_effectiveness_metrics_pkey ON public.sd_effectiveness_metrics USING btree (id)
  ```
- `uniq_sd_effectiveness_window`
  ```sql
  CREATE UNIQUE INDEX uniq_sd_effectiveness_window ON public.sd_effectiveness_metrics USING btree (sd_id, window_start, window_end)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
