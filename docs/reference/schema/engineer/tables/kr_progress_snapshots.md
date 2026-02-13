# kr_progress_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T11:29:54.192Z
**Rows**: 10
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| key_result_id | `uuid` | YES | - | - |
| snapshot_date | `date` | **NO** | `CURRENT_DATE` | - |
| value | `numeric` | **NO** | - | - |
| notes | `text` | YES | - | - |
| created_by | `text` | YES | `'system'::text` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `kr_progress_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `kr_progress_snapshots_key_result_id_fkey`: key_result_id → key_results(id)

### Unique Constraints
- `kr_progress_snapshots_key_result_id_snapshot_date_key`: UNIQUE (key_result_id, snapshot_date)

## Indexes

- `idx_kr_snapshots_date`
  ```sql
  CREATE INDEX idx_kr_snapshots_date ON public.kr_progress_snapshots USING btree (snapshot_date)
  ```
- `idx_kr_snapshots_kr_id`
  ```sql
  CREATE INDEX idx_kr_snapshots_kr_id ON public.kr_progress_snapshots USING btree (key_result_id)
  ```
- `kr_progress_snapshots_key_result_id_snapshot_date_key`
  ```sql
  CREATE UNIQUE INDEX kr_progress_snapshots_key_result_id_snapshot_date_key ON public.kr_progress_snapshots USING btree (key_result_id, snapshot_date)
  ```
- `kr_progress_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX kr_progress_snapshots_pkey ON public.kr_progress_snapshots USING btree (id)
  ```

## RLS Policies

### 1. Chairman full access on kr_progress_snapshots (ALL)

- **Roles**: {authenticated}
- **Using**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`
- **With Check**: `((auth.jwt() ->> 'email'::text) = 'rick@emeraldholdingsgroup.com'::text)`

### 2. Service role bypass on kr_progress_snapshots (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
