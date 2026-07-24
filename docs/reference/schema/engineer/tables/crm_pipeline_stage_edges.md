# crm_pipeline_stage_edges Table

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

## Columns (3 total)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| from_stage | `text` | **NO** | - | - |
| to_stage | `text` | **NO** | - | - |
| case_type | `text` | **NO** | - | - |

## Constraints

### Primary Key
- `crm_pipeline_stage_edges_pkey`: PRIMARY KEY (from_stage, to_stage, case_type)

### Foreign Keys
- `crm_pipeline_stage_edges_from_stage_case_type_fkey`: from_stage → crm_pipeline_stage_defs(stage_key)
- `crm_pipeline_stage_edges_to_stage_case_type_fkey`: to_stage → crm_pipeline_stage_defs(stage_key)

### Check Constraints
- `crm_pipeline_stage_edges_case_type_check`: CHECK ((case_type = ANY (ARRAY['pipeline'::text, 'support'::text])))

## Indexes

- `crm_pipeline_stage_edges_pkey`
  ```sql
  CREATE UNIQUE INDEX crm_pipeline_stage_edges_pkey ON public.crm_pipeline_stage_edges USING btree (from_stage, to_stage, case_type)
  ```

## RLS Policies

### 1. service_role_all (ALL)

- **Roles**: {service_role}
- **Using**: `true`
- **With Check**: `true`

---

[← Back to Schema Overview](../database-schema-overview.md)
