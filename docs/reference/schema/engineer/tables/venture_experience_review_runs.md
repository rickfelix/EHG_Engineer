# venture_experience_review_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-09-15T16:18:27.599Z
**Rows**: 2
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| run_id | `text` | **NO** | - | - |
| run_mode | `text` | **NO** | - | - |
| findings_count_by_category | `jsonb` | **NO** | `'{}'::jsonb` | - |
| severity_breakdown | `jsonb` | **NO** | `'{}'::jsonb` | - |
| duration_ms | `integer(32)` | YES | - | - |
| token_usage | `jsonb` | **NO** | `'{}'::jsonb` | - |
| cost_usd | `numeric(10,4)` | YES | - | - |
| adapter_version | `text` | **NO** | `'1.0.0'::text` | - |
| deployment_url | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_experience_review_runs_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `venture_experience_review_runs_unique_run`: UNIQUE (venture_id, run_id)

### Check Constraints
- `venture_experience_review_runs_run_mode_check`: CHECK ((run_mode = ANY (ARRAY['in_traversal'::text, 'out_of_band_annex'::text])))

## Indexes

- `venture_experience_review_runs_created_idx`
  ```sql
  CREATE INDEX venture_experience_review_runs_created_idx ON public.venture_experience_review_runs USING btree (created_at)
  ```
- `venture_experience_review_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_experience_review_runs_pkey ON public.venture_experience_review_runs USING btree (id)
  ```
- `venture_experience_review_runs_unique_run`
  ```sql
  CREATE UNIQUE INDEX venture_experience_review_runs_unique_run ON public.venture_experience_review_runs USING btree (venture_id, run_id)
  ```
- `venture_experience_review_runs_venture_idx`
  ```sql
  CREATE INDEX venture_experience_review_runs_venture_idx ON public.venture_experience_review_runs USING btree (venture_id)
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
