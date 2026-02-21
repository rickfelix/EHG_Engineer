# eva_orchestration_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T15:06:05.923Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| event_id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `text` | **NO** | - | Type of orchestration event (stage_completed, escalation, dfe_triggered, etc.) |
| event_source | `text` | **NO** | `'eva_orchestrator'::text` | Source system/agent that generated the event |
| venture_id | `uuid` | YES | - | - |
| event_data | `jsonb` | **NO** | `'{}'::jsonb` | JSONB payload with event-specific data (venture_name, stage_number, scores, etc.) |
| chairman_flagged | `boolean` | **NO** | `false` | Whether this event requires Chairman attention (highlighted in Event Feed) |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `eva_orchestration_events_pkey`: PRIMARY KEY (event_id)

### Foreign Keys
- `eva_orchestration_events_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `chk_event_type`: CHECK ((event_type = ANY (ARRAY['stage_completed'::text, 'stage_started'::text, 'decision_requested'::text, 'decision_resolved'::text, 'escalation'::text, 'dfe_triggered'::text, 'agent_communication'::text, 'health_score_changed'::text, 'venture_created'::text, 'venture_status_changed'::text, 'chairman_override'::text, 'gate_passed'::text, 'gate_failed'::text, 'custom'::text])))

## Indexes

- `eva_orchestration_events_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_orchestration_events_pkey ON public.eva_orchestration_events USING btree (event_id)
  ```
- `idx_eva_orch_events_created`
  ```sql
  CREATE INDEX idx_eva_orch_events_created ON public.eva_orchestration_events USING btree (created_at DESC)
  ```
- `idx_eva_orch_events_flagged`
  ```sql
  CREATE INDEX idx_eva_orch_events_flagged ON public.eva_orchestration_events USING btree (chairman_flagged, created_at DESC) WHERE (chairman_flagged = true)
  ```
- `idx_eva_orch_events_type`
  ```sql
  CREATE INDEX idx_eva_orch_events_type ON public.eva_orchestration_events USING btree (event_type)
  ```
- `idx_eva_orch_events_venture`
  ```sql
  CREATE INDEX idx_eva_orch_events_venture ON public.eva_orchestration_events USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```

## RLS Policies

### 1. eva_orch_events_auth_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. eva_orch_events_service_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
