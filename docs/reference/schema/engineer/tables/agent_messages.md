# agent_messages Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T02:12:49.098Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (19 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| message_type | `character varying(50)` | **NO** | - | - |
| from_agent_id | `uuid` | **NO** | - | - |
| to_agent_id | `uuid` | **NO** | - | - |
| correlation_id | `uuid` | YES | - | - |
| subject | `character varying(255)` | YES | - | - |
| body | `jsonb` | **NO** | `'{}'::jsonb` | - |
| attachments | `ARRAY` | YES | `'{}'::uuid[]` | - |
| priority | `character varying(20)` | **NO** | `'normal'::character varying` | - |
| requires_response | `boolean` | YES | `false` | - |
| response_deadline | `timestamp with time zone` | YES | - | - |
| responded_at | `timestamp with time zone` | YES | - | - |
| response_message_id | `uuid` | YES | - | - |
| status | `character varying(20)` | **NO** | `'pending'::character varying` | - |
| route_through | `ARRAY` | YES | `'{}'::uuid[]` | - |
| current_position | `integer(32)` | YES | `0` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| delivered_at | `timestamp with time zone` | YES | - | - |
| completed_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `agent_messages_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_messages_from_agent_id_fkey`: from_agent_id → agent_registry(id)
- `agent_messages_response_message_id_fkey`: response_message_id → agent_messages(id)
- `agent_messages_to_agent_id_fkey`: to_agent_id → agent_registry(id)

### Check Constraints
- `agent_messages_message_type_check`: CHECK (((message_type)::text = ANY ((ARRAY['task_delegation'::character varying, 'task_completion'::character varying, 'status_report'::character varying, 'escalation'::character varying, 'coordination'::character varying, 'broadcast'::character varying, 'query'::character varying, 'response'::character varying])::text[])))
- `agent_messages_priority_check`: CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'critical'::character varying])::text[])))
- `agent_messages_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'delivered'::character varying, 'read'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))

## Indexes

- `agent_messages_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_messages_pkey ON public.agent_messages USING btree (id)
  ```
- `idx_messages_correlation`
  ```sql
  CREATE INDEX idx_messages_correlation ON public.agent_messages USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)
  ```
- `idx_messages_from`
  ```sql
  CREATE INDEX idx_messages_from ON public.agent_messages USING btree (from_agent_id)
  ```
- `idx_messages_inbox`
  ```sql
  CREATE INDEX idx_messages_inbox ON public.agent_messages USING btree (to_agent_id, status)
  ```
- `idx_messages_needs_response`
  ```sql
  CREATE INDEX idx_messages_needs_response ON public.agent_messages USING btree (to_agent_id, response_deadline) WHERE ((requires_response = true) AND (responded_at IS NULL))
  ```
- `idx_messages_pending`
  ```sql
  CREATE INDEX idx_messages_pending ON public.agent_messages USING btree (to_agent_id, created_at) WHERE ((status)::text = 'pending'::text)
  ```

## RLS Policies

### 1. service_role_all_messages (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
