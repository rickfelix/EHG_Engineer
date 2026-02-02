# eva_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-02T04:15:23.892Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

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

## Constraints

### Primary Key
- `eva_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `eva_events_eva_venture_id_fkey`: eva_venture_id → eva_ventures(id)

### Check Constraints
- `eva_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['metric_update'::text, 'health_change'::text, 'decision_required'::text, 'alert_triggered'::text, 'automation_executed'::text, 'status_change'::text, 'milestone_reached'::text, 'risk_detected'::text, 'user_action'::text])))

## Indexes

- `eva_events_pkey`
  ```sql
  CREATE UNIQUE INDEX eva_events_pkey ON public.eva_events USING btree (id)
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

### 1. eva_events_admin_access (ALL)

- **Roles**: {public}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
