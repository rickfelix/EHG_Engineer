# grill_convergence_artifacts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-06-02T12:13:54.400Z
**Rows**: 205
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (17 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| fixture_id | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| question_hash | `text` | YES | - | - |
| converged | `boolean` | **NO** | `false` | - |
| converged_answer | `text` | YES | - | - |
| rounds_used | `integer(32)` | **NO** | `0` | - |
| rounds_executed | `integer(32)` | **NO** | `0` | - |
| total_llm_calls | `integer(32)` | **NO** | `0` | - |
| cost_capped | `boolean` | **NO** | `false` | - |
| dissent | `jsonb` | **NO** | `'[]'::jsonb` | - |
| dissent_count | `integer(32)` | **NO** | `0` | - |
| sampling_t | `numeric(4,3)` | **NO** | `0.000` | - |
| samples_per_agent | `integer(32)` | **NO** | `3` | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| ended_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `grill_convergence_artifacts_pkey`: PRIMARY KEY (id)

## Indexes

- `grill_convergence_artifacts_pkey`
  ```sql
  CREATE UNIQUE INDEX grill_convergence_artifacts_pkey ON public.grill_convergence_artifacts USING btree (id)
  ```
- `idx_grill_artifacts_fixture`
  ```sql
  CREATE INDEX idx_grill_artifacts_fixture ON public.grill_convergence_artifacts USING btree (fixture_id)
  ```
- `idx_grill_artifacts_qhash`
  ```sql
  CREATE INDEX idx_grill_artifacts_qhash ON public.grill_convergence_artifacts USING btree (question_hash)
  ```
- `idx_grill_artifacts_sd`
  ```sql
  CREATE INDEX idx_grill_artifacts_sd ON public.grill_convergence_artifacts USING btree (sd_id)
  ```

## RLS Policies

### 1. grill_artifacts_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. grill_artifacts_service_write (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
