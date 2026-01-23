# crewai_flow_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-01-23T14:55:13.865Z
**Rows**: 3
**RLS**: Enabled (4 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (16 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| template_key | `character varying(100)` | **NO** | - | - |
| template_name | `character varying(200)` | **NO** | - | - |
| description | `text` | YES | - | - |
| category | `character varying(50)` | YES | - | - |
| template_definition | `jsonb` | **NO** | - | - |
| required_parameters | `jsonb` | YES | - | - |
| is_official | `boolean` | YES | `false` | - |
| usage_count | `integer(32)` | YES | `0` | - |
| rating_average | `numeric(3,2)` | YES | - | - |
| rating_count | `integer(32)` | YES | `0` | - |
| created_by | `uuid` | YES | - | - |
| created_at | `timestamp with time zone` | YES | `now()` | - |
| updated_at | `timestamp with time zone` | YES | `now()` | - |
| metadata | `jsonb` | YES | - | - |
| tags | `ARRAY` | YES | `ARRAY[]::text[]` | - |

## Constraints

### Primary Key
- `crewai_flow_templates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `crewai_flow_templates_template_key_key`: UNIQUE (template_key)

## Indexes

- `crewai_flow_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX crewai_flow_templates_pkey ON public.crewai_flow_templates USING btree (id)
  ```
- `crewai_flow_templates_template_key_key`
  ```sql
  CREATE UNIQUE INDEX crewai_flow_templates_template_key_key ON public.crewai_flow_templates USING btree (template_key)
  ```
- `idx_flow_templates_category`
  ```sql
  CREATE INDEX idx_flow_templates_category ON public.crewai_flow_templates USING btree (category)
  ```
- `idx_flow_templates_is_official`
  ```sql
  CREATE INDEX idx_flow_templates_is_official ON public.crewai_flow_templates USING btree (is_official)
  ```
- `idx_flow_templates_tags`
  ```sql
  CREATE INDEX idx_flow_templates_tags ON public.crewai_flow_templates USING gin (tags)
  ```

## RLS Policies

### 1. Allow authenticated users to delete crewai_flow_templates (DELETE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = created_by)`

### 2. Allow authenticated users to update crewai_flow_templates (UPDATE)

- **Roles**: {authenticated}
- **Using**: `(auth.uid() = created_by)`
- **With Check**: `(auth.uid() = created_by)`

### 3. Allow service_role to manage crewai_flow_templates (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

### 4. crewai_flow_templates_service_role_access (ALL)

- **Roles**: {authenticated}
- **Using**: `fn_is_service_role()`
- **With Check**: `fn_is_service_role()`

## Triggers

### templates_updated_at

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
