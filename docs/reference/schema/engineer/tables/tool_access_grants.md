# tool_access_grants Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-06T17:27:38.102Z
**Rows**: 1
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| agent_id | `uuid` | **NO** | - | - |
| tool_id | `uuid` | **NO** | - | - |
| grant_type | `character varying(20)` | **NO** | `'direct'::character varying` | - |
| granted_by | `uuid` | YES | - | - |
| daily_usage_limit | `integer(32)` | YES | - | - |
| usage_count_today | `integer(32)` | YES | `0` | - |
| valid_from | `timestamp with time zone` | YES | `now()` | - |
| valid_until | `timestamp with time zone` | YES | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `tool_access_grants_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `tool_access_grants_agent_id_fkey`: agent_id → agent_registry(id)
- `tool_access_grants_granted_by_fkey`: granted_by → agent_registry(id)
- `tool_access_grants_tool_id_fkey`: tool_id → tool_registry(id)

### Unique Constraints
- `tool_access_grants_unique`: UNIQUE (agent_id, tool_id)

### Check Constraints
- `tool_access_grants_grant_type_check`: CHECK (((grant_type)::text = ANY ((ARRAY['direct'::character varying, 'inherited'::character varying, 'temporary'::character varying])::text[])))

## Indexes

- `idx_grants_agent`
  ```sql
  CREATE INDEX idx_grants_agent ON public.tool_access_grants USING btree (agent_id)
  ```
- `idx_grants_tool`
  ```sql
  CREATE INDEX idx_grants_tool ON public.tool_access_grants USING btree (tool_id)
  ```
- `tool_access_grants_pkey`
  ```sql
  CREATE UNIQUE INDEX tool_access_grants_pkey ON public.tool_access_grants USING btree (id)
  ```
- `tool_access_grants_unique`
  ```sql
  CREATE UNIQUE INDEX tool_access_grants_unique ON public.tool_access_grants USING btree (agent_id, tool_id)
  ```

## RLS Policies

### 1. service_role_all_grants (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
