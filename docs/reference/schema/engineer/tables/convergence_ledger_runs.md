# convergence_ledger_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 5
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| run_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| subject_venture_id | `uuid` | YES | - | - |
| dummy_kind | `text` | YES | - | - |
| sandbox_repo | `text` | YES | - | - |
| started_at | `timestamp with time zone` | **NO** | `now()` | - |
| ended_at | `timestamp with time zone` | YES | - | - |
| status | `text` | **NO** | `'active'::text` | - |
| harvest | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `convergence_ledger_runs_pkey`: PRIMARY KEY (run_id)

### Check Constraints
- `convergence_ledger_runs_dummy_kind_check`: CHECK (((dummy_kind IS NULL) OR (dummy_kind = ANY (ARRAY['non_clone'::text, 'clone'::text]))))
- `convergence_ledger_runs_status_check`: CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'aborted'::text, 'clean'::text])))

## Indexes

- `convergence_ledger_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX convergence_ledger_runs_pkey ON public.convergence_ledger_runs USING btree (run_id)
  ```
- `idx_clr_started_at`
  ```sql
  CREATE INDEX idx_clr_started_at ON public.convergence_ledger_runs USING btree (started_at DESC)
  ```
- `idx_clr_status`
  ```sql
  CREATE INDEX idx_clr_status ON public.convergence_ledger_runs USING btree (status)
  ```
- `idx_clr_subject_venture`
  ```sql
  CREATE INDEX idx_clr_subject_venture ON public.convergence_ledger_runs USING btree (subject_venture_id) WHERE (subject_venture_id IS NOT NULL)
  ```

## RLS Policies

### 1. manage_convergence_ledger_runs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_convergence_ledger_runs (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_clr_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_convergence_ledger_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
