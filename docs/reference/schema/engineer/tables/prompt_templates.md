# prompt_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-12T05:02:16.883Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| description | `text` | YES | - | - |
| category | `character varying(100)` | YES | - | - |
| content | `text` | **NO** | - | - |
| variables | `jsonb` | YES | `'[]'::jsonb` | - |
| tags | `jsonb` | YES | `'[]'::jsonb` | - |
| agent_roles | `jsonb` | YES | `'[]'::jsonb` | - |
| version | `integer(32)` | YES | `1` | - |
| parent_version_id | `uuid` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| usage_count | `integer(32)` | YES | `0` | - |
| created_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| deleted_at | `timestamp with time zone` | YES | - | - |

## Constraints

### Primary Key
- `prompt_templates_pkey`: PRIMARY KEY (id)

## Indexes

- `prompt_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX prompt_templates_pkey ON public.prompt_templates USING btree (id)
  ```

## RLS Policies

### 1. Allow service_role to manage prompt_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Anon read prompt_templates (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
