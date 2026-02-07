# agent_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T01:44:48.165Z
**Rows**: 7
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (21 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_type | `character varying(50)` | **NO** | - | - |
| agent_role | `character varying(100)` | YES | - | - |
| display_name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| parent_agent_id | `uuid` | YES | - | - |
| hierarchy_level | `smallint(16)` | **NO** | - | - |
| hierarchy_path | `USER-DEFINED` | **NO** | - | - |
| venture_id | `uuid` | YES | - | - |
| portfolio_id | `uuid` | YES | - | - |
| capabilities | `ARRAY` | YES | `'{}'::text[]` | - |
| tool_access | `ARRAY` | YES | `'{}'::text[]` | - |
| delegation_authority | `jsonb` | YES | `'{}'::jsonb` | - |
| token_budget | `bigint(64)` | YES | `0` | - |
| token_consumed | `bigint(64)` | YES | `0` | - |
| context_window_id | `uuid` | YES | - | - |
| knowledge_base_ids | `ARRAY` | YES | `'{}'::uuid[]` | - |
| status | `character varying(20)` | **NO** | `'active'::character varying` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |
| created_by | `uuid` | YES | - | - |

## Constraints

### Primary Key
- `agent_registry_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `agent_registry_parent_agent_id_fkey`: parent_agent_id → agent_registry(id)
- `agent_registry_portfolio_id_fkey`: portfolio_id → portfolios(id)
- `agent_registry_venture_id_fkey`: venture_id → ventures(id)

### Unique Constraints
- `agent_registry_hierarchy_path_unique`: UNIQUE (hierarchy_path)

### Check Constraints
- `agent_registry_agent_type_check`: CHECK (((agent_type)::text = ANY ((ARRAY['chairman'::character varying, 'eva'::character varying, 'venture_ceo'::character varying, 'executive'::character varying, 'crew'::character varying])::text[])))
- `agent_registry_hierarchy_level_check`: CHECK (((hierarchy_level >= 1) AND (hierarchy_level <= 5)))
- `agent_registry_status_check`: CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'terminated'::character varying, 'standby'::character varying])::text[])))
- `agent_registry_wellknown_protection`: CHECK ((((id <> '00000000-0000-0000-0000-000000000001'::uuid) OR ((agent_type)::text = 'chairman'::text)) AND ((id <> '00000000-0000-0000-0000-000000000002'::uuid) OR ((agent_type)::text = 'eva'::text))))

## Indexes

- `agent_registry_hierarchy_path_unique`
  ```sql
  CREATE UNIQUE INDEX agent_registry_hierarchy_path_unique ON public.agent_registry USING btree (hierarchy_path)
  ```
- `agent_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_registry_pkey ON public.agent_registry USING btree (id)
  ```
- `idx_agent_registry_hierarchy`
  ```sql
  CREATE INDEX idx_agent_registry_hierarchy ON public.agent_registry USING gist (hierarchy_path)
  ```
- `idx_agent_registry_parent`
  ```sql
  CREATE INDEX idx_agent_registry_parent ON public.agent_registry USING btree (parent_agent_id)
  ```
- `idx_agent_registry_type`
  ```sql
  CREATE INDEX idx_agent_registry_type ON public.agent_registry USING btree (agent_type)
  ```
- `idx_agent_registry_venture_status`
  ```sql
  CREATE INDEX idx_agent_registry_venture_status ON public.agent_registry USING btree (venture_id, status) WHERE ((venture_id IS NOT NULL) AND ((status)::text = 'active'::text))
  ```

## RLS Policies

### 1. chairman_read_agents (SELECT)

- **Roles**: {authenticated}
- **Using**: `fn_is_chairman()`

### 2. service_role_all_agent_registry (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_agent_registry_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
