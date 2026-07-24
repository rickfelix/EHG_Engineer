# retention_runs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 20
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| ran_at | `timestamp with time zone` | **NO** | `now()` | - |
| mode | `text` | **NO** | - | - |
| caps | `jsonb` | YES | - | - |
| per_table | `jsonb` | YES | - | - |
| duration_ms | `integer(32)` | YES | - | - |
| ran_by | `text` | YES | - | - |

## Constraints

### Primary Key
- `retention_runs_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_retention_runs_ran_at`
  ```sql
  CREATE INDEX idx_retention_runs_ran_at ON public.retention_runs USING btree (ran_at DESC)
  ```
- `retention_runs_pkey`
  ```sql
  CREATE UNIQUE INDEX retention_runs_pkey ON public.retention_runs USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
