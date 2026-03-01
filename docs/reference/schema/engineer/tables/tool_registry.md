# tool_registry Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-03-01T00:41:31.291Z
**Rows**: 13
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| tool_name | `character varying(100)` | **NO** | - | - |
| display_name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| tool_category | `character varying(50)` | **NO** | - | - |
| implementation_type | `character varying(50)` | **NO** | - | - |
| implementation_config | `jsonb` | YES | `'{}'::jsonb` | - |
| min_hierarchy_level | `smallint(16)` | YES | `4` | - |
| required_capabilities | `ARRAY` | YES | `'{}'::text[]` | - |
| cost_per_use_usd | `numeric(10,6)` | YES | `0` | - |
| rate_limit_per_minute | `integer(32)` | YES | `60` | - |
| timeout_seconds | `integer(32)` | YES | `30` | - |
| is_available | `boolean` | **NO** | `true` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `tool_registry_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `tool_registry_tool_name_key`: UNIQUE (tool_name)

### Check Constraints
- `tool_registry_implementation_type_check`: CHECK (((implementation_type)::text = ANY ((ARRAY['function'::character varying, 'api'::character varying, 'mcp_server'::character varying, 'crew'::character varying])::text[])))
- `tool_registry_min_hierarchy_level_check`: CHECK (((min_hierarchy_level >= 1) AND (min_hierarchy_level <= 4)))
- `tool_registry_tool_category_check`: CHECK (((tool_category)::text = ANY ((ARRAY['research'::character varying, 'analysis'::character varying, 'generation'::character varying, 'communication'::character varying, 'integration'::character varying, 'database'::character varying, 'monitoring'::character varying])::text[])))

## Indexes

- `idx_tool_capabilities`
  ```sql
  CREATE INDEX idx_tool_capabilities ON public.tool_registry USING gin (required_capabilities)
  ```
- `idx_tool_category_available`
  ```sql
  CREATE INDEX idx_tool_category_available ON public.tool_registry USING btree (tool_category, is_available)
  ```
- `tool_registry_pkey`
  ```sql
  CREATE UNIQUE INDEX tool_registry_pkey ON public.tool_registry USING btree (id)
  ```
- `tool_registry_tool_name_key`
  ```sql
  CREATE UNIQUE INDEX tool_registry_tool_name_key ON public.tool_registry USING btree (tool_name)
  ```

## RLS Policies

### 1. chairman_read_tools (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_tools (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

## Triggers

### trg_tool_registry_updated

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION fn_update_timestamp()`

---

[← Back to Schema Overview](../database-schema-overview.md)
