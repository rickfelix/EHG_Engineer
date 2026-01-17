# submission_steps Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-17T11:36:37.316Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| submission_id | `character varying(255)` | YES | - | - |
| step_number | `integer(32)` | **NO** | - | - |
| step_name | `character varying(100)` | **NO** | - | - |
| step_data | `jsonb` | YES | - | - |
| validation_passed | `boolean` | YES | `false` | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `submission_steps_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `submission_steps_submission_id_fkey`: submission_id → directive_submissions(submission_id)

### Unique Constraints
- `submission_steps_submission_id_step_number_key`: UNIQUE (submission_id, step_number)

## Indexes

- `idx_steps_submission`
  ```sql
  CREATE INDEX idx_steps_submission ON public.submission_steps USING btree (submission_id)
  ```
- `submission_steps_pkey`
  ```sql
  CREATE UNIQUE INDEX submission_steps_pkey ON public.submission_steps USING btree (id)
  ```
- `submission_steps_submission_id_step_number_key`
  ```sql
  CREATE UNIQUE INDEX submission_steps_submission_id_step_number_key ON public.submission_steps USING btree (submission_id, step_number)
  ```

## RLS Policies

### 1. authenticated_read_submission_steps (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_submission_steps (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
