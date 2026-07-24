# coverage_matrix_rotation_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 1
**RLS**: Disabled

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| ran_at | `timestamp with time zone` | **NO** | `now()` | - |
| delta_summary | `jsonb` | **NO** | `'{}'::jsonb` | - |
| sample_verified_keys | `jsonb` | **NO** | `'[]'::jsonb` | - |
| coverage_question_feedback_ids | `jsonb` | **NO** | `'[]'::jsonb` | - |

## Constraints

### Primary Key
- `coverage_matrix_rotation_runs_pkey`: PRIMARY KEY (id)

## Indexes

- `coverage_matrix_rotation_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX coverage_matrix_rotation_runs_pkey ON public.coverage_matrix_rotation_runs USING btree (id)
  ```
- `idx_coverage_matrix_rotation_runs_month`
  ```sql
  CREATE UNIQUE INDEX idx_coverage_matrix_rotation_runs_month ON public.coverage_matrix_rotation_runs USING btree (date_trunc('month'::text, (ran_at AT TIME ZONE 'UTC'::text)))
  ```

---

[← Back to Schema Overview](../database-schema-overview.md)
