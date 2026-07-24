# adam_adherence_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 960
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | **NO** | - | - |
| probe | `text` | **NO** | - | - |
| duty | `text` | **NO** | - | - |
| verdict | `text` | **NO** | - | - |
| detail | `text` | YES | - | - |
| remediation_ref | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `adam_adherence_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `adam_adherence_ledger_verdict_check`: CHECK ((verdict = ANY (ARRAY['pass'::text, 'fail'::text, 'unknown'::text])))

## Indexes

- `adam_adherence_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX adam_adherence_ledger_pkey ON public.adam_adherence_ledger USING btree (id)
  ```
- `idx_adam_adherence_ledger_created`
  ```sql
  CREATE INDEX idx_adam_adherence_ledger_created ON public.adam_adherence_ledger USING btree (created_at DESC)
  ```
- `idx_adam_adherence_ledger_run`
  ```sql
  CREATE INDEX idx_adam_adherence_ledger_run ON public.adam_adherence_ledger USING btree (run_id)
  ```

## RLS Policies

### 1. adam_adherence_ledger_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. adam_adherence_ledger_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
