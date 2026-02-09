# agent_relationships Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-09T02:01:10.216Z
**Rows**: 2
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| from_agent_id | `uuid` | **NO** | - | - |
| to_agent_id | `uuid` | **NO** | - | - |
| relationship_type | `character varying(50)` | **NO** | - | - |
| delegation_scope | `jsonb` | YES | `'{}'::jsonb` | - |
| communication_channel | `character varying(50)` | YES | `'task_contract'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `agent_relationships_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_relationships_from_agent_id_fkey`: from_agent_id → agent_registry(id)
- `agent_relationships_to_agent_id_fkey`: to_agent_id → agent_registry(id)

### Unique Constraints
- `agent_relationships_unique`: UNIQUE (from_agent_id, to_agent_id, relationship_type)

### Check Constraints
- `agent_relationships_communication_channel_check`: CHECK (((communication_channel)::text = ANY ((ARRAY['task_contract'::character varying, 'message_queue'::character varying, 'direct'::character varying])::text[])))
- `agent_relationships_relationship_type_check`: CHECK (((relationship_type)::text = ANY ((ARRAY['reports_to'::character varying, 'delegates_to'::character varying, 'coordinates_with'::character varying, 'supervises'::character varying, 'shares_knowledge'::character varying])::text[])))

## Indexes

- `agent_relationships_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_relationships_pkey ON public.agent_relationships USING btree (id)
  ```
- `agent_relationships_unique`
  ```sql
  CREATE UNIQUE INDEX agent_relationships_unique ON public.agent_relationships USING btree (from_agent_id, to_agent_id, relationship_type)
  ```
- `idx_relationships_from`
  ```sql
  CREATE INDEX idx_relationships_from ON public.agent_relationships USING btree (from_agent_id)
  ```
- `idx_relationships_to`
  ```sql
  CREATE INDEX idx_relationships_to ON public.agent_relationships USING btree (to_agent_id)
  ```
- `idx_relationships_type_from`
  ```sql
  CREATE INDEX idx_relationships_type_from ON public.agent_relationships USING btree (relationship_type, from_agent_id)
  ```

## RLS Policies

### 1. service_role_all_relationships (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
