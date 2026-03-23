# experiments Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-23T20:56:03.959Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `text` | **NO** | - | - |
| hypothesis | `text` | **NO** | - | - |
| variants | `jsonb` | **NO** | `'[]'::jsonb` | JSONB array of variant objects, each with key, name, and config |
| status | `text` | **NO** | `'draft'::text` | - |
| config | `jsonb` | YES | `'{}'::jsonb` | JSONB object for experiment-level configuration (sample size, duration, etc.) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |
| min_observations_per_variant | `integer(32)` | YES | `20` | Minimum gate outcomes per variant before declaring a winner |
| convergence_threshold | `numeric` | YES | `0.85` | P(variant > control) threshold for stopping (default 0.85) |
| maturity_hours | `integer(32)` | YES | `48` | Minimum hours after experiment creation before stopping allowed |
| survival_metric | `text` | YES | `'binary_per_gate'::text` | How survival is measured: binary_per_gate (pass/fail), composite (2-of-3), weighted (stage-weighted) |

## Constraints

### Primary Key
- `experiments_pkey`: PRIMARY KEY (id)

### Check Constraints
- `experiments_status_check`: CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'stopped'::text, 'archived'::text])))
- `experiments_survival_metric_check`: CHECK ((survival_metric = ANY (ARRAY['binary_per_gate'::text, 'composite'::text, 'weighted'::text])))

## Indexes

- `experiments_pkey`
  ```sql
  CREATE UNIQUE INDEX experiments_pkey ON public.experiments USING btree (id)
  ```
- `idx_experiments_status`
  ```sql
  CREATE INDEX idx_experiments_status ON public.experiments USING btree (status)
  ```

## RLS Policies

### 1. service_role_experiments (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
