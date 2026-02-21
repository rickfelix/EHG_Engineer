# eva_event_log Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T13:23:45.333Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (11 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | - |
| trigger_source | `text` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| correlation_id | `uuid` | **NO** | - | - |
| status | `text` | **NO** | - | - |
| error_message | `text` | YES | - | - |
| job_name | `text` | YES | - | - |
| scheduled_time | `timestamp with time zone` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_event_log_pkey`: PRIMARY KEY (id)

### Check Constraints
- `eva_event_log_status_check`: CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'suppressed'::text])))
- `eva_event_log_trigger_source_check`: CHECK ((trigger_source = ANY (ARRAY['realtime'::text, 'cron'::text, 'manual'::text])))

## Indexes

- `eva_event_log_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_event_log_pkey ON public.eva_event_log USING btree (id)
  ```
- `idx_eva_event_log_correlation`
  ```sql
  CREATE INDEX idx_eva_event_log_correlation ON public.eva_event_log USING btree (correlation_id)
  ```
- `idx_eva_event_log_created`
  ```sql
  CREATE INDEX idx_eva_event_log_created ON public.eva_event_log USING btree (created_at DESC)
  ```
- `idx_eva_event_log_dfe_events`
  ```sql
  CREATE INDEX idx_eva_event_log_dfe_events ON public.eva_event_log USING btree (event_type, created_at DESC) WHERE (event_type ~~ 'dfe.%'::text)
  ```
- `idx_eva_event_log_job`
  ```sql
  CREATE INDEX idx_eva_event_log_job ON public.eva_event_log USING btree (job_name) WHERE (job_name IS NOT NULL)
  ```
- `idx_eva_event_log_status`
  ```sql
  CREATE INDEX idx_eva_event_log_status ON public.eva_event_log USING btree (status)
  ```
- `idx_eva_event_log_type`
  ```sql
  CREATE INDEX idx_eva_event_log_type ON public.eva_event_log USING btree (event_type)
  ```
- `idx_eva_event_log_venture`
  ```sql
  CREATE INDEX idx_eva_event_log_venture ON public.eva_event_log USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```

## RLS Policies

### 1. eva_event_log_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_event_log_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
