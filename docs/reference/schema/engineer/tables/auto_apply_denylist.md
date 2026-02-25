# auto_apply_denylist Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-25T20:22:28.434Z
**Rows**: 18
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
- `auto_apply_denylist_pkey`: PRIMARY KEY (table_name)

## Indexes

- `auto_apply_denylist_pkey`
  ```sql
  CREATE UNIQUE INDEX auto_apply_denylist_pkey ON public.auto_apply_denylist USING btree (table_name)
  ```

## RLS Policies

### 1. Allow read access to auto_apply_denylist (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. Service role can modify auto_apply_denylist (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
