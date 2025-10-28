# leo_handoff_templates Table

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

## Columns (10 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_handoff_templates_id_seq'::regclass)` | - |
| from_agent | `character varying(10)` | **NO** | - | - |
| to_agent | `character varying(10)` | **NO** | - | - |
| handoff_type | `character varying(50)` | **NO** | - | - |
| template_structure | `jsonb` | **NO** | - | - |
| required_elements | `jsonb` | YES | `'[]'::jsonb` | - |
| validation_rules | `jsonb` | YES | `'[]'::jsonb` | - |
| active | `boolean` | YES | `true` | - |
| version | `integer(32)` | YES | `1` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `leo_handoff_templates_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `leo_handoff_templates_from_agent_fkey`: from_agent → leo_agents(agent_code)
- `leo_handoff_templates_to_agent_fkey`: to_agent → leo_agents(agent_code)

### Unique Constraints
- `leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key`: UNIQUE (from_agent, to_agent, handoff_type, version)

## Indexes

- `leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key`
  ```sql
  CREATE UNIQUE INDEX leo_handoff_templates_from_agent_to_agent_handoff_type_vers_key ON public.leo_handoff_templates USING btree (from_agent, to_agent, handoff_type, version)
  ```
- `leo_handoff_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_handoff_templates_pkey ON public.leo_handoff_templates USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_handoff_templates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_handoff_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
