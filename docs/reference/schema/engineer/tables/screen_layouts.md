# screen_layouts Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-24T11:45:47.586Z
**Rows**: 1
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| name | `character varying(255)` | **NO** | - | - |
| display_name | `character varying(255)` | YES | - | - |
| description | `text` | YES | - | - |
| layout_type | `character varying(100)` | YES | - | - |
| template_json | `jsonb` | YES | `'{}'::jsonb` | - |
| logic_rules | `jsonb` | YES | `'{}'::jsonb` | - |
| default_settings | `jsonb` | YES | `'{}'::jsonb` | - |
| thumbnail_url | `text` | YES | - | - |
| is_system | `boolean` | YES | `false` | - |
| is_active | `boolean` | YES | `true` | - |
| created_by | `text` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `screen_layouts_pkey`: PRIMARY KEY (id)

## Indexes

- `screen_layouts_pkey`
  ```sql
  CREATE UNIQUE INDEX screen_layouts_pkey ON public.screen_layouts USING btree (id)
  ```

## RLS Policies

### 1. Allow service_role to manage screen_layouts (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 2. Anon read screen_layouts (SELECT)

- **Roles**: {anon}
- **Using**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
