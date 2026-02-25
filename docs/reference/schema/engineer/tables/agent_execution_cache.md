# agent_execution_cache Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-25T20:22:28.434Z
**Rows**: 3
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| cache_key | `text` | **NO** | - | - |
| agent_code | `text` | **NO** | - | - |
| operation_type | `text` | **NO** | - | - |
| result | `jsonb` | **NO** | - | - |
| metadata | `jsonb` | YES | - | - |
| ttl_seconds | `integer(32)` | **NO** | - | - |
| created_at | `timestamp without time zone` | YES | `now()` | - |
| expires_at | `timestamp without time zone` | YES | - | - |
| hit_count | `integer(32)` | YES | `0` | - |
| last_accessed | `timestamp without time zone` | YES | `now()` | - |
| invalidated | `boolean` | YES | `false` | - |
| invalidated_at | `timestamp without time zone` | YES | - | - |
| invalidation_reason | `text` | YES | - | - |

## Constraints

### Primary Key
- `agent_execution_cache_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `agent_execution_cache_cache_key_key`: UNIQUE (cache_key)

## Indexes

- `agent_execution_cache_cache_key_key`
  ```sql
  CREATE UNIQUE INDEX agent_execution_cache_cache_key_key ON public.agent_execution_cache USING btree (cache_key)
  ```
- `agent_execution_cache_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_execution_cache_pkey ON public.agent_execution_cache USING btree (id)
  ```
- `idx_cache_agent`
  ```sql
  CREATE INDEX idx_cache_agent ON public.agent_execution_cache USING btree (agent_code)
  ```
- `idx_cache_expires`
  ```sql
  CREATE INDEX idx_cache_expires ON public.agent_execution_cache USING btree (expires_at) WHERE (NOT invalidated)
  ```
- `idx_cache_key`
  ```sql
  CREATE INDEX idx_cache_key ON public.agent_execution_cache USING btree (cache_key) WHERE (NOT invalidated)
  ```
- `idx_cache_operation`
  ```sql
  CREATE INDEX idx_cache_operation ON public.agent_execution_cache USING btree (operation_type)
  ```

## RLS Policies

### 1. authenticated_read_agent_execution_cache (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_execution_cache (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### compute_cache_expiry_trigger

- **Timing**: BEFORE INSERT
- **Action**: `EXECUTE FUNCTION compute_cache_expiry()`

### compute_cache_expiry_trigger

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION compute_cache_expiry()`

---

[← Back to Schema Overview](../database-schema-overview.md)
