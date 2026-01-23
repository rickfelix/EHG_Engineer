# agent_tools Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T04:03:45.232Z
**Rows**: 8
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (15 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | - | - |
| tool_name | `text` | YES | - | - |
| tool_type | `text` | YES | - | - |
| description | `text` | YES | - | - |
| configuration | `jsonb` | YES | - | - |
| rate_limit_per_minute | `integer(32)` | YES | - | - |
| allowed_agent_roles | `jsonb` | YES | - | - |
| status | `text` | YES | - | - |
| usage_count | `integer(32)` | YES | - | - |
| created_at | `timestamp with time zone` | YES | - | - |
| updated_at | `timestamp with time zone` | YES | - | - |
| tool_class | `text` | YES | - | - |
| parameters_schema | `jsonb` | YES | - | - |
| requires_auth | `boolean` | YES | - | - |
| cost_per_use_usd | `integer(32)` | YES | - | - |

## Constraints

### Primary Key
- `agent_tools_pkey`: PRIMARY KEY (id)

## Indexes

- `agent_tools_pkey`
  ```sql
  CREATE UNIQUE INDEX agent_tools_pkey ON public.agent_tools USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_agent_tools (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_agent_tools (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
