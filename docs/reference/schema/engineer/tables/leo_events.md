# leo_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-16T20:17:30.369Z
**Rows**: 19
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| actor_user_id | `uuid` | YES | - | - |
| actor_type | `text` | **NO** | - | - |
| event_name | `text` | **NO** | - | - |
| entity_type | `text` | **NO** | - | - |
| entity_id | `uuid` | YES | - | - |
| correlation_id | `uuid` | **NO** | - | - |
| request_id | `text` | YES | - | - |
| severity | `text` | **NO** | `'info'::text` | - |
| payload | `jsonb` | **NO** | `'{}'::jsonb` | - |
| pii_level | `text` | **NO** | `'none'::text` | - |
| processed_at | `timestamp with time zone` | YES | - | Timestamp when event was processed by data-plane pipeline. NULL = unprocessed. SD: SD-LEO-SELF-IMPROVE-001L |
| idempotency_key | `text` | YES | - | Optional unique key for idempotent event processing. SD: SD-LEO-SELF-IMPROVE-001L |

## Constraints

### Primary Key
- `leo_events_pkey`: PRIMARY KEY (id)

### Check Constraints
- `leo_events_actor_type_check`: CHECK ((actor_type = ANY (ARRAY['human'::text, 'agent'::text, 'system'::text])))
- `leo_events_entity_type_check`: CHECK ((entity_type = ANY (ARRAY['proposal'::text, 'rubric'::text, 'prioritization_config'::text, 'audit_config'::text, 'feature_flag'::text, 'prompt'::text, 'feedback_intake'::text, 'proposal_creation'::text, 'prioritization'::text, 'execution_enqueue'::text])))
- `leo_events_pii_level_check`: CHECK ((pii_level = ANY (ARRAY['none'::text, 'low'::text, 'high'::text])))
- `leo_events_severity_check`: CHECK ((severity = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text])))

## Indexes

- `idx_leo_events_correlation`
  ```sql
  CREATE INDEX idx_leo_events_correlation ON public.leo_events USING btree (correlation_id)
  ```
- `idx_leo_events_created`
  ```sql
  CREATE INDEX idx_leo_events_created ON public.leo_events USING btree (created_at DESC)
  ```
- `idx_leo_events_entity`
  ```sql
  CREATE INDEX idx_leo_events_entity ON public.leo_events USING btree (entity_type, entity_id, created_at DESC)
  ```
- `idx_leo_events_idempotency_key`
  ```sql
  CREATE UNIQUE INDEX idx_leo_events_idempotency_key ON public.leo_events USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL)
  ```
- `idx_leo_events_payload`
  ```sql
  CREATE INDEX idx_leo_events_payload ON public.leo_events USING gin (payload)
  ```
- `idx_leo_events_processed_at`
  ```sql
  CREATE INDEX idx_leo_events_processed_at ON public.leo_events USING btree (processed_at DESC NULLS LAST)
  ```
- `idx_leo_events_unprocessed`
  ```sql
  CREATE INDEX idx_leo_events_unprocessed ON public.leo_events USING btree (entity_type, created_at DESC) WHERE (processed_at IS NULL)
  ```
- `leo_events_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_events_pkey ON public.leo_events USING btree (id)
  ```

## RLS Policies

### 1. Service role full access to leo_events (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`
- **With Check**: `(auth.role() = 'service_role'::text)`

## Triggers

### trg_leo_events_append_only_delete

- **Timing**: BEFORE DELETE
- **Action**: `EXECUTE FUNCTION leo_events_append_only()`

### trg_leo_events_append_only_update

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION leo_events_append_only()`

---

[← Back to Schema Overview](../database-schema-overview.md)
