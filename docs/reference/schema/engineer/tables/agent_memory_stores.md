# agent_memory_stores Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-13T02:06:16.124Z
**Rows**: 0
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | **NO** | - | - |
| memory_type | `character varying(50)` | **NO** | - | - |
| content | `jsonb` | **NO** | `'{}'::jsonb` | - |
| summary | `text` | YES | - | - |
| embedding | `USER-DEFINED` | YES | - | - |
| version | `integer(32)` | **NO** | `1` | - |
| is_current | `boolean` | **NO** | `true` | - |
| parent_version_id | `uuid` | YES | - | - |
| importance_score | `double precision(53)` | YES | `0.5` | - |
| expires_at | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| venture_id | `uuid` | YES | - | INDUSTRIAL-HARDENING-v2.9.0: Venture isolation partition key.
All memory queries MUST filter by venture_id to prevent cross-contamination.
MedSync memory MUST NOT be visible to LogiFlow agents. |

## Constraints

### Primary Key
- `agent_memory_stores_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_memory_stores_agent_id_fkey`: agent_id → agent_registry(id)
- `agent_memory_stores_parent_version_id_fkey`: parent_version_id → agent_memory_stores(id)
- `agent_memory_stores_venture_id_fkey`: venture_id → ventures(id)

### Check Constraints
- `agent_memory_stores_importance_score_check`: CHECK (((importance_score >= (0)::double precision) AND (importance_score <= (1)::double precision)))
- `agent_memory_stores_memory_type_check`: CHECK (((memory_type)::text = ANY ((ARRAY['context'::character varying, 'decisions'::character varying, 'learnings'::character varying, 'preferences'::character varying])::text[])))

## Indexes

- `agent_memory_stores_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_memory_stores_pkey ON public.agent_memory_stores USING btree (id)
  ```
- `idx_agent_memory_stores_venture`
  ```sql
  CREATE INDEX idx_agent_memory_stores_venture ON public.agent_memory_stores USING btree (venture_id, agent_id, memory_type)
  ```
- `idx_memory_agent_current`
  ```sql
  CREATE INDEX idx_memory_agent_current ON public.agent_memory_stores USING btree (agent_id) WHERE (is_current = true)
  ```
- `idx_memory_importance`
  ```sql
  CREATE INDEX idx_memory_importance ON public.agent_memory_stores USING btree (agent_id, importance_score DESC) WHERE (is_current = true)
  ```

## RLS Policies

### 1. service_role_all_memory (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_memory_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
