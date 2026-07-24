# retention_archive Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 396,657
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_table | `text` | **NO** | - | - |
| source_id | `text` | YES | - | - |
| row_data | `jsonb` | **NO** | - | - |
| row_timestamp | `timestamp with time zone` | YES | - | - |
| archived_at | `timestamp with time zone` | **NO** | `now()` | - |
| archived_by | `text` | YES | - | - |
| run_id | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `retention_archive_pkey`: PRIMARY KEY (id)

## Indexes

- `idx_retention_archive_archived_at`
  ```sql
  CREATE INDEX idx_retention_archive_archived_at ON public.retention_archive USING btree (archived_at)
  ```
- `idx_retention_archive_run`
  ```sql
  CREATE INDEX idx_retention_archive_run ON public.retention_archive USING btree (run_id)
  ```
- `idx_retention_archive_source_ts`
  ```sql
  CREATE INDEX idx_retention_archive_source_ts ON public.retention_archive USING btree (source_table, row_timestamp)
  ```
- `retention_archive_pkey`
  ```sql
  CREATE UNIQUE INDEX retention_archive_pkey ON public.retention_archive USING btree (id)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
