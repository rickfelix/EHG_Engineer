# cascade_invalidation_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-02T01:18:17.458Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_table | `text` | **NO** | - | - |
| source_id | `uuid` | **NO** | - | - |
| source_key | `text` | YES | - | - |
| change_type | `text` | **NO** | - | - |
| old_version | `integer(32)` | YES | - | - |
| new_version | `integer(32)` | YES | - | - |
| changed_by | `text` | YES | - | - |
| change_summary | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `cascade_invalidation_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `cascade_invalidation_log_change_type_check`: CHECK ((change_type = ANY (ARRAY['version_bump'::text, 'content_update'::text, 'dimension_change'::text, 'status_change'::text])))

## Indexes

- `cascade_invalidation_log_pkey`
  ```sql
  CREATE UNIQUE INDEX cascade_invalidation_log_pkey ON public.cascade_invalidation_log USING btree (id)
  ```
- `idx_cascade_inv_log_source`
  ```sql
  CREATE INDEX idx_cascade_inv_log_source ON public.cascade_invalidation_log USING btree (source_table, source_id)
  ```

## RLS Policies

### 1. authenticated_read_cascade_log (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_cascade_log (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
