# service_tasks Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-04-16T19:26:31.310Z
**Rows**: 0
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| venture_id | `uuid` | **NO** | - | - |
| service_id | `uuid` | **NO** | - | - |
| task_type | `text` | **NO** | - | - |
| status | `text` | **NO** | `'pending'::text` | - |
| priority | `integer(32)` | YES | `5` | - |
| artifacts | `jsonb` | YES | - | Structured output from service layer, validated against artifact_schema. |
| confidence_score | `numeric(3,2)` | YES | - | 0.00-1.00: drives automation policy (>0.85 auto, 0.5-0.85 review, <0.5 draft). |
| input_params | `jsonb` | **NO** | - | - |
| claimed_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |
| error_message | `text` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `service_tasks_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `service_tasks_service_id_fkey`: service_id → ehg_services(id)
- `service_tasks_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `service_tasks_confidence_check`: CHECK (((confidence_score IS NULL) OR ((confidence_score >= 0.00) AND (confidence_score <= 1.00))))
- `service_tasks_priority_check`: CHECK (((priority >= 1) AND (priority <= 10)))
- `service_tasks_status_check`: CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'completed'::text, 'failed'::text])))

## Indexes

- `idx_service_tasks_polling`
  ```sql
  CREATE INDEX idx_service_tasks_polling ON public.service_tasks USING btree (venture_id, status, priority) WHERE (status = 'pending'::text)
  ```
- `idx_service_tasks_priority`
  ```sql
  CREATE INDEX idx_service_tasks_priority ON public.service_tasks USING btree (venture_id, priority, created_at) WHERE (status = 'pending'::text)
  ```
- `idx_service_tasks_priority_sla`
  ```sql
  CREATE INDEX idx_service_tasks_priority_sla ON public.service_tasks USING btree (status, priority, created_at) WHERE (status = 'pending'::text)
  ```
- `idx_service_tasks_service`
  ```sql
  CREATE INDEX idx_service_tasks_service ON public.service_tasks USING btree (service_id, status)
  ```
- `idx_service_tasks_status`
  ```sql
  CREATE INDEX idx_service_tasks_status ON public.service_tasks USING btree (status, created_at)
  ```
- `idx_service_tasks_venture_pending`
  ```sql
  CREATE INDEX idx_service_tasks_venture_pending ON public.service_tasks USING btree (venture_id, status) WHERE (status = 'pending'::text)
  ```
- `service_tasks_pkey`
  ```sql
  CREATE UNIQUE INDEX service_tasks_pkey ON public.service_tasks USING btree (id)
  ```

## RLS Policies

### 1. service_tasks_admin (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. service_tasks_venture_insert (INSERT)

- **Roles**: {authenticated}
- **With Check**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 3. service_tasks_venture_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

### 4. service_tasks_venture_update (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(venture_id IN ( SELECT ventures.id
   FROM ventures
  WHERE (ventures.created_by = auth.uid())))`

## Triggers

### set_updated_at_service_tasks

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
