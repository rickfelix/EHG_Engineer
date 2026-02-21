# leo_sub_agent_triggers Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-21T07:38:02.749Z
**Rows**: 490
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sub_agent_id | `character varying(50)` | **NO** | - | - |
| trigger_phrase | `text` | **NO** | - | - |
| trigger_type | `text` | YES | - | - |
| priority | `integer(32)` | YES | `0` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| trigger_context | `character varying(50)` | YES | - | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `leo_sub_agent_triggers_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_sub_agent_triggers_sub_agent_id_fkey`: sub_agent_id → leo_sub_agents(id)

### Check Constraints
- `leo_sub_agent_triggers_trigger_type_check`: CHECK ((trigger_type = ANY (ARRAY['keyword'::text, 'pattern'::text, 'regex'::text])))

## Indexes

- `idx_design_triggers_active`
  ```sql
  CREATE INDEX idx_design_triggers_active ON public.leo_sub_agent_triggers USING btree (sub_agent_id, active) WHERE (active = true)
  ```
- `idx_design_triggers_context`
  ```sql
  CREATE INDEX idx_design_triggers_context ON public.leo_sub_agent_triggers USING btree (sub_agent_id, trigger_context)
  ```
- `idx_design_triggers_priority`
  ```sql
  CREATE INDEX idx_design_triggers_priority ON public.leo_sub_agent_triggers USING btree (sub_agent_id, priority DESC)
  ```
- `leo_sub_agent_triggers_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_sub_agent_triggers_pkey ON public.leo_sub_agent_triggers USING btree (id)
  ```

## RLS Policies

### 1. Anon users can read sub_agent_triggers (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_leo_sub_agent_triggers (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_leo_sub_agent_triggers (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
