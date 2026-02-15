# eva_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T00:39:41.914Z
**Rows**: 0
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| eva_venture_id | `uuid` | YES | - | - |
| event_type | `text` | **NO** | - | - |
| event_source | `text` | **NO** | `'system'::text` | - |
| event_data | `jsonb` | YES | `'{}'::jsonb` | - |
| processed | `boolean` | YES | `false` | - |
| processed_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| trace_id | `uuid` | YES | - | - |
| retry_count | `integer(32)` | YES | `0` | - |
| idempotency_key | `text` | YES | - | - |
| last_error | `text` | YES | - | - |

## Constraints

### Primary Key
- `eva_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_events_eva_venture_id_fkey`: eva_venture_id → eva_ventures(id)

### Check Constraints
- `eva_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['metric_update'::text, 'health_change'::text, 'decision_required'::text, 'alert_triggered'::text, 'automation_executed'::text, 'status_change'::text, 'milestone_reached'::text, 'risk_detected'::text, 'user_action'::text, 'stage_processing_started'::text, 'stage_processing_completed'::text, 'stage_processing_started'::text, 'stage_processing_failed'::text, 'stage.completed'::text, 'decision.submitted'::text, 'gate.evaluated'::text, 'sd.completed'::text])))

## Indexes

- `eva_events_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_events_pkey ON public.eva_events USING btree (id)
  ```
- `idx_eva_events_idempotency_key`
  ```sql
  CREATE UNIQUE INDEX idx_eva_events_idempotency_key ON public.eva_events USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
  ```
- `idx_eva_events_trace_id`
  ```sql
  CREATE INDEX idx_eva_events_trace_id ON public.eva_events USING btree (trace_id) WHERE (trace_id IS NOT NULL)
  ```
- `idx_eva_events_type`
  ```sql
  CREATE INDEX idx_eva_events_type ON public.eva_events USING btree (event_type)
  ```
- `idx_eva_events_unprocessed`
  ```sql
  CREATE INDEX idx_eva_events_unprocessed ON public.eva_events USING btree (processed) WHERE (processed = false)
  ```
- `idx_eva_events_venture`
  ```sql
  CREATE INDEX idx_eva_events_venture ON public.eva_events USING btree (eva_venture_id)
  ```

## RLS Policies

### 1. eva_events_select_user_ventures (SELECT)

- **Roles**: {authenticated}
- **Using**: `(eva_venture_id IN ( SELECT ev.id
   FROM (eva_ventures ev
     JOIN ventures v ON ((ev.venture_id = v.id)))
  WHERE (v.created_by = auth.uid())))`

### 2. eva_events_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 3. service_role_all_eva_events (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
