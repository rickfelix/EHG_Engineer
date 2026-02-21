# operations_audit_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T13:23:45.333Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| entity_type | `character varying(100)` | **NO** | - | - |
| entity_id | `text` | YES | - | - |
| action | `character varying(100)` | **NO** | - | - |
| performed_by | `uuid` | YES | - | - |
| performed_at | `timestamp without time zone` | YES | `now()` | - |
| module | `character varying(50)` | YES | - | - |
| severity | `character varying(20)` | YES | `'info'::character varying` | - |
| metadata | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `operations_audit_log_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_ops_audit_module_time`
  ```sql
  CREATE INDEX idx_ops_audit_module_time ON public.operations_audit_log USING btree (module, performed_at DESC)
  ```
- `idx_ops_audit_severity_time`
  ```sql
  CREATE INDEX idx_ops_audit_severity_time ON public.operations_audit_log USING btree (severity, performed_at DESC) WHERE ((severity)::text = ANY ((ARRAY['warning'::character varying, 'error'::character varying, 'critical'::character varying])::text[]))
  ```
- `idx_ops_audit_user`
  ```sql
  CREATE INDEX idx_ops_audit_user ON public.operations_audit_log USING btree (performed_by)
  ```
- `operations_audit_log_pkey`
  ```sql
  CREATE UNIQUE INDEX operations_audit_log_pkey ON public.operations_audit_log USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_operations_audit_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_operations_audit_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
