# retrospective_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: /mnt/c/_EHG/EHG_Engineer/
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-04T20:01:25.156Z
**Rows**: 2
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in /mnt/c/_EHG/EHG_Engineer/

---

## Columns (13 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| template_name | `text` | **NO** | - | - |
| template_type | `text` | **NO** | - | - |
| description | `text` | YES | - | - |
| sections | `jsonb` | **NO** | - | - |
| questions | `jsonb` | YES | - | - |
| metrics_to_capture | `jsonb` | YES | - | - |
| trigger_conditions | `jsonb` | YES | - | - |
| required_participants | `ARRAY` | YES | - | - |
| is_active | `boolean` | YES | `true` | - |
| version | `integer(32)` | YES | `1` | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |

## Constraints

### Primary Key
- `retrospective_templates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `retrospective_templates_template_name_key`: UNIQUE (template_name)

## Indexes

- `retrospective_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX retrospective_templates_pkey ON public.retrospective_templates USING btree (id)
  ```
- `retrospective_templates_template_name_key`
  ```sql
  CREATE UNIQUE INDEX retrospective_templates_template_name_key ON public.retrospective_templates USING btree (template_name)
  ```

## RLS Policies

### 1. authenticated_read_retrospective_templates (SELECT)

- **Roles**: {authenticated}
- **Using**: `true`

### 2. service_role_all_retrospective_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
