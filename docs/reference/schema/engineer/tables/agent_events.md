# agent_events Table


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-26
- **Tags**: database, schema, rls, protocol

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-26T04:26:11.529Z
**Rows**: 22
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| event_id | `text` | **NO** | - | - |
| timestamp | `timestamp without time zone` | YES | `now()` | - |
| agent_code | `text` | **NO** | - | - |
| phase | `text` | YES | - | - |
| sd_id | `text` | YES | - | - |
| prd_id | `text` | YES | - | - |
| event_type | `text` | **NO** | - | - |
| action | `text` | **NO** | - | - |
| payload | `jsonb` | **NO** | - | - |
| target_agents | `ARRAY` | YES | - | - |
| priority | `text` | YES | - | - |
| requires_acknowledgment | `boolean` | YES | `false` | - |
| acknowledged_by | `ARRAY` | YES | - | - |
| responses | `jsonb` | YES | - | - |
| outcome | `text` | YES | - | - |

## Constraints

### Primary Key
- `agent_events_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `agent_events_event_id_key`: UNIQUE (event_id)

### Check Constraints
- `agent_events_event_type_check`: CHECK ((event_type = ANY (ARRAY['ANALYSIS_START'::text, 'ANALYSIS_COMPLETE'::text, 'FINDING_DETECTED'::text, 'PATTERN_IDENTIFIED'::text, 'VALIDATION_PASSED'::text, 'VALIDATION_FAILED'::text, 'HANDOFF_CREATED'::text, 'CONSENSUS_REQUIRED'::text, 'HUMAN_REVIEW_REQUIRED'::text, 'ERROR'::text, 'WARNING'::text, 'CHECKPOINT'::text, 'RECOVERY'::text])))
- `agent_events_priority_check`: CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text])))

## Indexes

- `agent_events_event_id_key`
  ```sql
  CREATE UNIQUE INDEX agent_events_event_id_key ON public.agent_events USING btree (event_id)
  ```
- `agent_events_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_events_pkey ON public.agent_events USING btree (id)
  ```
- `idx_events_agent`
  ```sql
  CREATE INDEX idx_events_agent ON public.agent_events USING btree (agent_code)
  ```
- `idx_events_checkpoint`
  ```sql
  CREATE INDEX idx_events_checkpoint ON public.agent_events USING btree (event_type, ((payload ->> 'checkpointId'::text))) WHERE (event_type = 'CHECKPOINT'::text)
  ```
- `idx_events_event_id`
  ```sql
  CREATE INDEX idx_events_event_id ON public.agent_events USING btree (event_id)
  ```
- `idx_events_prd_id`
  ```sql
  CREATE INDEX idx_events_prd_id ON public.agent_events USING btree (prd_id)
  ```
- `idx_events_priority`
  ```sql
  CREATE INDEX idx_events_priority ON public.agent_events USING btree (priority)
  ```
- `idx_events_sd_id`
  ```sql
  CREATE INDEX idx_events_sd_id ON public.agent_events USING btree (sd_id)
  ```
- `idx_events_timestamp`
  ```sql
  CREATE INDEX idx_events_timestamp ON public.agent_events USING btree ("timestamp" DESC)
  ```
- `idx_events_type`
  ```sql
  CREATE INDEX idx_events_type ON public.agent_events USING btree (event_type)
  ```

## RLS Policies

### 1. authenticated_read_agent_events (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_events (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
