# system_events Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-15T04:40:09.724Z
**Rows**: 69
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (23 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_type | `character varying(50)` | **NO** | - | Event category. Values: STAGE_TRANSITION, TOKEN_DEDUCTION, AGENT_ACTION, HANDOFF_PROPOSED, HANDOFF_COMMITTED, DIRECTIVE_ISSUED |
| correlation_id | `uuid` | **NO** | - | Links related events in a single operation. All events from one stage transition share this ID. |
| idempotency_key | `character varying(100)` | **NO** | - | REQUIRED (NOT NULL): Unique key preventing duplicate events. Pattern: <SOURCE>-<VENTURE>-<TYPE>-<ID> e.g., SEED-SOLARA-TRANSITION-1. Enforced by fn_ensure_idempotency_key trigger and NOT NULL constraint. Anti-Gravity Audit Compliance (Pillar 2: Command Engine). |
| agent_id | `uuid` | YES | - | Reference to agent_registry.id. The agent that triggered this event. |
| agent_type | `character varying(50)` | YES | - | Denormalized agent role for query performance. Values: CEO, VP_IDEATION, VP_VALIDATION, ANALYST, REVIEWER |
| token_cost | `integer(32)` | YES | `0` | Tokens consumed by this action. Positive = consumption, Negative = refund. |
| budget_remaining | `integer(32)` | YES | - | Snapshot of venture token budget at event time. Enables budget timeline reconstruction. |
| predicted_outcome | `jsonb` | YES | - | What the agent expected. Schema: { expected_state, confidence, assumptions[] } |
| actual_outcome | `jsonb` | YES | - | What actually happened. Schema: { actual_state, success, notes } |
| calibration_delta | `numeric(5,2)` | YES | - | Variance between predicted and actual (-1.0 to 1.0). NULL until actual_outcome populated. |
| venture_id | `uuid` | YES | - | - |
| stage_id | `integer(32)` | YES | - | - |
| payload | `jsonb` | YES | `'{}'::jsonb` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| resolved_at | `timestamp with time zone` | YES | - | - |
| parent_event_id | `uuid` | YES | - | Links outcome events to prediction events (Event Linking Pattern).  |
| actor_type | `character varying(20)` | YES | - | Accountability: who initiated this event.  |
| actor_role | `character varying(50)` | YES | - | Specific role of actor: CEO, VP_IDEATION, etc.  |
| prd_id | `character varying(50)` | YES | - | Foreign key to product_requirements_v2. Links events to specific PRD context for governance tracking. |
| sd_id | `text` | YES | - | Strategic Directive identifier (e.g., SD-PARENT-4.0, SD-HARDENING-V2-002C). Links events to strategic context for governance tracking. |
| directive_context | `jsonb` | YES | `'{}'::jsonb` | Additional governance metadata. Schema: { phase: "LEAD|PLAN|EXEC", priority: number, tags: string[], notes: string } |
| details | `jsonb` | YES | - | JSONB column for storing event metadata, added for E2E test support |

## Constraints

### Primary Key
- `system_events_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `system_events_parent_event_id_fkey`: parent_event_id → system_events(id)
- `system_events_prd_id_fkey`: prd_id → product_requirements_v2(id)

### Unique Constraints
- `system_events_idempotency_key_key`: UNIQUE (idempotency_key)

### Check Constraints
- `system_events_actor_type_check`: CHECK (((actor_type)::text = ANY ((ARRAY['human'::character varying, 'agent'::character varying, 'system'::character varying])::text[])))

## Indexes

- `idx_system_events_actor_type`
  ```sql
  CREATE INDEX idx_system_events_actor_type ON public.system_events USING btree (actor_type) WHERE (actor_type IS NOT NULL)
  ```
- `idx_system_events_agent_id`
  ```sql
  CREATE INDEX idx_system_events_agent_id ON public.system_events USING btree (agent_id) WHERE (agent_id IS NOT NULL)
  ```
- `idx_system_events_correlation_id`
  ```sql
  CREATE INDEX idx_system_events_correlation_id ON public.system_events USING btree (correlation_id) WHERE (correlation_id IS NOT NULL)
  ```
- `idx_system_events_created_at`
  ```sql
  CREATE INDEX idx_system_events_created_at ON public.system_events USING btree (created_at DESC)
  ```
- `idx_system_events_event_type`
  ```sql
  CREATE INDEX idx_system_events_event_type ON public.system_events USING btree (event_type)
  ```
- `idx_system_events_governance`
  ```sql
  CREATE INDEX idx_system_events_governance ON public.system_events USING btree (event_type, prd_id, sd_id) WHERE ((prd_id IS NOT NULL) OR (sd_id IS NOT NULL))
  ```
- `idx_system_events_parent_event_id`
  ```sql
  CREATE INDEX idx_system_events_parent_event_id ON public.system_events USING btree (parent_event_id) WHERE (parent_event_id IS NOT NULL)
  ```
- `idx_system_events_prd_id`
  ```sql
  CREATE INDEX idx_system_events_prd_id ON public.system_events USING btree (prd_id) WHERE (prd_id IS NOT NULL)
  ```
- `idx_system_events_sd_id`
  ```sql
  CREATE INDEX idx_system_events_sd_id ON public.system_events USING btree (sd_id) WHERE (sd_id IS NOT NULL)
  ```
- `idx_system_events_venture_id`
  ```sql
  CREATE INDEX idx_system_events_venture_id ON public.system_events USING btree (venture_id) WHERE (venture_id IS NOT NULL)
  ```
- `idx_system_events_venture_time`
  ```sql
  CREATE INDEX idx_system_events_venture_time ON public.system_events USING btree (venture_id, created_at DESC) WHERE (venture_id IS NOT NULL)
  ```
- `system_events_idempotency_key_key`
  ```sql
  CREATE UNIQUE INDEX system_events_idempotency_key_key ON public.system_events USING btree (idempotency_key)
  ```
- `system_events_pkey`
  ```sql
  CREATE UNIQUE INDEX system_events_pkey ON public.system_events USING btree (id)
  ```

## RLS Policies

### 1. system_events_anon_select (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. system_events_authenticated_select (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. system_events_service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_doctrine_system_events

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_doctrine_on_system_events()`

### trg_enforce_dual_domain_governance

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION enforce_dual_domain_governance()`

### trg_enforce_dual_domain_governance

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION enforce_dual_domain_governance()`

### trg_ensure_idempotency

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION fn_ensure_idempotency_key()`

---

[← Back to Schema Overview](../database-schema-overview.md)
