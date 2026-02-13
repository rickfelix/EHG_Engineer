# auto_apply_allowlist Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T00:14:08.377Z
**Rows**: 6
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| table_name | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `text` | **NO** | `'migration'::text` | - |

## Constraints

### Primary Key
- `auto_apply_allowlist_pkey`: PRIMARY KEY (table_name)

## Indexes

- `auto_apply_allowlist_pkey`
  ```sql
  CREATE UNIQUE INDEX auto_apply_allowlist_pkey ON public.auto_apply_allowlist USING btree (table_name)
  ```

## RLS Policies

### 1. Allow read access to auto_apply_allowlist (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role can modify auto_apply_allowlist (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
