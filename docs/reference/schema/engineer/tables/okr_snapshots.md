# okr_snapshots Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-09T19:26:25.872Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| key_result_id | `uuid` | **NO** | - | - |
| snapshot_date | `date` | **NO** | - | - |
| current_value | `numeric` | YES | - | - |
| target_value | `numeric` | YES | - | - |
| confidence | `numeric(3,2)` | YES | - | Confidence score 0.00-1.00 that the key result will be achieved |
| status | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `okr_snapshots_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `okr_snapshots_key_result_id_fkey`: key_result_id → key_results(id)

### Unique Constraints
- `okr_snapshots_key_result_id_snapshot_date_key`: UNIQUE (key_result_id, snapshot_date)

## Indexes

- `idx_okr_snapshots_kr_date`
  ```sql
  CREATE INDEX idx_okr_snapshots_kr_date ON public.okr_snapshots USING btree (key_result_id, snapshot_date DESC)
  ```
- `okr_snapshots_key_result_id_snapshot_date_key`
  ```sql
  CREATE UNIQUE INDEX okr_snapshots_key_result_id_snapshot_date_key ON public.okr_snapshots USING btree (key_result_id, snapshot_date)
  ```
- `okr_snapshots_pkey`
  ```sql
  CREATE UNIQUE INDEX okr_snapshots_pkey ON public.okr_snapshots USING btree (id)
  ```

## RLS Policies

### 1. Authenticated users can read (SELECT)

- **Roles**: {public}
- **Using**: `(auth.role() = 'authenticated'::text)`

### 2. Service role full access (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
