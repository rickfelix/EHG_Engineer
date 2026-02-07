# sd_workflow_templates Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-07T03:59:01.337Z
**Rows**: 12
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (7 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| sd_type | `text` | **NO** | - | - |
| name | `text` | **NO** | - | - |
| is_active | `boolean` | **NO** | `false` | - |
| version | `integer(32)` | **NO** | `1` | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |
| updated_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sd_workflow_templates_pkey`: PRIMARY KEY (id)

### Unique Constraints
- `sd_workflow_templates_sd_type_version_key`: UNIQUE (sd_type, version)

## Indexes

- `idx_sd_workflow_templates_active`
  ```sql
  CREATE UNIQUE INDEX idx_sd_workflow_templates_active ON public.sd_workflow_templates USING btree (sd_type) WHERE (is_active = true)
  ```
- `sd_workflow_templates_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_workflow_templates_pkey ON public.sd_workflow_templates USING btree (id)
  ```
- `sd_workflow_templates_sd_type_version_key`
  ```sql
  CREATE UNIQUE INDEX sd_workflow_templates_sd_type_version_key ON public.sd_workflow_templates USING btree (sd_type, version)
  ```

## RLS Policies

### 1. sd_workflow_templates_read (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. sd_workflow_templates_service (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

## Triggers

### set_updated_at_sd_workflow_templates

- **Timing**: BEFORE UPDATE
- **Action**: `EXECUTE FUNCTION update_updated_at_column()`

---

[← Back to Schema Overview](../database-schema-overview.md)
