# documentation_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-01T20:29:31.154Z
**Rows**: 0
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (14 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| template_name | `text` | **NO** | - | - |
| template_type | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| required_sections | `jsonb` | **NO** | - | - |
| optional_sections | `jsonb` | YES | `'[]'::jsonb` | - |
| applicable_to_agent | `text` | YES | - | - |
| applicable_to_phase | `text` | YES | - | - |
| template_content | `text` | YES | - | - |
| example_content | `text` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| version | `integer(32)` | YES | `1` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `documentation_templates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `documentation_templates_template_name_key`: UNIQUE (template_name)

### Check Constraints
- `documentation_templates_applicable_to_agent_check`: CHECK ((applicable_to_agent = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text, 'ALL'::text])))

## Indexes

- `documentation_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX documentation_templates_pkey ON public.documentation_templates USING btree (id)
  ```
- `documentation_templates_template_name_key`
  ```sql
  CREATE UNIQUE INDEX documentation_templates_template_name_key ON public.documentation_templates USING btree (template_name)
  ```

## RLS Policies

### 1. authenticated_read_documentation_templates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_documentation_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
