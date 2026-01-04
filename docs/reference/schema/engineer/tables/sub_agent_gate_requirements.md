# sub_agent_gate_requirements Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T22:58:02.355Z
**Rows**: 13
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| context_type | `text` | **NO** | - | - |
| trigger_condition | `text` | **NO** | - | - |
| required_sub_agents | `ARRAY` | **NO** | - | - |
| gate_priority | `integer(32)` | YES | `1` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `sub_agent_gate_requirements_pkey`: PRIMARY KEY (id)

## Indexes

- `sub_agent_gate_requirements_pkey`
  ```sql
  CREATE UNIQUE INDEX sub_agent_gate_requirements_pkey ON public.sub_agent_gate_requirements USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_sub_agent_gate_requirements (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_sub_agent_gate_requirements (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
