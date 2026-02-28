# team_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-28T03:30:25.261Z
**Rows**: 3
**RLS**: Enabled (3 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (9 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `character varying(50)` | **NO** | - | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| roles | `jsonb` | **NO** | - | Array of role definitions: [{agent_code, role_name, task_template, team_role}] |
| task_structure | `jsonb` | **NO** | - | Array of task definitions: [{subject, description, assignee_role, blocked_by}] |
| leader_agent_code | `character varying(20)` | YES | `'RCA'::character varying` | - |
| active | `boolean` | YES | `true` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | `'{}'::jsonb` | - |

## Constraints

### Primary Key
- `team_templates_pkey`: PRIMARY KEY (id)

## Indexes

- `team_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX team_templates_pkey ON public.team_templates USING btree (id)
  ```

## RLS Policies

### 1. anon_read_team_templates (SELECT)

- **Roles**: {anon}
- **Using**: `true`

### 2. authenticated_read_team_templates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 3. service_role_all_team_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
