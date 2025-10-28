# leo_sub_agent_handoffs Table

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

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `integer(32)` | **NO** | `nextval('leo_sub_agent_handoffs_id_seq'::regclass)` | - |
| sub_agent_id | `character varying(50)` | **NO** | - | - |
| handoff_template | `jsonb` | **NO** | - | - |
| validation_rules | `jsonb` | YES | `'[]'::jsonb` | - |
| required_outputs | `jsonb` | YES | `'[]'::jsonb` | - |
| success_criteria | `jsonb` | YES | `'[]'::jsonb` | - |
| version | `integer(32)` | YES | `1` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp without time zone` | YES | `CURRENT_TIMESTAMP` | - |

## Constraints

### Primary Key
- `leo_sub_agent_handoffs_pkey`: PRIMARY KEY (id)

## Indexes

- `leo_sub_agent_handoffs_pkey`
  ```sql
  CREATE UNIQUE INDEX leo_sub_agent_handoffs_pkey ON public.leo_sub_agent_handoffs USING btree (id)
  ```

## RLS Policies

### 1. authenticated_read_leo_sub_agent_handoffs (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_leo_sub_agent_handoffs (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
