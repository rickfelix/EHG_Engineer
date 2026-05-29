# venture_telemetry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-05-29T20:31:15.577Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| application_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| contract_version | `text` | YES | - | - |
| window_days | `integer(32)` | YES | - | - |
| since | `timestamp with time zone` | YES | - | - |
| generated_at | `timestamp with time zone` | YES | - | - |
| total | `integer(32)` | **NO** | `0` | - |
| by_verdict | `jsonb` | **NO** | `'{}'::jsonb` | - |
| by_mode | `jsonb` | **NO** | `'{}'::jsonb` | - |
| by_model | `jsonb` | **NO** | `'{}'::jsonb` | - |
| avg_confidence | `numeric` | YES | - | - |
| dry_run_count | `integer(32)` | YES | - | - |
| raw_payload | `jsonb` | YES | - | - |
| source_url | `text` | YES | - | - |
| http_status | `integer(32)` | YES | - | - |
| ingest_status | `text` | **NO** | `'ok'::text` | - |
| ingest_note | `text` | YES | - | - |
| pulled_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `venture_telemetry_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `venture_telemetry_application_id_fkey`: application_id → applications(id)
- `venture_telemetry_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `uq_venture_telemetry_application`: UNIQUE (application_id)

### Check Constraints
- `venture_telemetry_ingest_status_check`: CHECK ((ingest_status = ANY (ARRAY['ok'::text, 'skipped'::text, 'version_mismatch'::text, 'error'::text])))

## Indexes

- `idx_venture_telemetry_application_id`
  ```sql
  CREATE INDEX idx_venture_telemetry_application_id ON public.venture_telemetry USING btree (application_id)
  ```
- `idx_venture_telemetry_pulled_at`
  ```sql
  CREATE INDEX idx_venture_telemetry_pulled_at ON public.venture_telemetry USING btree (pulled_at DESC)
  ```
- `uq_venture_telemetry_application`
  ```sql
  CREATE UNIQUE INDEX uq_venture_telemetry_application ON public.venture_telemetry USING btree (application_id)
  ```
- `venture_telemetry_pkey`
  ```sql
  CREATE UNIQUE INDEX venture_telemetry_pkey ON public.venture_telemetry USING btree (id)
  ```

## RLS Policies

### 1. venture_telemetry_read (SELECT)

- **Roles**: {anon,authenticated}
- **Using**: `true`

### 2. venture_telemetry_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
