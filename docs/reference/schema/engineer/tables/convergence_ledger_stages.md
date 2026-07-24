# convergence_ledger_stages Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | **NO** | - | - |
| stage | `integer(32)` | **NO** | - | - |
| entered_at | `timestamp with time zone` | YES | - | - |
| fix_cycle_count | `integer(32)` | **NO** | `0` | - |
| issues_found | `integer(32)` | **NO** | `0` | - |
| issues_resolved | `integer(32)` | **NO** | `0` | - |
| stage_status | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `convergence_ledger_stages_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `convergence_ledger_stages_run_id_fkey`: run_id → convergence_ledger_runs(run_id)

### Unique Constraints
- `convergence_ledger_stages_run_id_stage_key`: UNIQUE (run_id, stage)

### Check Constraints
- `convergence_ledger_stages_stage_check`: CHECK (((stage >= 0) AND (stage <= 26)))
- `convergence_ledger_stages_stage_status_check`: CHECK (((stage_status IS NULL) OR (stage_status = ANY (ARRAY['clean'::text, 'churning'::text, 'escalated'::text]))))

## Indexes

- `convergence_ledger_stages_pkey`
  ```sql
  CREATE UNIQUE INDEX convergence_ledger_stages_pkey ON public.convergence_ledger_stages USING btree (id)
  ```
- `convergence_ledger_stages_run_id_stage_key`
  ```sql
  CREATE UNIQUE INDEX convergence_ledger_stages_run_id_stage_key ON public.convergence_ledger_stages USING btree (run_id, stage)
  ```
- `idx_cls_run`
  ```sql
  CREATE INDEX idx_cls_run ON public.convergence_ledger_stages USING btree (run_id)
  ```

## RLS Policies

### 1. manage_convergence_ledger_stages (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. select_convergence_ledger_stages (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_cls_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION trg_convergence_ledger_updated_at()`

---

[← Back to Schema Overview](../database-schema-overview.md)
