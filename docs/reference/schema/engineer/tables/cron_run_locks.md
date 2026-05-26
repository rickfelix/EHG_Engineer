# cron_run_locks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-26T21:15:18.825Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| name | `text` | **NO** | - | - |
| owner | `uuid` | **NO** | - | - |
| locked_at | `timestamp with time zone` | **NO** | `now()` | - |
| expires_at | `timestamp with time zone` | **NO** | - | - |

## Constraints

### Primary Key
- `cron_run_locks_pkey`: PRIMARY KEY (name)

## Indexes

- `cron_run_locks_pkey`
  ```sql
  CREATE UNIQUE INDEX cron_run_locks_pkey ON public.cron_run_locks USING btree (name)
  ```

## RLS Policies

### 1. cron_run_locks_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
