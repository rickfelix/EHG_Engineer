# leo_auto_exec_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| run_id | `uuid` | YES | - | - |
| action_class | `text` | YES | - | - |
| phase | `text` | YES | - | - |
| target | `text` | YES | - | - |
| decision | `jsonb` | YES | - | - |
| snapshot | `jsonb` | YES | - | - |
| outcome | `text` | YES | - | - |
| detail | `jsonb` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `leo_auto_exec_audit_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_leo_auto_exec_audit_created_at`
  ```sql
  CREATE INDEX idx_leo_auto_exec_audit_created_at ON public.leo_auto_exec_audit USING btree (created_at)
  ```
- `idx_leo_auto_exec_audit_run_id`
  ```sql
  CREATE INDEX idx_leo_auto_exec_audit_run_id ON public.leo_auto_exec_audit USING btree (run_id)
  ```
- `leo_auto_exec_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_auto_exec_audit_pkey ON public.leo_auto_exec_audit USING btree (id)
  ```

## RLS Policies

### 1. audit_insert_service_role (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. audit_select_engine_ro (SELECT)

- **Roles**: {leo_engine_ro}
- **Using**: `true`

### 3. audit_select_service_role (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

## Triggers

### trg_leo_auto_exec_audit_append_only

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION leo_auto_exec_audit_append_only()`

### trg_leo_auto_exec_audit_append_only

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_auto_exec_audit_append_only()`

---

[← Back to Schema Overview](../database-schema-overview.md)
