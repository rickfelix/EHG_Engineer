# outcome_signals Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T04:05:18.684Z
**Rows**: 117
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (6 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| signal_type | `text` | **NO** | - | - |
| sd_id | `character varying(50)` | **NO** | - | - |
| source_feedback_id | `uuid` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `outcome_signals_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `outcome_signals_sd_id_fkey`: sd_id → strategic_directives_v2(id)

## Indexes

- `idx_outcome_signals_sd_id_created_at`
  ```sql
  CREATE INDEX idx_outcome_signals_sd_id_created_at ON public.outcome_signals USING btree (sd_id, created_at)
  ```
- `idx_outcome_signals_signal_type`
  ```sql
  CREATE INDEX idx_outcome_signals_signal_type ON public.outcome_signals USING btree (signal_type)
  ```
- `outcome_signals_pkey`
  ```sql
  CREATE UNIQUE INDEX outcome_signals_pkey ON public.outcome_signals USING btree (id)
  ```
- `uniq_outcome_signals_completion`
  ```sql
  CREATE UNIQUE INDEX uniq_outcome_signals_completion ON public.outcome_signals USING btree (signal_type, sd_id) WHERE ((signal_type = 'sd_completion'::text) AND (source_feedback_id IS NULL))
  ```
- `uniq_outcome_signals_recurrence`
  ```sql
  CREATE UNIQUE INDEX uniq_outcome_signals_recurrence ON public.outcome_signals USING btree (signal_type, sd_id, source_feedback_id) WHERE (source_feedback_id IS NOT NULL)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
