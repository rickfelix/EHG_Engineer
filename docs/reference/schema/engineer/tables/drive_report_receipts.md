# drive_report_receipts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-08-22T17:33:48.904Z
**Rows**: 26
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (5 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| report_id | `uuid` | **NO** | - | - |
| lane | `text` | **NO** | - | - |
| consumed_at | `timestamp with time zone` | **NO** | `now()` | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `drive_report_receipts_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `drive_report_receipts_report_id_fkey`: report_id → drive_reports(id)

### Unique Constraints
- `drive_report_receipts_report_lane_uniq`: UNIQUE (report_id, lane)

### Check Constraints
- `drive_report_receipts_lane_check`: CHECK ((lane = ANY (ARRAY['coordinator'::text, 'adam'::text, 'chairman_brief'::text])))

## Indexes

- `drive_report_receipts_lane_consumed_idx`
  ```sql
  CREATE INDEX drive_report_receipts_lane_consumed_idx ON public.drive_report_receipts USING btree (lane, consumed_at DESC)
  ```
- `drive_report_receipts_pkey`
  ```sql
  CREATE UNIQUE INDEX drive_report_receipts_pkey ON public.drive_report_receipts USING btree (id)
  ```
- `drive_report_receipts_report_idx`
  ```sql
  CREATE INDEX drive_report_receipts_report_idx ON public.drive_report_receipts USING btree (report_id)
  ```
- `drive_report_receipts_report_lane_uniq`
  ```sql
  CREATE UNIQUE INDEX drive_report_receipts_report_lane_uniq ON public.drive_report_receipts USING btree (report_id, lane)
  ```

## RLS Policies

### 1. drive_report_receipts_service_role (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
