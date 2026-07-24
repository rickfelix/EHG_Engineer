# crm_pipeline_stage_defs Table

**Application**: EHG_Engineer - LEO Protocol Management Dashboard - CONSOLIDATED DB
**Database**: dedlbzhpgkmetvhbkyzq
**Repository**: EHG_Engineer (this repository)
**Purpose**: Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration
**Generated**: 2026-07-24T14:39:36.126Z
**Rows**: 6
**RLS**: Enabled (1 policy)

⚠️ **This is a REFERENCE document** - Query database directly for validation

⚠️ **CRITICAL**: This schema is for **EHG_Engineer** database. Implementations go in EHG_Engineer (this repository)

---

## Columns (4 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| stage_key | `text` | **NO** | - | - |
| case_type | `text` | **NO** | - | - |
| display_name | `text` | **NO** | - | - |
| is_qualified | `boolean` | **NO** | `false` | - |

## Constraints

### Primary Key
- `crm_pipeline_stage_defs_pkey`: PRIMARY KEY (stage_key, case_type)

### Check Constraints
- `crm_pipeline_stage_defs_case_type_check`: CHECK ((case_type = ANY (ARRAY['pipeline'::text, 'support'::text])))

## Indexes

- `crm_pipeline_stage_defs_pkey`
  ```sql
  CREATE UNIQUE INDEX crm_pipeline_stage_defs_pkey ON public.crm_pipeline_stage_defs USING btree (stage_key, case_type)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
