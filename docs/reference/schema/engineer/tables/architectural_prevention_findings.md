# architectural_prevention_findings Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-28T13:36:48.100Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| source_rca_id | `uuid` | **NO** | - | - |
| source_sd_key | `text` | YES | - | - |
| finding | `text` | **NO** | - | - |
| suggested_deepening | `text` | YES | - | - |
| weekly_report_consumed_at | `timestamp with time zone` | YES | - | - |
| deleted_at | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | **NO** | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `architectural_prevention_findings_pkey`: PRIMARY KEY (id)

## Indexes

- `architectural_prevention_findings_pkey`
  ```sql
  CREATE UNIQUE INDEX architectural_prevention_findings_pkey ON public.architectural_prevention_findings USING btree (id)
  ```
- `idx_apf_rca_sd_alive`
  ```sql
  CREATE UNIQUE INDEX idx_apf_rca_sd_alive ON public.architectural_prevention_findings USING btree (source_rca_id, source_sd_key) WHERE (deleted_at IS NULL)
  ```
- `idx_arch_prev_source_rca`
  ```sql
  CREATE INDEX idx_arch_prev_source_rca ON public.architectural_prevention_findings USING btree (source_rca_id)
  ```
- `idx_arch_prev_source_sd`
  ```sql
  CREATE INDEX idx_arch_prev_source_sd ON public.architectural_prevention_findings USING btree (source_sd_key)
  ```
- `idx_arch_prev_unconsumed`
  ```sql
  CREATE INDEX idx_arch_prev_unconsumed ON public.architectural_prevention_findings USING btree (created_at) WHERE ((deleted_at IS NULL) AND (weekly_report_consumed_at IS NULL))
  ```

## RLS Policies

### 1. arch_prev_authenticated_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. arch_prev_service_write (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
