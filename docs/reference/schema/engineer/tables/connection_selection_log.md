# connection_selection_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-14T14:46:52.935Z
**Rows**: 650
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| service_name | `text` | **NO** | - | - |
| method_selected | `text` | **NO** | - | - |
| method_rank | `integer(32)` | YES | - | - |
| methods_skipped | `jsonb` | YES | `'[]'::jsonb` | - |
| selection_duration_ms | `integer(32)` | YES | - | - |
| caller | `text` | YES | - | - |
| success | `boolean` | YES | - | - |
| error_message | `text` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `connection_selection_log_pkey`: PRIMARY KEY (id)

## Indexes

- `connection_selection_log_pkey`
  ```sql
  CREATE UNIQUE INDEX connection_selection_log_pkey ON public.connection_selection_log USING btree (id)
  ```
- `idx_connection_selection_log_service`
  ```sql
  CREATE INDEX idx_connection_selection_log_service ON public.connection_selection_log USING btree (service_name, created_at DESC)
  ```

## RLS Policies

### 1. service_role_full_access (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
