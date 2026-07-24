# adam_delegated_apply_ledger Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 4
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| migration_path | `text` | YES | - | - |
| migration_sha256 | `text` | YES | - | - |
| delegatable | `boolean` | **NO** | - | - |
| delegatable_kind | `text` | YES | - | - |
| outcome | `text` | **NO** | - | - |
| reject_factor | `text` | YES | - | - |
| reason | `text` | YES | - | - |
| approval_basis | `text` | YES | - | - |
| approved_by | `text` | **NO** | `'adam (delegated)'::text` | - |
| success | `boolean` | YES | - | - |
| error | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `adam_delegated_apply_ledger_pkey`: PRIMARY KEY (id)

## Indexes

- `adam_delegated_apply_ledger_pkey`
  ```sql
  CREATE UNIQUE INDEX adam_delegated_apply_ledger_pkey ON public.adam_delegated_apply_ledger USING btree (id)
  ```
- `idx_adam_delegated_apply_ledger_created`
  ```sql
  CREATE INDEX idx_adam_delegated_apply_ledger_created ON public.adam_delegated_apply_ledger USING btree (created_at DESC)
  ```
- `idx_adam_delegated_apply_ledger_outcome`
  ```sql
  CREATE INDEX idx_adam_delegated_apply_ledger_outcome ON public.adam_delegated_apply_ledger USING btree (outcome)
  ```

## RLS Policies

### 1. adam_delegated_apply_ledger_read (SELECT)

- **Roles**: {public}
- **Using**: `((auth.role() = 'authenticated'::text) OR (auth.role() = 'service_role'::text))`

### 2. adam_delegated_apply_ledger_service_write (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
