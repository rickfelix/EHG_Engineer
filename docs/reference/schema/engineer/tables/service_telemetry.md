# service_telemetry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-16T23:08:53.541Z
**Rows**: 0
**RLS**: Enabled (5 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| task_id | `uuid` | **NO** | - | - |
| venture_id | `uuid` | **NO** | - | - |
| service_id | `uuid` | **NO** | - | - |
| pr_url | `text` | YES | - | - |
| pr_status | `text` | YES | - | - |
| outcomes | `jsonb` | YES | - | Structured metrics: conversion_rate, engagement, bounce_rate, etc. |
| venture_agent_version | `text` | YES | - | - |
| reported_at | `timestamp with time zone` | YES | `now()` | - |
| outcome | `text` | YES | - | - |
| agent_version | `text` | YES | - | - |
| processing_time_ms | `integer(32)` | YES | - | - |
| feedback | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `service_telemetry_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `service_telemetry_service_id_fkey`: service_id → ehg_services(id)
- `service_telemetry_task_id_fkey`: task_id → service_tasks(id)
- `service_telemetry_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `service_telemetry_pr_status_check`: CHECK (((pr_status IS NULL) OR (pr_status = ANY (ARRAY['open'::text, 'merged'::text, 'closed'::text, 'draft'::text]))))

## Indexes

- `idx_service_telemetry_service`
  ```sql
  CREATE INDEX idx_service_telemetry_service ON public.service_telemetry USING btree (service_id, reported_at)
  ```
- `idx_service_telemetry_service_id`
  ```sql
  CREATE INDEX idx_service_telemetry_service_id ON public.service_telemetry USING btree (service_id)
  ```
- `idx_service_telemetry_task`
  ```sql
  CREATE INDEX idx_service_telemetry_task ON public.service_telemetry USING btree (task_id)
  ```
- `idx_service_telemetry_venture`
  ```sql
  CREATE INDEX idx_service_telemetry_venture ON public.service_telemetry USING btree (venture_id, reported_at)
  ```
- `idx_service_telemetry_venture_id`
  ```sql
  CREATE INDEX idx_service_telemetry_venture_id ON public.service_telemetry USING btree (venture_id)
  ```
- `service_telemetry_pkey`
  ```sql
  CREATE UNIQUE INDEX service_telemetry_pkey ON public.service_telemetry USING btree (id)
  ```

## RLS Policies

### 1. service_telemetry_admin (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. service_telemetry_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.id = service_telemetry.venture_id)))`

### 3. service_telemetry_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.id = service_telemetry.venture_id)))`

### 4. telemetry_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 5. telemetry_venture_read (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

---

[← Back to Schema Overview](../database-schema-overview.md)
