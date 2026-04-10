# stage_config_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-10T11:39:11.244Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| stage_number | `integer(32)` | **NO** | - | - |
| changed_column | `text` | **NO** | - | - |
| old_value | `text` | YES | - | - |
| new_value | `text` | YES | - | - |
| changed_by | `text` | **NO** | `CURRENT_USER` | - |
| changed_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `stage_config_audit_pkey`: PRIMARY KEY (id)

## Indexes

- `stage_config_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX stage_config_audit_pkey ON public.stage_config_audit USING btree (id)
  ```

## RLS Policies

### 1. deny_write_stage_config_audit (ALL)

- **Roles**: {authenticated}
- **Using**: `true`
- **With Check**: `false`

### 2. select_stage_config_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

## Triggers

### trg_stage_config_audit_immutable

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION fn_stage_config_audit_immutable()`

### trg_stage_config_audit_immutable

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_stage_config_audit_immutable()`

---

[← Back to Schema Overview](../database-schema-overview.md)
