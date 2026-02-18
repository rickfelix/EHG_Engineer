# leo_execution_jobs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-18T19:52:25.488Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| proposal_id | `uuid` | YES | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| priority | `integer(32)` | **NO** | `50` | - |
| queue_name | `text` | **NO** | `'standard_queue'::text` | - |
| started_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| result | `jsonb` | YES | `'{}'::jsonb` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_execution_jobs_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_execution_jobs_proposal_id_fkey`: proposal_id → leo_proposals(id)

### Unique Constraints
- `uq_execution_job_proposal`: UNIQUE (proposal_id)

### Check Constraints
- `leo_execution_jobs_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))

## Indexes

- `idx_execution_jobs_queue`
  ```sql
  CREATE INDEX idx_execution_jobs_queue ON public.leo_execution_jobs USING btree (queue_name, status, priority DESC)
  ```
- `idx_execution_jobs_status`
  ```sql
  CREATE INDEX idx_execution_jobs_status ON public.leo_execution_jobs USING btree (status, priority DESC, created_at)
  ```
- `leo_execution_jobs_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_execution_jobs_pkey ON public.leo_execution_jobs USING btree (id)
  ```
- `uq_execution_job_proposal`
  ```sql
  CREATE UNIQUE INDEX uq_execution_job_proposal ON public.leo_execution_jobs USING btree (proposal_id)
  ```

## RLS Policies

### 1. Service role full access to leo_execution_jobs (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_execution_jobs_update_timestamp

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_execution_jobs_update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
