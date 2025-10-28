# governance_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| table_name | `character varying(100)` | **NO** | - | - |
| record_id | `character varying(100)` | **NO** | - | - |
| operation | `character varying(20)` | **NO** | - | - |
| old_values | `jsonb` | YES | - | - |
| new_values | `jsonb` | YES | - | - |
| changed_by | `character varying(100)` | YES | - | - |
| changed_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |
| change_reason | `text` | YES | - | - |
| ip_address | `inet` | YES | - | - |
| user_agent | `text` | YES | - | - |

## Constraints

### Primary Key
- `governance_audit_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `governance_audit_log_operation_check`: CHECK (((operation)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'STATE_CHANGE'::character varying])::text[])))

## Indexes

- `governance_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX governance_audit_log_pkey ON public.governance_audit_log USING btree (id)
  ```
- `idx_audit_record`
  ```sql
  CREATE INDEX idx_audit_record ON public.governance_audit_log USING btree (record_id)
  ```
- `idx_audit_table`
  ```sql
  CREATE INDEX idx_audit_table ON public.governance_audit_log USING btree (table_name)
  ```
- `idx_audit_timestamp`
  ```sql
  CREATE INDEX idx_audit_timestamp ON public.governance_audit_log USING btree (changed_at DESC)
  ```
- `idx_audit_user`
  ```sql
  CREATE INDEX idx_audit_user ON public.governance_audit_log USING btree (changed_by)
  ```

## RLS Policies

### 1. authenticated_read_governance_audit_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_governance_audit_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
