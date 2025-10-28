# feedback_events Table

**Generated**: 2025-10-28T12:15:30.153Z
**Database**: EHG_Engineer (dedlbzhpgkmetvhbkyzq)
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| interaction_id | `uuid` | YES | - | - |
| user_id | `character varying(100)` | YES | - | - |
| event_timestamp | `timestamp with time zone` | **NO** | `now()` | - |
| feedback_type | `character varying(50)` | **NO** | - | - |
| feedback_source | `character varying(50)` | **NO** | - | - |
| feedback_value | `numeric(3,2)` | YES | - | - |
| feedback_category | `character varying(50)` | YES | - | - |
| specific_agent | `character varying(50)` | YES | - | - |
| user_action | `character varying(100)` | YES | - | - |
| time_to_action | `integer(32)` | YES | - | - |
| triggered_adaptation | `boolean` | **NO** | `false` | - |
| adaptation_type | `character varying(50)` | YES | - | - |
| confidence_before | `numeric(3,2)` | YES | - | - |
| confidence_after | `numeric(3,2)` | YES | - | - |
| feedback_metadata | `jsonb` | YES | - | - |

## Constraints

### Primary Key
- `feedback_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `feedback_events_interaction_id_fkey`: interaction_id → interaction_history(id)

## Indexes

- `feedback_events_pkey`
  ```sql
  CREATE UNIQUE INDEX feedback_events_pkey ON public.feedback_events USING btree (id)
  ```
- `idx_agent_feedback`
  ```sql
  CREATE INDEX idx_agent_feedback ON public.feedback_events USING btree (specific_agent, feedback_value DESC, event_timestamp DESC)
  ```
- `idx_feedback_timestamp`
  ```sql
  CREATE INDEX idx_feedback_timestamp ON public.feedback_events USING btree (event_timestamp DESC)
  ```
- `idx_feedback_type`
  ```sql
  CREATE INDEX idx_feedback_type ON public.feedback_events USING btree (feedback_type, feedback_source)
  ```
- `idx_user_feedback`
  ```sql
  CREATE INDEX idx_user_feedback ON public.feedback_events USING btree (user_id, event_timestamp DESC)
  ```

## RLS Policies

### 1. authenticated_read_feedback_events (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_feedback_events (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
