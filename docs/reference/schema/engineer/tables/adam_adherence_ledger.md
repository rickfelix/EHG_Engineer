# adam_adherence_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 2,964
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

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
| check_class | `text` | YES | - | What this verdict is a claim ABOUT: duty = the duty is wired (a presence check); conduct = behaviour complied (read live behaviour). NULL means the row predates classification and asserts NOTHING — it must never be read as duty. SD-LEO-INFRA-ROLE-SESSION-SELF-001 FR-2. |

## Constraints

### Primary Key
- `adam_adherence_ledger_pkey`: PRIMARY KEY (id)

### Check Constraints
- `adam_adherence_ledger_check_class_check`: CHECK (((check_class IS NULL) OR (check_class = ANY (ARRAY['duty'::text, 'conduct'::text]))))
- `adam_adherence_ledger_verdict_check`: CHECK ((verdict = ANY (ARRAY['pass'::text, 'fail'::text, 'unknown'::text])))

## Indexes

- `adam_adherence_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX adam_adherence_ledger_pkey ON public.adam_adherence_ledger USING btree (id)
  ```
- `idx_adam_adherence_ledger_check_class`
  ```sql
  CREATE INDEX idx_adam_adherence_ledger_check_class ON public.adam_adherence_ledger USING btree (check_class, created_at DESC) WHERE (check_class IS NOT NULL)
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
