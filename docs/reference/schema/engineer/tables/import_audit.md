# import_audit Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-18T00:34:02.193Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('import_audit_id_seq'::regclass)` | - |
| import_run_id | `uuid` | YES | `gen_random_uuid()` | - |
| file_path | `text` | YES | - | - |
| file_checksum | `character varying(64)` | YES | - | - |
| tab_name | `character varying(100)` | YES | - | - |
| rows_processed | `integer(32)` | YES | - | - |
| rows_imported | `integer(32)` | YES | - | - |
| warnings | `jsonb` | YES | `'[]'::jsonb` | - |
| errors | `jsonb` | YES | `'[]'::jsonb` | - |
| status | `character varying(20)` | YES | - | - |
| dry_run | `boolean` | YES | `false` | - |
| import_metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `import_audit_pkey`: PRIMARY KEY (id)

## Indexes

- `import_audit_pkey`
  ```sql
  CREATE UNIQUE INDEX import_audit_pkey ON public.import_audit USING btree (id)
  ```

## RLS Policies

### 1. service_role_insert_import_audit (INSERT)

- **Roles**: {service_role}
- **With Check**: `true`

### 2. service_role_select_import_audit (SELECT)

- **Roles**: {service_role}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
