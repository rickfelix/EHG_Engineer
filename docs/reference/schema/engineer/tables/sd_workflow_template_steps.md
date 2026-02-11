# sd_workflow_template_steps Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-02-11T15:20:53.824Z
**Rows**: 70
**RLS**: Enabled (2 policies)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (8 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | `uuid` | **NO** | `gen_random_uuid()` | - |
| template_id | `uuid` | **NO** | - | - |
| step_key | `text` | **NO** | - | - |
| step_label | `text` | **NO** | - | - |
| step_order | `integer(32)` | **NO** | - | - |
| weight | `numeric(5,2)` | **NO** | - | - |
| completion_signal | `text` | **NO** | - | - |
| created_at | `timestamp with time zone` | **NO** | `now()` | - |

## Constraints

### Primary Key
- `sd_workflow_template_steps_pkey`: PRIMARY KEY (id)

### Foreign Keys
- `sd_workflow_template_steps_template_id_fkey`: template_id → sd_workflow_templates(id)

### Unique Constraints
- `sd_workflow_template_steps_template_id_step_key_key`: UNIQUE (template_id, step_key)
- `sd_workflow_template_steps_template_id_step_order_key`: UNIQUE (template_id, step_order)

### Check Constraints
- `sd_workflow_template_steps_step_order_check`: CHECK ((step_order >= 1))
- `sd_workflow_template_steps_weight_check`: CHECK (((weight >= (0)::numeric) AND (weight <= (100)::numeric)))

## Indexes

- `sd_workflow_template_steps_pkey`
  ```sql
  CREATE UNIQUE INDEX sd_workflow_template_steps_pkey ON public.sd_workflow_template_steps USING btree (id)
  ```
- `sd_workflow_template_steps_template_id_step_key_key`
  ```sql
  CREATE UNIQUE INDEX sd_workflow_template_steps_template_id_step_key_key ON public.sd_workflow_template_steps USING btree (template_id, step_key)
  ```
- `sd_workflow_template_steps_template_id_step_order_key`
  ```sql
  CREATE UNIQUE INDEX sd_workflow_template_steps_template_id_step_order_key ON public.sd_workflow_template_steps USING btree (template_id, step_order)
  ```

## RLS Policies

### 1. sd_workflow_template_steps_read (SELECT)

- **Roles**: {public}
- **Using**: `true`

### 2. sd_workflow_template_steps_service (ALL)

- **Roles**: {public}
- **Using**: `(auth.role() = 'service_role'::text)`

---

[← Back to Schema Overview](../database-schema-overview.md)
