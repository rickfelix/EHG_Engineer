# leo_agents Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2025-10-28T12:24:22.172Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (12 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(20)` | **NO** | - | - |
| agent_code | `character varying(10)` | **NO** | - | - |
| name | `character varying(100)` | **NO** | - | - |
| responsibilities | `text` | YES | - | - |
| planning_percentage | `integer(32)` | YES | - | - |
| implementation_percentage | `integer(32)` | YES | - | - |
| verification_percentage | `integer(32)` | YES | - | - |
| approval_percentage | `integer(32)` | YES | - | - |
| total_percentage | `integer(32)` | YES | - | - |
| capabilities | `jsonb` | YES | `'[]'::jsonb` | - |
| constraints | `jsonb` | YES | `'[]'::jsonb` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `leo_agents_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `leo_agents_agent_code_key`: UNIQUE (agent_code)

### Check Constraints
- `leo_agents_agent_code_check`: CHECK (((agent_code)::text = ANY ((ARRAY['LEAD'::character varying, 'PLAN'::character varying, 'EXEC'::character varying])::text[])))

## Indexes

- `leo_agents_agent_code_key`
  ```sql
  CREATE UNIQUE INDEX leo_agents_agent_code_key ON public.leo_agents USING btree (agent_code)
  ```
- `leo_agents_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_agents_pkey ON public.leo_agents USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_agents (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_agents (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
