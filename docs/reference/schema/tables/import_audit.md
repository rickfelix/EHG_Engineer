# import_audit Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

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

### 1. authenticated_read_import_audit (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_import_audit (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
